import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const discountsRouter = Router();

// 1. List discounts with search, status, and type filtering
discountsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const isCustomer = req.user?.role === 'customer';
  const statusParam = (req.query.status as string) || (isCustomer ? 'active' : 'all');
  const typeParam = req.query.type as string;
  const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  let sql = `
    SELECT d.*, p.name as applicable_product_name
    FROM discounts d
    LEFT JOIN products p ON d.applicable_product_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (isCustomer || statusParam === 'active') {
    sql += ' AND d.is_active = 1';
  } else if (statusParam === 'inactive') {
    sql += ' AND d.is_active = 0';
  }

  if (typeParam === 'percentage' || typeParam === 'fixed') {
    sql += ' AND d.type = ?';
    params.push(typeParam);
  }

  if (searchParam) {
    sql += ' AND (d.code LIKE ? OR d.description LIKE ?)';
    params.push(`%${searchParam}%`, `%${searchParam}%`);
  }

  sql += ' ORDER BY d.is_active DESC, d.created_at DESC';

  const discounts = await db.query(sql, params);
  const formattedDiscounts = discounts.map((d: any) => ({
    ...d,
    value: Number(d.value),
    min_purchase_amount: Number(d.min_purchase_amount || 0),
    min_quantity: Number(d.min_quantity || 0),
    max_uses: Number(d.max_uses || 0),
    used_count: Number(d.used_count || 0),
    is_active: Number(d.is_active),
  }));

  res.json({
    data: formattedDiscounts,
    message: 'Discounts retrieved successfully',
  });
});

// 2. Get single discount details
discountsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const isCustomer = req.user?.role === 'customer';

  const discount = await db.queryOne<{
    id: string;
    code: string;
    description: string | null;
    type: 'fixed' | 'percentage';
    value: number;
    min_purchase_amount: number;
    min_quantity: number;
    start_date: string | null;
    end_date: string | null;
    max_uses: number;
    used_count: number;
    applicable_product_id: string | null;
    is_active: number;
    created_at: string;
    updated_at: string | null;
    applicable_product_name?: string;
  }>(
    `SELECT d.*, p.name as applicable_product_name
     FROM discounts d
     LEFT JOIN products p ON d.applicable_product_id = p.id
     WHERE d.id = ?`,
    [id]
  );

  if (!discount) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
  }

  if (isCustomer && !discount.is_active) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
  }

  res.json({
    data: {
      ...discount,
      value: Number(discount.value),
      min_purchase_amount: Number(discount.min_purchase_amount || 0),
      min_quantity: Number(discount.min_quantity || 0),
      max_uses: Number(discount.max_uses || 0),
      used_count: Number(discount.used_count || 0),
      is_active: Number(discount.is_active),
    },
    message: 'Discount details retrieved successfully',
  });
});

const createDiscountSchema = z.object({
  code: z
    .string()
    .min(2, 'Discount code must be at least 2 characters')
    .max(50)
    .transform((val) => val.trim().toUpperCase()),
  description: z.string().nullable().optional(),
  type: z.enum(['fixed', 'percentage']),
  value: z.number().min(0.01, 'Discount value must be greater than 0'),
  min_purchase_amount: z.number().min(0, 'Minimum purchase cannot be negative').default(0),
  min_quantity: z.number().int().min(0, 'Minimum quantity cannot be negative').default(0),
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
  max_uses: z.number().int().min(0, 'Max uses cannot be negative').default(0),
  applicable_product_id: z.string().nullable().optional(),
});

// 3. Create discount (Admin or Staff)
discountsRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createDiscountSchema),
  async (req: Request, res: Response) => {
    const {
      code,
      description,
      type,
      value,
      min_purchase_amount,
      min_quantity,
      start_date,
      end_date,
      max_uses,
      applicable_product_id,
    } = req.body;

    // Validate percentage max
    if (type === 'percentage' && value > 100) {
      return res.status(400).json({
        error: { code: 'INVALID_VALUE', message: 'Percentage discount cannot exceed 100%' },
      });
    }

    // Validate date range
    if (start_date && end_date && start_date > end_date) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date' },
      });
    }

    // Check duplicate code
    const existing = await db.queryOne('SELECT id FROM discounts WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: `Discount code '${code}' already exists` } });
    }

    // Check applicable product
    if (applicable_product_id) {
      const prod = await db.queryOne<{ id: string; is_active: number }>(
        'SELECT id, is_active FROM products WHERE id = ?',
        [applicable_product_id]
      );
      if (!prod) {
        return res.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Applicable product does not exist' } });
      }
      if (!prod.is_active) {
        return res.status(400).json({ error: { code: 'INACTIVE_PRODUCT', message: 'Applicable product is inactive' } });
      }
    }

    const id = uuidv4();
    await db.execute(
      `INSERT INTO discounts (
        id, code, description, type, value, min_purchase_amount, min_quantity,
        start_date, end_date, max_uses, used_count, applicable_product_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
      [
        id,
        code,
        description?.trim() || null,
        type,
        value,
        min_purchase_amount,
        min_quantity,
        start_date || null,
        end_date || null,
        max_uses,
        applicable_product_id || null,
      ]
    );

    await AuditService.log('DISCOUNT_CREATED', 'discounts', id, req.user?.id, { code, type, value });

    const created = await db.queryOne(
      `SELECT d.*, p.name as applicable_product_name
       FROM discounts d
       LEFT JOIN products p ON d.applicable_product_id = p.id
       WHERE d.id = ?`,
      [id]
    );

    res.status(201).json({
      data: created,
      message: 'Discount created successfully',
    });
  }
);

const updateDiscountSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .transform((val) => val.trim().toUpperCase())
    .optional(),
  description: z.string().nullable().optional(),
  type: z.enum(['fixed', 'percentage']).optional(),
  value: z.number().min(0.01).optional(),
  min_purchase_amount: z.number().min(0).optional(),
  min_quantity: z.number().int().min(0).optional(),
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
  max_uses: z.number().int().min(0).optional(),
  applicable_product_id: z.string().nullable().optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
});

// 4. Update discount (Admin or Staff)
discountsRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updateDiscountSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = await db.queryOne<{
      id: string;
      code: string;
      description: string | null;
      type: 'fixed' | 'percentage';
      value: number;
      min_purchase_amount: number;
      min_quantity: number;
      start_date: string | null;
      end_date: string | null;
      max_uses: number;
      used_count: number;
      applicable_product_id: string | null;
      is_active: number;
    }>('SELECT * FROM discounts WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
    }

    const {
      code,
      description,
      type,
      value,
      min_purchase_amount,
      min_quantity,
      start_date,
      end_date,
      max_uses,
      applicable_product_id,
      is_active,
    } = req.body;

    const effectiveType = type !== undefined ? type : existing.type;
    const effectiveValue = value !== undefined ? value : existing.value;

    if (effectiveType === 'percentage' && effectiveValue > 100) {
      return res.status(400).json({
        error: { code: 'INVALID_VALUE', message: 'Percentage discount cannot exceed 100%' },
      });
    }

    const updatedStartDate = start_date !== undefined ? start_date : existing.start_date;
    const updatedEndDate = end_date !== undefined ? end_date : existing.end_date;

    if (updatedStartDate && updatedEndDate && updatedStartDate > updatedEndDate) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date' },
      });
    }

    if (code && code !== existing.code) {
      const duplicate = await db.queryOne('SELECT id FROM discounts WHERE code = ? AND id != ?', [code, id]);
      if (duplicate) {
        return res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: `Discount code '${code}' already exists` } });
      }
    }

    if (applicable_product_id !== undefined && applicable_product_id !== null) {
      const prod = await db.queryOne<{ id: string; is_active: number }>(
        'SELECT id, is_active FROM products WHERE id = ?',
        [applicable_product_id]
      );
      if (!prod) {
        return res.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Applicable product does not exist' } });
      }
      if (!prod.is_active) {
        return res.status(400).json({ error: { code: 'INACTIVE_PRODUCT', message: 'Applicable product is inactive' } });
      }
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
      `UPDATE discounts 
       SET code = ?, description = ?, type = ?, value = ?, min_purchase_amount = ?, min_quantity = ?,
           start_date = ?, end_date = ?, max_uses = ?, applicable_product_id = ?, is_active = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        code !== undefined ? code : existing.code,
        description !== undefined ? (description?.trim() || null) : existing.description,
        effectiveType,
        effectiveValue,
        min_purchase_amount !== undefined ? min_purchase_amount : existing.min_purchase_amount,
        min_quantity !== undefined ? min_quantity : existing.min_quantity,
        updatedStartDate,
        updatedEndDate,
        max_uses !== undefined ? max_uses : existing.max_uses,
        applicable_product_id !== undefined ? applicable_product_id : existing.applicable_product_id,
        updatedActive,
        id,
      ]
    );

    await AuditService.log('DISCOUNT_UPDATED', 'discounts', id, req.user?.id, {
      updated_fields: Object.keys(req.body),
    });

    const updated = await db.queryOne(
      `SELECT d.*, p.name as applicable_product_name
       FROM discounts d
       LEFT JOIN products p ON d.applicable_product_id = p.id
       WHERE d.id = ?`,
      [id]
    );

    res.json({
      data: updated,
      message: 'Discount updated successfully',
    });
  }
);

// 5. Activate discount
discountsRouter.patch('/:id/activate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const discount = await db.queryOne('SELECT id FROM discounts WHERE id = ?', [id]);
  if (!discount) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
  }

  await db.execute('UPDATE discounts SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('DISCOUNT_ACTIVATED', 'discounts', id, req.user?.id);

  const updated = await db.queryOne(
    `SELECT d.*, p.name as applicable_product_name
     FROM discounts d
     LEFT JOIN products p ON d.applicable_product_id = p.id
     WHERE d.id = ?`,
    [id]
  );

  res.json({
    data: updated,
    message: 'Discount activated successfully',
  });
});

// 6. Deactivate discount (soft toggle)
discountsRouter.patch('/:id/deactivate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const discount = await db.queryOne('SELECT id FROM discounts WHERE id = ?', [id]);
  if (!discount) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
  }

  await db.execute('UPDATE discounts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('DISCOUNT_DEACTIVATED', 'discounts', id, req.user?.id);

  const updated = await db.queryOne(
    `SELECT d.*, p.name as applicable_product_name
     FROM discounts d
     LEFT JOIN products p ON d.applicable_product_id = p.id
     WHERE d.id = ?`,
    [id]
  );

  res.json({
    data: updated,
    message: 'Discount deactivated successfully',
  });
});

// 7. Physical delete guard (prohibited if referenced by existing quotations or subscriptions)
discountsRouter.delete('/:id', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const discount = await db.queryOne('SELECT id FROM discounts WHERE id = ?', [id]);
  if (!discount) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Discount not found' } });
  }

  const quoteRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE discount_id = ?', [id]);
  const subRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM subscriptions WHERE discount_id = ?', [id]);

  const totalRefs = (quoteRef?.count || 0) + (subRef?.count || 0);

  if (totalRefs > 0) {
    return res.status(400).json({
      error: {
        code: 'DISCOUNT_IN_USE',
        message:
          'Cannot delete discount because it is referenced by existing quotations or subscriptions. Deactivate it instead to preserve history.',
      },
    });
  }

  await db.execute('DELETE FROM discounts WHERE id = ?', [id]);
  await AuditService.log('DISCOUNT_DELETED', 'discounts', id, req.user?.id);

  res.json({
    data: { id },
    message: 'Discount deleted successfully',
  });
});
