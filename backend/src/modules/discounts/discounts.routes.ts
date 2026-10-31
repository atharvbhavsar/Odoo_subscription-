import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const discountsRouter = Router();

discountsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const discounts = await db.query('SELECT * FROM discounts WHERE is_active = 1 ORDER BY created_at DESC');
  res.json({
    data: discounts,
    message: 'Discounts retrieved successfully',
  });
});

const createDiscountSchema = z.object({
  code: z.string().min(2).toUpperCase(),
  type: z.enum(['fixed', 'percentage']),
  value: z.number().min(0.01),
  min_purchase_amount: z.number().min(0).default(0),
  min_quantity: z.number().int().min(0).default(0),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  max_uses: z.number().int().min(0).default(0),
});

discountsRouter.post('/', requireAuth, requireRole(['admin']), validateRequest(createDiscountSchema), async (req: Request, res: Response) => {
  const { code, type, value, min_purchase_amount, min_quantity, start_date, end_date, max_uses } = req.body;

  const existing = await db.queryOne('SELECT id FROM discounts WHERE code = ?', [code]);
  if (existing) {
    return res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: 'Discount code already exists' } });
  }

  const id = uuidv4();
  await db.execute(
    `INSERT INTO discounts (id, code, type, value, min_purchase_amount, min_quantity, start_date, end_date, max_uses, used_count, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [id, code, type, value, min_purchase_amount, min_quantity, start_date || null, end_date || null, max_uses]
  );

  await AuditService.log('DISCOUNT_CREATED', 'discounts', id, req.user?.id, { code, type, value });

  res.status(201).json({
    data: { id, code, type, value, min_purchase_amount, min_quantity, start_date, end_date, max_uses, is_active: 1 },
    message: 'Discount created successfully',
  });
});

