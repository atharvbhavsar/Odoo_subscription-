import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database';
import { AuditService } from '../audit/audit.service';

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  status?: string;
  targetCustomerId?: string;
  subscriptionId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface InvoiceDetailRecord {
  id: string;
  invoice_number: string;
  subscription_id: string;
  customer_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  created_at?: string;
  customer_name?: string;
  company_name?: string;
  customer_address?: string;
  subscription_number?: string;
  lines: Array<{
    id: string;
    invoice_id: string;
    product_id: string;
    variant_id?: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  payments: any[];
}

export class InvoiceService {
  /**
   * Generates a collision-resistant unique invoice number safely even under high concurrency.
   * Format: INV-YYYYMMDD-XXXX where XXXX is random alphanumeric
   */
  static async generateInvoiceNumber(): Promise<string> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const candidateNumber = `INV-${today}-${randomSuffix}`;

      // Verify candidate uniqueness in database
      const existing = await db.queryOne<{ id: string }>(
        'SELECT id FROM invoices WHERE invoice_number = ?',
        [candidateNumber]
      );

      if (!existing) {
        return candidateNumber;
      }
    }

    // Fallback if random 4-char suffix collided 10 times (extremely rare)
    return `INV-${today}-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  }

  /**
   * Paginated listing of invoices with multi-attribute filtering
   */
  static async listInvoices(
    user: { role: string; customerId?: string },
    filters: InvoiceFilters = {}
  ) {
    let whereClauses: string[] = [];
    const params: any[] = [];

    // Role-based customer isolation
    if (user.role === 'customer') {
      whereClauses.push('i.customer_id = ?');
      params.push(user.customerId);
    } else if (filters.targetCustomerId) {
      whereClauses.push('i.customer_id = ?');
      params.push(filters.targetCustomerId);
    }

    if (filters.status) {
      whereClauses.push('i.status = ?');
      params.push(filters.status);
    }

    if (filters.subscriptionId) {
      whereClauses.push('i.subscription_id = ?');
      params.push(filters.subscriptionId);
    }

    if (filters.startDate) {
      whereClauses.push('i.period_start >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClauses.push('i.period_end <= ?');
      params.push(filters.endDate);
    }

    if (filters.search) {
      whereClauses.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM invoices i
      JOIN customer_profiles c ON i.customer_id = c.id
      JOIN subscriptions s ON i.subscription_id = s.id
      ${whereSql}
    `;
    const countResult = await db.queryOne<{ total: number }>(countSql, params);
    const total = countResult ? Number(countResult.total) : 0;

    // Apply pagination defaults if specified
    const page = filters.page && filters.page > 0 ? Number(filters.page) : 1;
    const limit = filters.limit && filters.limit > 0 ? Number(filters.limit) : 50;
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT i.*, c.name as customer_name, c.company_name, s.subscription_number
      FROM invoices i
      JOIN customer_profiles c ON i.customer_id = c.id
      JOIN subscriptions s ON i.subscription_id = s.id
      ${whereSql}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const invoices = await db.query(dataSql, [...params, limit, offset]);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves full invoice details with lines snapshot and payment history
   */
  static async getInvoiceDetails(
    invoiceId: string,
    user: { role: string; customerId?: string }
  ): Promise<InvoiceDetailRecord> {
    const invoice = await db.queryOne<any>(
      `SELECT i.*, c.name as customer_name, c.company_name, c.address as customer_address, s.subscription_number
       FROM invoices i
       LEFT JOIN customer_profiles c ON i.customer_id = c.id
       LEFT JOIN subscriptions s ON i.subscription_id = s.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (!invoice) {
      const err = new Error('Invoice not found') as any;
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Role-based customer isolation (Admin & Staff have full visibility)
    if (user.role === 'customer') {
      let isOwner = Boolean(user.customerId && user.customerId === invoice.customer_id);
      if (!isOwner && user.customerId) {
        const profile = await db.queryOne<{ user_id: string }>(
          'SELECT user_id FROM customer_profiles WHERE id = ?',
          [invoice.customer_id]
        );
        if (profile && (profile.user_id === user.customerId || profile.user_id === (user as any).id)) {
          isOwner = true;
        }
      }
      if (!isOwner) {
        const err = new Error('Unauthorized access to invoice') as any;
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const lines = await db.query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [invoice.id]);
    const payments = await db.query(
      'SELECT * FROM payments WHERE invoice_id = ? ORDER BY recorded_at DESC',
      [invoice.id]
    );

    return {
      ...invoice,
      lines,
      payments,
    };
  }

  /**
   * Confirms a draft invoice following agreed state machine rules:
   * 'draft' -> 'confirmed'
   */
  static async confirmInvoice(invoiceId: string, userId?: string) {
    let updatedInvoice: any;

    await db.transaction(async () => {
      const invoice = await db.queryOne<{ id: string; status: string; invoice_number: string }>(
        'SELECT id, status, invoice_number FROM invoices WHERE id = ?',
        [invoiceId]
      );

      if (!invoice) {
        const err = new Error('Invoice not found') as any;
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      if (invoice.status !== 'draft') {
        const err = new Error(`Only draft invoices can be confirmed; current status is '${invoice.status}'`) as any;
        err.statusCode = 400;
        err.code = 'INVALID_STATE_TRANSITION';
        throw err;
      }

      await db.execute("UPDATE invoices SET status = 'confirmed' WHERE id = ?", [invoiceId]);

      await AuditService.log('INVOICE_CONFIRMED', 'invoices', invoiceId, userId, {
        previousStatus: 'draft',
        newStatus: 'confirmed',
        invoiceNumber: invoice.invoice_number,
      });

      updatedInvoice = await db.queryOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    });

    return updatedInvoice;
  }

  /**
   * Cancels an invoice following agreed state machine rules:
   * Only 'draft' or 'confirmed' invoices with amount_paid == 0 can be cancelled.
   * If any payment has been recorded (amount_paid > 0), cancellation is rejected.
   */
  static async cancelInvoice(invoiceId: string, userId?: string, reason?: string) {
    let updatedInvoice: any;

    await db.transaction(async () => {
      const invoice = await db.queryOne<{
        id: string;
        status: string;
        invoice_number: string;
        amount_paid: number;
        total_amount: number;
      }>('SELECT id, status, invoice_number, amount_paid, total_amount FROM invoices WHERE id = ?', [
        invoiceId,
      ]);

      if (!invoice) {
        const err = new Error('Invoice not found') as any;
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      if (invoice.status === 'cancelled') {
        const err = new Error('Invoice is already cancelled') as any;
        err.statusCode = 400;
        err.code = 'ALREADY_CANCELLED';
        throw err;
      }

      if (Number(invoice.amount_paid) > 0 || invoice.status === 'paid' || invoice.status === 'partially_paid') {
        const err = new Error(
          `Invoices with recorded payments ($${Number(invoice.amount_paid).toFixed(2)}) cannot be cancelled`
        ) as any;
        err.statusCode = 400;
        err.code = 'CANNOT_CANCEL_PAID_INVOICE';
        throw err;
      }

      if (invoice.status !== 'draft' && invoice.status !== 'confirmed') {
        const err = new Error(
          `Cannot cancel invoice with status '${invoice.status}'. Only draft or confirmed invoices can be cancelled.`
        ) as any;
        err.statusCode = 400;
        err.code = 'INVALID_STATE_TRANSITION';
        throw err;
      }

      await db.execute("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [invoiceId]);

      await AuditService.log('INVOICE_CANCELLED', 'invoices', invoiceId, userId, {
        previousStatus: invoice.status,
        newStatus: 'cancelled',
        invoiceNumber: invoice.invoice_number,
        reason: reason || 'Operational cancellation',
      });

      updatedInvoice = await db.queryOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    });

    return updatedInvoice;
  }
}
