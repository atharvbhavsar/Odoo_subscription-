import nodemailer, { Transporter } from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database';
import { env } from '../../config/env';
import { InvoiceService } from './invoices.service';
import { PdfService } from './pdf.service';
import { AuditService } from '../audit/audit.service';

export interface EmailDeliveryResult {
  emailId: string;
  invoiceId: string;
  recipientEmail: string;
  status: 'sent' | 'failed';
  attempts: number;
  messageId?: string;
  errorMessage?: string;
}

export class EmailService {
  private static transporter: Transporter | null = null;
  private static simulateFailure = false;

  /**
   * Test hook to simulate transient email transport failures for verification
   */
  static setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  private static async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;

    if (env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST || 'smtp.mailtrap.io',
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      return this.transporter;
    }

    // Automatically initialize an active Ethereal SMTP account so real emails with attached PDFs are dispatched
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`[EmailService] Initialized Ethereal SMTP test account: ${testAccount.user}`);
      this.transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.warn('[EmailService] Fallback to JSON transport:', err);
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }

    return this.transporter;
  }

  /**
   * Sends an authoritative invoice email with attached PDFKit statement.
   * Isolates delivery failure from invoice creation and payment state.
   */
  static async sendInvoiceEmail(
    invoiceId: string,
    options: { recipientEmail?: string; userId?: string } = {}
  ): Promise<EmailDeliveryResult> {
    const emailId = uuidv4();
    const invoice = await db.queryOne<{
      id: string;
      invoice_number: string;
      customer_id: string;
      total_amount: number;
      amount_due: number;
      due_date: string;
    }>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);

    if (!invoice) {
      const err = new Error('Invoice not found') as any;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Customer details and recipient email - resolve to customer login email
    let customer = await db.queryOne<{ name: string; company_name: string; address: string; user_id: string }>(
      'SELECT * FROM customer_profiles WHERE id = ?',
      [invoice.customer_id]
    );

    if (!customer) {
      customer = await db.queryOne<{ name: string; company_name: string; address: string; user_id: string }>(
        'SELECT * FROM customer_profiles WHERE user_id = ?',
        [invoice.customer_id]
      );
    }

    let recipient = options.recipientEmail;
    if (!recipient) {
      // 1. Resolve customer login email via customer_profiles.user_id
      if (customer?.user_id) {
        const u = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [customer.user_id]);
        if (u?.email) recipient = u.email;
      }
      // 2. Resolve if invoice.customer_id is a users.id
      if (!recipient) {
        const u = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [invoice.customer_id]);
        if (u?.email) recipient = u.email;
      }
      // 3. Resolve if options.userId was passed
      if (!recipient && options.userId) {
        const u = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [options.userId]);
        if (u?.email) recipient = u.email;
      }
    }

    if (!recipient) {
      recipient = 'customer@example.com';
    }

    const subject = `Your Invoice ${invoice.invoice_number} from ${env.COMPANY_NAME}`;

    // 1. Initial record with status 'pending'
    await db.execute(
      `INSERT INTO invoice_emails (id, invoice_id, recipient_email, subject, status, attempts, last_attempt_at)
       VALUES (?, ?, ?, ?, 'pending', 1, CURRENT_TIMESTAMP)`,
      [emailId, invoiceId, recipient, subject]
    );

    try {
      if (this.simulateFailure) {
        throw new Error('Simulated transient SMTP connection timeout (Test Mode)');
      }

      // Generate authoritative PDF statement
      const invoiceDetails = await InvoiceService.getInvoiceDetails(invoiceId, { role: 'admin' });
      const pdfBuffer = await PdfService.generateInvoicePdf(invoiceDetails, {
        name: customer?.name,
        company_name: customer?.company_name,
        address: customer?.address,
        email: recipient,
      });

      // Construct HTML message
      const htmlBody = `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4338ca;">Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${customer?.name || 'Customer'},</p>
          <p>Thank you for choosing <strong>${env.COMPANY_NAME}</strong>. Your billing statement is now available.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
            <p style="margin: 4px 0;"><strong>Total Amount:</strong> $${Number(invoice.total_amount).toFixed(2)}</p>
            <p style="margin: 4px 0; color: #dc2626;"><strong>Outstanding Due:</strong> $${Number(invoice.amount_due).toFixed(2)}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${invoice.due_date || 'Due upon receipt'}</p>
          </div>

          <p>A copy of your detailed PDF invoice is attached to this email.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 30px;">
            Payment Instructions: ${env.PAYMENT_INSTRUCTIONS}
          </p>
        </div>
      `;

      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: env.SMTP_FROM,
        to: recipient,
        subject,
        html: htmlBody,
        attachments: [
          {
            filename: `Invoice-${invoice.invoice_number}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      // Update delivery record to 'sent'
      await db.execute(
        `UPDATE invoice_emails 
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error_message = NULL 
         WHERE id = ?`,
        [emailId]
      );

      await AuditService.log('INVOICE_EMAIL_SENT', 'invoices', invoiceId, options.userId, {
        emailId,
        recipient,
        invoiceNumber: invoice.invoice_number,
        messageId: info.messageId || 'mock-id',
      });

      return {
        emailId,
        invoiceId,
        recipientEmail: recipient,
        status: 'sent',
        attempts: 1,
        messageId: info.messageId,
      };
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown email delivery failure';

      // Update delivery record to 'failed' without modifying invoice state
      await db.execute(
        `UPDATE invoice_emails 
         SET status = 'failed', error_message = ? 
         WHERE id = ?`,
        [errorMsg, emailId]
      );

      await AuditService.log('INVOICE_EMAIL_FAILED', 'invoices', invoiceId, options.userId, {
        emailId,
        recipient,
        invoiceNumber: invoice.invoice_number,
        error: errorMsg,
      });

      return {
        emailId,
        invoiceId,
        recipientEmail: recipient,
        status: 'failed',
        attempts: 1,
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Re-attempts delivery of a previously failed invoice email
   */
  static async retryInvoiceEmail(emailId: string, userId?: string): Promise<EmailDeliveryResult> {
    const record = await db.queryOne<{
      id: string;
      invoice_id: string;
      recipient_email: string;
      attempts: number;
    }>('SELECT * FROM invoice_emails WHERE id = ?', [emailId]);

    if (!record) {
      const err = new Error('Email record not found') as any;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const nextAttempts = record.attempts + 1;

    try {
      if (this.simulateFailure) {
        throw new Error('Simulated transient SMTP connection timeout on retry (Test Mode)');
      }

      const invoiceDetails = await InvoiceService.getInvoiceDetails(record.invoice_id, { role: 'admin' });
      const pdfBuffer = await PdfService.generateInvoicePdf(invoiceDetails, {
        email: record.recipient_email,
      });

      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: env.SMTP_FROM,
        to: record.recipient_email,
        subject: `Your Invoice ${invoiceDetails.invoice_number} from ${env.COMPANY_NAME}`,
        text: `Please find attached your invoice ${invoiceDetails.invoice_number}.`,
        attachments: [
          {
            filename: `Invoice-${invoiceDetails.invoice_number}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      await db.execute(
        `UPDATE invoice_emails 
         SET status = 'sent', attempts = ?, last_attempt_at = CURRENT_TIMESTAMP, sent_at = CURRENT_TIMESTAMP, error_message = NULL 
         WHERE id = ?`,
        [nextAttempts, emailId]
      );

      return {
        emailId,
        invoiceId: record.invoice_id,
        recipientEmail: record.recipient_email,
        status: 'sent',
        attempts: nextAttempts,
        messageId: info.messageId,
      };
    } catch (err: any) {
      const errorMsg = err.message || 'Retry delivery failed';

      await db.execute(
        `UPDATE invoice_emails 
         SET status = 'failed', attempts = ?, last_attempt_at = CURRENT_TIMESTAMP, error_message = ? 
         WHERE id = ?`,
        [nextAttempts, errorMsg, emailId]
      );

      return {
        emailId,
        invoiceId: record.invoice_id,
        recipientEmail: record.recipient_email,
        status: 'failed',
        attempts: nextAttempts,
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Retrieves email history for an invoice
   */
  static async getEmailHistory(invoiceId: string) {
    return db.query('SELECT * FROM invoice_emails WHERE invoice_id = ? ORDER BY created_at DESC', [invoiceId]);
  }
}

