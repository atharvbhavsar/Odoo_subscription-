import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const taxesRouter = Router();

// 1. List taxes with optional search and status filtering
taxesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const isCustomer = req.user?.role === 'customer';
  const statusParam = (req.query.status as string) || (isCustomer ? 'active' : 'all');
  const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  let sql = 'SELECT * FROM taxes WHERE 1=1';
  const params: any[] = [];

  if (isCustomer || statusParam === 'active') {
    sql += ' AND is_active = 1';
  } else if (statusParam === 'inactive') {
    sql += ' AND is_active = 0';
  }

  if (searchParam) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${searchParam}%`, `%${searchParam}%`);
  }

  sql += ' ORDER BY is_active DESC, rate_percentage ASC';

  const taxes = await db.query(sql, params);
  const formattedTaxes = taxes.map((t: any) => ({
    ...t,
    rate_percentage: Number(t.rate_percentage),
    is_active: Number(t.is_active),
  }));

  res.json({
    data: formattedTaxes,
    message: 'Taxes retrieved successfully',
  });
});

// 2. Get single tax details
taxesRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const isCustomer = req.user?.role === 'customer';

  const tax = await db.queryOne<{
    id: string;
    name: string;
    description: string | null;
    rate_percentage: number;
    start_date: string | null;
    end_date: string | null;
    is_active: number;
    created_at: string;
    updated_at: string | null;
  }>('SELECT * FROM taxes WHERE id = ?', [id]);

  if (!tax) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
  }

  if (isCustomer && !tax.is_active) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
  }

  res.json({
    data: {
      ...tax,
      rate_percentage: Number(tax.rate_percentage),
      is_active: Number(tax.is_active),
    },
    message: 'Tax rule details retrieved successfully',
  });
});

const createTaxSchema = z.object({
  name: z.string().min(1, 'Tax name is required').max(100),
  description: z.string().nullable().optional(),
  rate_percentage: z.number().min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100%'),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD')
    .nullable()
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
    .nullable()
    .optional(),
});

// 3. Create tax rule (Admin or Staff)
taxesRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createTaxSchema),
  async (req: Request, res: Response) => {
    const { name, description, rate_percentage, start_date, end_date } = req.body;

    if (start_date && end_date && start_date > end_date) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Effective start date cannot be later than end date' },
      });
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO taxes (id, name, description, rate_percentage, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, name.trim(), description?.trim() || null, rate_percentage, start_date || null, end_date || null]
    );

    await AuditService.log('TAX_CREATED', 'taxes', id, req.user?.id, { name, rate_percentage });

    const created = await db.queryOne('SELECT * FROM taxes WHERE id = ?', [id]);

    res.status(201).json({
      data: created,
      message: 'Tax rule created successfully',
    });
  }
);

const updateTaxSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  rate_percentage: z.number().min(0).max(100).optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
});

// 4. Update tax rule (Admin or Staff)
taxesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updateTaxSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = await db.queryOne<{
      id: string;
      name: string;
      description: string | null;
      rate_percentage: number;
      start_date: string | null;
      end_date: string | null;
      is_active: number;
    }>('SELECT * FROM taxes WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
    }

    const { name, description, rate_percentage, start_date, end_date, is_active } = req.body;

    const updatedStartDate = start_date !== undefined ? start_date : existing.start_date;
    const updatedEndDate = end_date !== undefined ? end_date : existing.end_date;

    if (updatedStartDate && updatedEndDate && updatedStartDate > updatedEndDate) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Effective start date cannot be later than end date' },
      });
    }

    const updatedActive =
      is_active !== undefined
        ? typeof is_active === 'boolean'
          ? is_active
            ? 1
            : 0
          : is_active
        : existing.is_active;

    await db.execute(
      `UPDATE taxes 
       SET name = ?, description = ?, rate_percentage = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name !== undefined ? name.trim() : existing.name,
        description !== undefined ? (description?.trim() || null) : existing.description,
        rate_percentage !== undefined ? rate_percentage : existing.rate_percentage,
        updatedStartDate,
        updatedEndDate,
        updatedActive,
        id,
      ]
    );

    await AuditService.log('TAX_UPDATED', 'taxes', id, req.user?.id, {
      updated_fields: Object.keys(req.body),
    });

    const updated = await db.queryOne('SELECT * FROM taxes WHERE id = ?', [id]);

    res.json({
      data: updated,
      message: 'Tax rule updated successfully',
    });
  }
);

// 5. Activate tax rule
taxesRouter.patch('/:id/activate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tax = await db.queryOne('SELECT id FROM taxes WHERE id = ?', [id]);
  if (!tax) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
  }

  await db.execute('UPDATE taxes SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('TAX_ACTIVATED', 'taxes', id, req.user?.id);

  const updated = await db.queryOne('SELECT * FROM taxes WHERE id = ?', [id]);

  res.json({
    data: updated,
    message: 'Tax rule activated successfully',
  });
});

// 6. Deactivate tax rule (soft toggle)
taxesRouter.patch('/:id/deactivate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tax = await db.queryOne('SELECT id FROM taxes WHERE id = ?', [id]);
  if (!tax) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
  }

  await db.execute('UPDATE taxes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('TAX_DEACTIVATED', 'taxes', id, req.user?.id);

  const updated = await db.queryOne('SELECT * FROM taxes WHERE id = ?', [id]);

  res.json({
    data: updated,
    message: 'Tax rule deactivated successfully',
  });
});

// 7. Physical delete guard (prohibited if referenced by existing quotations or subscriptions)
taxesRouter.delete('/:id', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tax = await db.queryOne('SELECT id FROM taxes WHERE id = ?', [id]);
  if (!tax) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tax rule not found' } });
  }

  const quoteRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE tax_id = ?', [id]);
  const subRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM subscriptions WHERE tax_id = ?', [id]);

  const totalRefs = (quoteRef?.count || 0) + (subRef?.count || 0);

  if (totalRefs > 0) {
    return res.status(400).json({
      error: {
        code: 'TAX_IN_USE',
        message:
          'Cannot delete tax rule because it is referenced by existing quotations or subscriptions. Deactivate it instead to preserve history.',
      },
    });
  }

  await db.execute('DELETE FROM taxes WHERE id = ?', [id]);
  await AuditService.log('TAX_DELETED', 'taxes', id, req.user?.id);

  res.json({
    data: { id },
    message: 'Tax rule deleted successfully',
  });
});
