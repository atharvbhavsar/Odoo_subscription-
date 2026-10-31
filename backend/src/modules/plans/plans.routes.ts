import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const plansRouter = Router();

// List plans
plansRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const plans = await db.query('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC');
  res.json({
    data: plans,
    message: 'Plans retrieved successfully',
  });
});

const createPlanSchema = z.object({
  name: z.string().min(1),
  billing_frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  price: z.number().min(0),
  min_qty: z.number().int().min(1).default(1),
  can_pause: z.boolean().default(true),
  can_renew: z.boolean().default(true),
  can_close_early: z.boolean().default(true),
  auto_close: z.boolean().default(false),
});

// Admin creates plan
plansRouter.post('/', requireAuth, requireRole(['admin']), validateRequest(createPlanSchema), async (req: Request, res: Response) => {
  const { name, billing_frequency, price, min_qty, can_pause, can_renew, can_close_early, auto_close } = req.body;
  const id = uuidv4();

  await db.execute(
    `INSERT INTO plans (id, name, billing_frequency, price, min_qty, can_pause, can_renew, can_close_early, auto_close, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, name, billing_frequency, price, min_qty, can_pause ? 1 : 0, can_renew ? 1 : 0, can_close_early ? 1 : 0, auto_close ? 1 : 0]
  );

  await AuditService.log('PLAN_CREATED', 'plans', id, req.user?.id, { name, billing_frequency, price });

  res.status(201).json({
    data: { id, name, billing_frequency, price, min_qty, can_pause, can_renew, can_close_early, auto_close, is_active: 1 },
    message: 'Plan created successfully',
  });
});

