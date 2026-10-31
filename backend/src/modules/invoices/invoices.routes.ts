import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { InvoiceService } from './invoices.service';

export const invoicesRouter = Router();

// List invoices (Admin/Staff sees all with filters; Customer sees only their own)
invoicesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const result = await InvoiceService.listInvoices(
    {
      role: req.user!.role,
      customerId: req.user?.customerId,
    },
    {
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      status: req.query.status as string,
      targetCustomerId: req.query.customerId as string,
      subscriptionId: req.query.subscriptionId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
    }
  );

  res.json({
    data: result.invoices,
    pagination: result.pagination,
    message: 'Invoices retrieved successfully',
  });
});

// Get invoice detail with lines and payments
invoicesRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const details = await InvoiceService.getInvoiceDetails(req.params.id, {
      role: req.user!.role,
      customerId: req.user?.customerId,
    });

    res.json({
      data: details,
      message: 'Invoice details retrieved successfully',
    });
  } catch (err: any) {
    const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500);
    res.status(status).json({
      error: {
        code: err.code || 'INVOICE_ERROR',
        message: err.message,
      },
    });
  }
});

// Admin/Staff: Confirm a draft invoice
invoicesRouter.post('/:id/confirm', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  try {
    const confirmed = await InvoiceService.confirmInvoice(req.params.id, req.user?.id);
    res.json({
      data: confirmed,
      message: 'Draft invoice confirmed successfully',
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: {
        code: err.code || 'CONFIRMATION_FAILED',
        message: err.message,
      },
    });
  }
});

// Admin/Staff: Cancel an invoice under agreed rules (only draft or confirmed with 0 payments)
invoicesRouter.post('/:id/cancel', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  try {
    const cancelled = await InvoiceService.cancelInvoice(req.params.id, req.user?.id, req.body.reason);
    res.json({
      data: cancelled,
      message: 'Invoice cancelled successfully',
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: {
        code: err.code || 'CANCELLATION_FAILED',
        message: err.message,
      },
    });
  }
});

// PDF statement presentation & download integration endpoint
invoicesRouter.get('/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const details = await InvoiceService.getInvoiceDetails(req.params.id, {
      role: req.user!.role,
      customerId: req.user?.customerId,
    });

    const customer = await db.queryOne<{ name: string; company_name: string; address: string }>(
      'SELECT name, company_name, address FROM customer_profiles WHERE id = ?',
      [details.customer_id]
    );

    const isDownload = req.query.download === 'true';

    // Format HTML for print / browser-native PDF export
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${details.invoice_number}</title>
  <style>
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
    .title { font-size: 26px; font-weight: bold; color: #4338ca; }
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
    .badge-partially { background: #fef3c7; color: #b45309; }
    .badge-cancelled { background: #f1f5f9; color: #64748b; }
    .actions { margin-bottom: 20px; text-align: right; }
    .btn { background: #4f46e5; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="title">BRIGHTLOOP SOFTWARE</div>
      <p style="margin: 4px 0; color: #64748b;">Subscription & Recurring Billing Management</p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Subscription Ref: ${details.subscription_number || 'N/A'}</p>
    </div>
    <div style="text-align: right;">
      <h2 style="margin: 0 0 6px 0; color: #1e293b;">INVOICE</h2>
      <p style="margin: 2px 0;"><strong>${details.invoice_number}</strong></p>
      <span class="badge ${
        details.status === 'paid'
          ? 'badge-paid'
          : details.status === 'partially_paid'
          ? 'badge-partially'
          : details.status === 'cancelled'
          ? 'badge-cancelled'
          : 'badge-unpaid'
      }">${details.status}</span>
    </div>
  </div>

  <div class="details">
    <div>
      <h4 style="margin: 0 0 6px 0; color: #64748b;">Billed To:</h4>
      <p style="margin: 2px 0;"><strong>${customer?.name || 'Customer'}</strong></p>
      <p style="margin: 2px 0;">${customer?.company_name || ''}</p>
      <p style="margin: 2px 0;">${customer?.address || ''}</p>
    </div>
    <div style="text-align: right;">
      <p style="margin: 2px 0;"><strong>Period:</strong> ${details.period_start} to ${details.period_end}</p>
      <p style="margin: 2px 0;"><strong>Due Date:</strong> ${details.due_date}</p>
      <p style="margin: 2px 0; font-size: 16px; font-weight: bold; color: ${details.amount_due > 0 ? '#dc2626' : '#16a34a'};">
        <strong>Balance Due:</strong> $${Number(details.amount_due).toFixed(2)}
      </p>
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
      ${details.lines.map((l: any) => `
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
    <div class="total-row"><span>Subtotal:</span><span>$${Number(details.subtotal).toFixed(2)}</span></div>
    ${Number(details.discount_amount) > 0 ? `<div class="total-row" style="color: #16a34a;"><span>Discount:</span><span>-$${Number(details.discount_amount).toFixed(2)}</span></div>` : ''}
    ${Number(details.tax_amount) > 0 ? `<div class="total-row"><span>Tax:</span><span>+$${Number(details.tax_amount).toFixed(2)}</span></div>` : ''}
    <div class="total-row grand-total"><span>Total Amount:</span><span>$${Number(details.total_amount).toFixed(2)}</span></div>
    <div class="total-row" style="color: #2563eb;"><span>Amount Paid:</span><span>$${Number(details.amount_paid).toFixed(2)}</span></div>
    <div class="total-row" style="font-weight: bold; color: ${Number(details.amount_due) > 0 ? '#dc2626' : '#16a34a'};">
      <span>Amount Due:</span><span>$${Number(details.amount_due).toFixed(2)}</span>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="Invoice-${details.invoice_number}.html"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="Invoice-${details.invoice_number}.html"`);
    }
    res.send(html);
  } catch (err: any) {
    const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500);
    res.status(status).json({
      error: {
        code: err.code || 'PDF_ERROR',
        message: err.message,
      },
    });
  }
});
