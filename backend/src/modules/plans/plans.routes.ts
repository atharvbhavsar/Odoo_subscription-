import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';
import { PricingService } from '../discounts/pricing.service';

export const plansRouter = Router();

// Helper to format plan lines with product details and effective price
async function attachLinesToPlans(plans: any[]) {
  if (plans.length === 0) return plans;

  const planIds = plans.map((p) => p.id);
  const placeholders = planIds.map(() => '?').join(',');

  const lines = await db.query<any>(
    `SELECT pl.*, 
            p.name as product_name, p.type as product_type, p.sales_price, p.is_active as product_is_active,
            pv.attribute_name, pv.attribute_value, pv.price_extra, pv.is_active as variant_is_active
     FROM plan_lines pl
     JOIN products p ON pl.product_id = p.id
     LEFT JOIN product_variants pv ON pl.variant_id = pv.id
     WHERE pl.plan_id IN (${placeholders})
     ORDER BY pl.created_at ASC`,
    planIds
  );

  const linesByPlan: Record<string, any[]> = {};
  for (const line of lines) {
    if (!linesByPlan[line.plan_id]) {
      linesByPlan[line.plan_id] = [];
    }
    const priceExtra = Number(line.price_extra || 0);
    const salesPrice = Number(line.sales_price || 0);
    const effectivePrice = PricingService.round(salesPrice + priceExtra);

    linesByPlan[line.plan_id].push({
      id: line.id,
      plan_id: line.plan_id,
      product_id: line.product_id,
      variant_id: line.variant_id,
      quantity: line.quantity,
      product_name: line.product_name,
      product_type: line.product_type,
      sales_price: salesPrice,
      product_is_active: line.product_is_active,
      attribute_name: line.attribute_name,
      attribute_value: line.attribute_value,
      price_extra: priceExtra,
      variant_is_active: line.variant_is_active,
      effective_price: effectivePrice,
      created_at: line.created_at,
    });
  }

  return plans.map((p) => ({
    ...p,
    price: Number(p.price),
    min_qty: Number(p.min_qty),
    billing_interval: Number(p.billing_interval || 1),
    is_active: Number(p.is_active),
    can_pause: Boolean(p.can_pause),
    can_renew: Boolean(p.can_renew),
    can_close_early: Boolean(p.can_close_early),
    auto_close: Boolean(p.auto_close),
    lines: linesByPlan[p.id] || [],
  }));
}

// Helper to validate plan product and variant lines
async function validatePlanLines(lines: Array<{ product_id: string; variant_id?: string | null; quantity: number }>) {
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];

    if (!item.quantity || item.quantity <= 0) {
      return { error: { code: 'INVALID_QUANTITY', message: `Line ${i + 1}: Quantity must be greater than 0` } };
    }

    const product = await db.queryOne<{ id: string; name: string; is_active: number }>(
      'SELECT id, name, is_active FROM products WHERE id = ?',
      [item.product_id]
    );

    if (!product) {
      return { error: { code: 'INVALID_PRODUCT', message: `Line ${i + 1}: Product '${item.product_id}' does not exist` } };
    }

    if (!product.is_active) {
      return { error: { code: 'INACTIVE_PRODUCT', message: `Line ${i + 1}: Product '${product.name}' is inactive and cannot be included in a plan` } };
    }

    if (item.variant_id) {
      const variant = await db.queryOne<{ id: string; product_id: string; attribute_value: string; is_active: number }>(
        'SELECT id, product_id, attribute_value, is_active FROM product_variants WHERE id = ?',
        [item.variant_id]
      );

      if (!variant) {
        return { error: { code: 'INVALID_VARIANT', message: `Line ${i + 1}: Variant '${item.variant_id}' does not exist` } };
      }

      if (variant.product_id !== item.product_id) {
        return {
          error: {
            code: 'VARIANT_PRODUCT_MISMATCH',
            message: `Line ${i + 1}: Variant '${variant.attribute_value}' does not belong to product '${product.name}'`,
          },
        };
      }

      if (variant.is_active === 0) {
        return {
          error: {
            code: 'INACTIVE_VARIANT',
            message: `Line ${i + 1}: Variant '${variant.attribute_value}' is inactive and cannot be included in a plan`,
          },
        };
      }
    }
  }

  return { error: null };
}

