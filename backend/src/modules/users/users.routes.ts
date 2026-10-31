import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

export const usersRouter = Router();

// Staff/Admin can list customers
usersRouter.get('/customers', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const customers = await db.query(`
    SELECT c.id, c.name, c.company_name, c.phone, c.address, u.email
    FROM customer_profiles c
    JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC
  `);

  res.json({
    data: customers,
    message: 'Customers retrieved successfully',
  });
});

