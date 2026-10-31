import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const taxesRouter = Router();

taxesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const taxes = await db.query('SELECT * FROM taxes WHERE is_active = 1 ORDER BY rate_percentage ASC');
  res.json({
    data: taxes,
    message: 'Taxes retrieved successfully',
  });
});

const createTaxSchema = z.object({
  name: z.string().min(1),
  rate_percentage: z.number().min(0).max(100),
});

taxesRouter.post('/', requireAuth, requireRole(['admin']), validateRequest(createTaxSchema), async (req: Request, res: Response) => {
  const { name, rate_percentage } = req.body;
  const id = uuidv4();

  await db.execute('INSERT INTO taxes (id, name, rate_percentage, is_active) VALUES (?, ?, ?, 1)', [id, name, rate_percentage]);
  await AuditService.log('TAX_CREATED', 'taxes', id, req.user?.id, { name, rate_percentage });

  res.status(201).json({
    data: { id, name, rate_percentage, is_active: 1 },
    message: 'Tax created successfully',
  });
});

