import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';

export const invoicesRouter = Router();

// List invoices (Admin/Staff sees all, Customer sees only their own)
invoicesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  let sql = `
    SELECT i.*, c.name as customer_name, c.company_name, s.subscription_number
    FROM invoices i
    JOIN customer_profiles c ON i.customer_id = c.id
    JOIN subscriptions s ON i.subscription_id = s.id
  `;
  const params: any[] = [];

  if (req.user?.role === 'customer') {
    sql += ' WHERE i.customer_id = ?';
    params.push(req.user.customerId);
  }

  sql += ' ORDER BY i.created_at DESC';

  const invoices = await db.query(sql, params);
  res.json({ data: invoices, message: 'Invoices retrieved successfully' });
});

// Get invoice detail
invoicesRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const invoice = await db.queryOne<{
    id: string;
    customer_id: string;
    [key: string]: any;
  }>(
    `SELECT i.*, c.name as customer_name, c.company_name, c.address as customer_address, s.subscription_number
     FROM invoices i
     JOIN customer_profiles c ON i.customer_id = c.id
     JOIN subscriptions s ON i.subscription_id = s.id
     WHERE i.id = ?`,
    [req.params.id]
  );

  if (!invoice) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== invoice.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to invoice' } });
  }

  const lines = await db.query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [invoice.id]);
  const payments = await db.query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY recorded_at DESC', [invoice.id]);

  res.json({
    data: {
      ...invoice,
      lines,
      payments,
    },
    message: 'Invoice details retrieved',
  });
});

// PDF download / presentation endpoint
invoicesRouter.get('/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  const invoice = await db.queryOne<{
    id: string;
    customer_id: string;
    invoice_number: string;
    due_date: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    amount_paid: number;
    amount_due: number;
    status: string;
  }>('SELECT * FROM invoices WHERE id = ?', [req.params.id]);

  if (!invoice) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== invoice.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  const lines = await db.query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [invoice.id]);
  const customer = await db.queryOne<{ name: string; company_name: string; address: string }>(
    'SELECT name, company_name, address FROM customer_profiles WHERE id = ?',
    [invoice.customer_id]
  );

  // Return formatted print/PDF invoice HTML
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
    .title { font-size: 28px; font-weight: bold; color: #4338ca; }
    .details { margin: 30px 0; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
    td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
    .totals { margin-top: 30px; margin-left: auto; width: 320px; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .grand-total { font-size: 18px; font-weight: bold; border-top: 2px solid #cbd5e1; padding-top: 10px; color: #1e1b4b; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .badge-paid { background: #dcfce7; color: #15803d; }
    .badge-unpaid { background: #fee2e2; color: #b91c1c; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">BRIGHTLOOP SOFTWARE</div>
      <p>Subscription & Recurring Billing Management</p>
    </div>
    <div style="text-align: right;">
      <h2>INVOICE</h2>
      <p><strong>${invoice.invoice_number}</strong></p>
      <span class="badge ${invoice.status === 'paid' ? 'badge-paid' : 'badge-unpaid'}">${invoice.status}</span>
    </div>
  </div>

  <div class="details">
    <div>
      <h4>Billed To:</h4>
      <p><strong>${customer?.name || 'Customer'}</strong></p>
      <p>${customer?.company_name || ''}</p>
      <p>${customer?.address || ''}</p>
    </div>
    <div style="text-align: right;">
      <p><strong>Due Date:</strong> ${invoice.due_date}</p>
      <p><strong>Outstanding Balance:</strong> $${invoice.amount_due.toFixed(2)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Quantity</th>
        <th>Unit Price</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((l: any) => `
        <tr>
          <td>${l.description}</td>
          <td>${l.quantity}</td>
          <td>$${Number(l.unit_price).toFixed(2)}</td>
          <td>$${Number(l.subtotal).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal:</span><span>$${invoice.subtotal.toFixed(2)}</span></div>
    ${invoice.discount_amount > 0 ? `<div class="total-row" style="color: #16a34a;"><span>Discount:</span><span>-$${invoice.discount_amount.toFixed(2)}</span></div>` : ''}
    ${invoice.tax_amount > 0 ? `<div class="total-row"><span>Tax:</span><span>+$${invoice.tax_amount.toFixed(2)}</span></div>` : ''}
    <div class="total-row grand-total"><span>Total Amount:</span><span>$${invoice.total_amount.toFixed(2)}</span></div>
    <div class="total-row" style="color: #2563eb;"><span>Amount Paid:</span><span>$${invoice.amount_paid.toFixed(2)}</span></div>
    <div class="total-row" style="font-weight: bold; color: ${invoice.amount_due > 0 ? '#dc2626' : '#16a34a'};">
      <span>Amount Due:</span><span>$${invoice.amount_due.toFixed(2)}</span>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

