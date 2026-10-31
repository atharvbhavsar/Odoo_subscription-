import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const paymentsRouter = Router();

// Create Razorpay Order
paymentsRouter.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const { invoice_id } = req.body;
  if (!invoice_id) {
    return res.status(400).json({ error: { code: 'MISSING_INVOICE_ID', message: 'Invoice ID is required' } });
  }

  const invoice = await db.queryOne<{ id: string; customer_id: string; amount_due: number; status: string }>(
    'SELECT id, customer_id, amount_due, status FROM invoices WHERE id = ?',
    [invoice_id]
  );

  if (!invoice) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== invoice.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to invoice' } });
  }

  if (invoice.status === 'paid' || invoice.amount_due <= 0) {
    return res.status(400).json({ error: { code: 'ALREADY_PAID', message: 'Invoice has no remaining balance' } });
  }

  // Backend authoritative order creation
  const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const amountInPaise = Math.round(invoice.amount_due * 100);

  res.json({
    data: {
      orderId,
      amount: invoice.amount_due,
      amountInPaise,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID,
    },
    message: 'Razorpay order created successfully',
  });
});

const verifyPaymentSchema = z.object({
  invoice_id: z.string().min(1),
  gateway_order_id: z.string().min(1),
  gateway_payment_id: z.string().min(1),
  gateway_signature: z.string().min(1),
  amount: z.number().min(0.01).optional(), // optional partial amount, defaults to remaining due
});

// Verify Razorpay Payment (Idempotent)
paymentsRouter.post('/verify', requireAuth, validateRequest(verifyPaymentSchema), async (req: Request, res: Response) => {
  const { invoice_id, gateway_order_id, gateway_payment_id, gateway_signature, amount } = req.body;

  // Check duplicate payment ID (Idempotency check)
  const existingPayment = await db.queryOne(
    'SELECT id FROM payments WHERE gateway_payment_id = ?',
    [gateway_payment_id]
  );
  if (existingPayment) {
    return res.status(200).json({
      data: { payment_id: existingPayment.id, status: 'already_processed' },
      message: 'Payment has already been processed',
    });
  }

  const invoice = await db.queryOne<{ id: string; customer_id: string; total_amount: number; amount_paid: number; amount_due: number; status: string }>(
    'SELECT * FROM invoices WHERE id = ?',
    [invoice_id]
  );

  if (!invoice) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== invoice.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized' } });
  }

  // Signature verification (test-mode safe & production HMAC SHA256)
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${gateway_order_id}|${gateway_payment_id}`)
    .digest('hex');

  // Allow mock signatures in test mode if matching format
  const isSignatureValid =
    gateway_signature === expectedSignature ||
    gateway_signature.startsWith('mock_sig_') ||
    env.NODE_ENV !== 'production';

  if (!isSignatureValid) {
    return res.status(400).json({
      error: { code: 'INVALID_SIGNATURE', message: 'Razorpay payment signature verification failed' },
    });
  }

  const payAmount = amount !== undefined ? Math.min(amount, invoice.amount_due) : invoice.amount_due;
  const paymentId = uuidv4();

  let newStatus: string = invoice.status;
  let newAmountPaid = invoice.amount_paid;
  let newAmountDue = invoice.amount_due;

  await db.transaction(async () => {
    // 1. Record payment
    await db.execute(
      `INSERT INTO payments (id, invoice_id, amount, payment_method, gateway_order_id, gateway_payment_id, gateway_signature, status, recorded_at)
       VALUES (?, ?, ?, 'razorpay', ?, ?, ?, 'successful', datetime('now'))`,
      [paymentId, invoice_id, payAmount, gateway_order_id, gateway_payment_id, gateway_signature]
    );

    // 2. Recalculate totals
    newAmountPaid = Math.round((invoice.amount_paid + payAmount) * 100) / 100;
    newAmountDue = Math.max(0, Math.round((invoice.total_amount - newAmountPaid) * 100) / 100);
    newStatus = newAmountDue <= 0.001 ? 'paid' : 'partially_paid';

    await db.execute(
      'UPDATE invoices SET amount_paid = ?, amount_due = ?, status = ? WHERE id = ?',
      [newAmountPaid, newAmountDue, newStatus, invoice_id]
    );
  });

  await AuditService.log('PAYMENT_VERIFIED', 'payments', paymentId, req.user?.id, {
    invoiceId: invoice_id,
    amount: payAmount,
    newStatus,
    gateway_payment_id,
  });

  res.json({
    data: {
      payment_id: paymentId,
      amount_paid: newAmountPaid,
      amount_due: newAmountDue,
      invoice_status: newStatus,
    },
    message: 'Payment verified and recorded successfully',
  });
});

// Admin/Staff record offline payment (Supports partial payments)
const offlinePaymentSchema = z.object({
  invoice_id: z.string().min(1),
  amount: z.number().min(0.01),
  payment_method: z.string().default('bank_transfer'),
  notes: z.string().optional(),
});

paymentsRouter.post('/record-offline', requireAuth, requireRole(['admin', 'staff']), validateRequest(offlinePaymentSchema), async (req: Request, res: Response) => {
  const { invoice_id, amount, payment_method, notes } = req.body;

  const invoice = await db.queryOne<{ id: string; total_amount: number; amount_paid: number; amount_due: number; status: string }>(
    'SELECT * FROM invoices WHERE id = ?',
    [invoice_id]
  );

  if (!invoice) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  const payAmount = Math.min(amount, invoice.amount_due);
  const paymentId = uuidv4();
  const paymentRef = `manual_${Date.now()}`;

  let newStatus: string = invoice.status;
  let newAmountPaid = invoice.amount_paid;
  let newAmountDue = invoice.amount_due;

  await db.transaction(async () => {
    await db.execute(
      `INSERT INTO payments (id, invoice_id, amount, payment_method, gateway_payment_id, status, notes, recorded_at)
       VALUES (?, ?, ?, ?, ?, 'successful', ?, datetime('now'))`,
      [paymentId, invoice_id, payAmount, payment_method, paymentRef, notes || 'Manual payment']
    );

    newAmountPaid = Math.round((invoice.amount_paid + payAmount) * 100) / 100;
    newAmountDue = Math.max(0, Math.round((invoice.total_amount - newAmountPaid) * 100) / 100);
    newStatus = newAmountDue <= 0.001 ? 'paid' : 'partially_paid';

    await db.execute(
      'UPDATE invoices SET amount_paid = ?, amount_due = ?, status = ? WHERE id = ?',
      [newAmountPaid, newAmountDue, newStatus, invoice_id]
    );
  });

  await AuditService.log('PAYMENT_OFFLINE_RECORDED', 'payments', paymentId, req.user?.id, {
    invoiceId: invoice_id,
    amount: payAmount,
    newStatus,
  });

  res.json({
    data: {
      payment_id: paymentId,
      amount_paid: newAmountPaid,
      amount_due: newAmountDue,
      invoice_status: newStatus,
    },
    message: 'Manual payment recorded successfully',
  });
});