// 1. List plans with search and status filtering
plansRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const isCustomer = req.user?.role === 'customer';
  const statusParam = (req.query.status as string) || (isCustomer ? 'active' : 'all');
  const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  let sql = 'SELECT * FROM plans WHERE 1=1';
  const params: any[] = [];

  // Customer cannot view inactive plans
  if (isCustomer || statusParam === 'active') {
    sql += ' AND is_active = 1';
  } else if (statusParam === 'inactive') {
    sql += ' AND is_active = 0';
  }

  if (searchParam) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${searchParam}%`, `%${searchParam}%`);
  }

  sql += ' ORDER BY is_active DESC, price ASC';

  const rawPlans = await db.query(sql, params);
  const plansWithLines = await attachLinesToPlans(rawPlans);

  res.json({
    data: plansWithLines,
    message: 'Plans retrieved successfully',
  });
});

// 2. Get single plan details
plansRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const isCustomer = req.user?.role === 'customer';

  const plan = await db.queryOne('SELECT * FROM plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
  }

  if (isCustomer && !plan.is_active) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
  }

  const [planWithLines] = await attachLinesToPlans([plan]);

  res.json({
    data: planWithLines,
    message: 'Plan retrieved successfully',
  });
});

const planLineSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  variant_id: z.string().nullable().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
});

const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(255),
  description: z.string().nullable().optional(),
  billing_frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  billing_interval: z.number().int().min(1, 'Billing interval must be at least 1').default(1),
  price: z.number().min(0, 'Price must be non-negative'),
  min_qty: z.number().int().min(1, 'Minimum quantity must be at least 1').default(1),
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
  can_pause: z.boolean().default(true),
  can_renew: z.boolean().default(true),
  can_close_early: z.boolean().default(true),
  auto_close: z.boolean().default(false),
  lines: z.array(planLineSchema).optional().default([]),
});

// 3. Create plan (Staff or Admin)
plansRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createPlanSchema),
  async (req: Request, res: Response) => {
    const {
      name,
      description,
      billing_frequency,
      billing_interval,
      price,
      min_qty,
      start_date,
      end_date,
      can_pause,
      can_renew,
      can_close_early,
      auto_close,
      lines,
    } = req.body;

    // Validate date range if both provided
    if (start_date && end_date && start_date > end_date) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Availability start date cannot be later than end date' },
      });
    }

    // Validate plan lines if provided
    if (lines && lines.length > 0) {
      const validation = await validatePlanLines(lines);
      if (validation.error) {
        return res.status(400).json({ error: validation.error });
      }
    }

    const id = uuidv4();

    await db.transaction(async () => {
      await db.execute(
        `INSERT INTO plans (
          id, name, description, billing_frequency, billing_interval, price, min_qty,
          start_date, end_date, can_pause, can_renew, can_close_early, auto_close, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          name.trim(),
          description?.trim() || null,
          billing_frequency,
          billing_interval,
          price,
          min_qty,
          start_date || null,
          end_date || null,
          can_pause ? 1 : 0,
          can_renew ? 1 : 0,
          can_close_early ? 1 : 0,
          auto_close ? 1 : 0,
        ]
      );

      if (lines && lines.length > 0) {
        for (const line of lines) {
          await db.execute(
            `INSERT INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), id, line.product_id, line.variant_id || null, line.quantity]
          );
        }
      }
    });

    await AuditService.log('PLAN_CREATED', 'plans', id, req.user?.id, {
      name,
      billing_frequency,
      price,
      lines_count: lines?.length || 0,
    });

    const [createdPlan] = await attachLinesToPlans([
      await db.queryOne('SELECT * FROM plans WHERE id = ?', [id]),
    ]);

    res.status(201).json({
      data: createdPlan,
      message: 'Subscription plan created successfully',
    });
  }
);

const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  billing_frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  billing_interval: z.number().int().min(1).optional(),
  price: z.number().min(0).optional(),
  min_qty: z.number().int().min(1).optional(),
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
  can_pause: z.boolean().optional(),
  can_renew: z.boolean().optional(),
  can_close_early: z.boolean().optional(),
  auto_close: z.boolean().optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  lines: z.array(planLineSchema).optional(),
});

// 4. Update plan (Staff or Admin)
plansRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updatePlanSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const existing = await db.queryOne<{
      id: string;
      name: string;
      description: string | null;
      billing_frequency: string;
      billing_interval: number;
      price: number;
      min_qty: number;
      start_date: string | null;
      end_date: string | null;
      can_pause: number;
      can_renew: number;
      can_close_early: number;
      auto_close: number;
      is_active: number;
    }>('SELECT * FROM plans WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
    }

    const {
      name,
      description,
      billing_frequency,
      billing_interval,
      price,
      min_qty,
      start_date,
      end_date,
      can_pause,
      can_renew,
      can_close_early,
      auto_close,
      is_active,
      lines,
    } = req.body;

    const updatedStartDate = start_date !== undefined ? start_date : existing.start_date;
    const updatedEndDate = end_date !== undefined ? end_date : existing.end_date;

    if (updatedStartDate && updatedEndDate && updatedStartDate > updatedEndDate) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'Availability start date cannot be later than end date' },
      });
    }

    if (lines !== undefined) {
      const validation = await validatePlanLines(lines);
      if (validation.error) {
        return res.status(400).json({ error: validation.error });
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

    await db.transaction(async () => {
      await db.execute(
        `UPDATE plans 
         SET name = ?, description = ?, billing_frequency = ?, billing_interval = ?,
             price = ?, min_qty = ?, start_date = ?, end_date = ?,
             can_pause = ?, can_renew = ?, can_close_early = ?, auto_close = ?,
             is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name !== undefined ? name.trim() : existing.name,
          description !== undefined ? (description?.trim() || null) : existing.description,
          billing_frequency !== undefined ? billing_frequency : existing.billing_frequency,
          billing_interval !== undefined ? billing_interval : existing.billing_interval,
          price !== undefined ? price : existing.price,
          min_qty !== undefined ? min_qty : existing.min_qty,
          updatedStartDate,
          updatedEndDate,
          can_pause !== undefined ? (can_pause ? 1 : 0) : existing.can_pause,
          can_renew !== undefined ? (can_renew ? 1 : 0) : existing.can_renew,
          can_close_early !== undefined ? (can_close_early ? 1 : 0) : existing.can_close_early,
          auto_close !== undefined ? (auto_close ? 1 : 0) : existing.auto_close,
          updatedActive,
          id,
        ]
      );

      // If lines array was explicitly provided, replace lines atomically
      if (lines !== undefined) {
        await db.execute('DELETE FROM plan_lines WHERE plan_id = ?', [id]);
        for (const line of lines) {
          await db.execute(
            `INSERT INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), id, line.product_id, line.variant_id || null, line.quantity]
          );
        }
      }
    });

    await AuditService.log('PLAN_UPDATED', 'plans', id, req.user?.id, {
      updated_fields: Object.keys(req.body),
    });

    const [updatedPlan] = await attachLinesToPlans([
      await db.queryOne('SELECT * FROM plans WHERE id = ?', [id]),
    ]);

    res.json({
      data: updatedPlan,
      message: 'Plan updated successfully',
    });
  }
);

// 5. Activate plan
plansRouter.patch('/:id/activate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const plan = await db.queryOne('SELECT id FROM plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
  }

  await db.execute('UPDATE plans SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('PLAN_ACTIVATED', 'plans', id, req.user?.id);

  const [updatedPlan] = await attachLinesToPlans([
    await db.queryOne('SELECT * FROM plans WHERE id = ?', [id]),
  ]);

  res.json({
    data: updatedPlan,
    message: 'Plan activated successfully',
  });
});

// 6. Deactivate plan (soft toggle)
plansRouter.patch('/:id/deactivate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const plan = await db.queryOne('SELECT id FROM plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
  }

  await db.execute('UPDATE plans SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await AuditService.log('PLAN_DEACTIVATED', 'plans', id, req.user?.id);

  const [updatedPlan] = await attachLinesToPlans([
    await db.queryOne('SELECT * FROM plans WHERE id = ?', [id]),
  ]);

  res.json({
    data: updatedPlan,
    message: 'Plan deactivated successfully',
  });
});

// 7. Physical delete guard (prohibited if referenced by existing quotations or subscriptions)
plansRouter.delete('/:id', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const plan = await db.queryOne('SELECT id FROM plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } });
  }

  // Check references in quotations, subscriptions, and quotation_templates
  const quoteRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE plan_id = ?', [id]);
  const subRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ?', [id]);
  const tplRef = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM quotation_templates WHERE default_plan_id = ?',
    [id]
  );

  const totalRefs = (quoteRef?.count || 0) + (subRef?.count || 0) + (tplRef?.count || 0);

  if (totalRefs > 0) {
    return res.status(400).json({
      error: {
        code: 'PLAN_IN_USE',
        message:
          'Cannot delete plan because it is referenced by existing quotations, subscriptions, or templates. Deactivate it instead to preserve history.',
      },
    });
  }

  await db.transaction(async () => {
    await db.execute('DELETE FROM plan_lines WHERE plan_id = ?', [id]);
    await db.execute('DELETE FROM plans WHERE id = ?', [id]);
  });

  await AuditService.log('PLAN_DELETED', 'plans', id, req.user?.id);

  res.json({
    data: { id },
    message: 'Plan deleted successfully',
  });
});
