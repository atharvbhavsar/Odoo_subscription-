import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { InvoiceService } from './invoices.service';
import { PdfService } from './pdf.service';
import { EmailService } from './email.service';

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

// Professional PDFKit Invoice Generation endpoint (Protected by Auth & RBAC)
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

    const pdfBuffer = await PdfService.generateInvoicePdf(details, customer);
    const isDownload = req.query.download === 'true';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="Invoice-${details.invoice_number}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
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

// Send invoice via email (Admin/Staff, or Customer requesting their own)
invoicesRouter.post('/:id/send-email', requireAuth, async (req: Request, res: Response) => {
  try {
    const details = await InvoiceService.getInvoiceDetails(req.params.id, {
      role: req.user!.role,
      customerId: req.user?.customerId,
    });

    const recipient = req.user?.role === 'customer' ? undefined : req.body.recipientEmail;
    const result = await EmailService.sendInvoiceEmail(details.id, {
      recipientEmail: recipient,
      userId: req.user?.id,
    });

    res.json({
      data: result,
      message: result.status === 'sent' ? 'Invoice email dispatched successfully' : 'Invoice email dispatch failed',
    });
  } catch (err: any) {
    const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500);
    res.status(status).json({
      error: {
        code: err.code || 'EMAIL_DISPATCH_FAILED',
        message: err.message,
      },
    });
  }
});

// View email delivery history for an invoice
invoicesRouter.get('/:id/emails', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check permission
    await InvoiceService.getInvoiceDetails(req.params.id, {
      role: req.user!.role,
      customerId: req.user?.customerId,
    });

    const history = await EmailService.getEmailHistory(req.params.id);
    res.json({
      data: history,
      message: 'Email history retrieved successfully',
    });
  } catch (err: any) {
    const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500);
    res.status(status).json({
      error: {
        code: err.code || 'EMAIL_HISTORY_ERROR',
        message: err.message,
      },
    });
  }
});

// Admin/Staff: Retry failed invoice email delivery
invoicesRouter.post('/emails/:emailId/retry', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  try {
    const result = await EmailService.retryInvoiceEmail(req.params.emailId, req.user?.id);
    res.json({
      data: result,
      message: result.status === 'sent' ? 'Invoice email retried successfully' : 'Invoice email retry failed',
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: {
        code: err.code || 'RETRY_FAILED',
        message: err.message,
      },
    });
  }
});
