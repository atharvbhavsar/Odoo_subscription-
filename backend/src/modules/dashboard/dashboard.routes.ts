import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { DashboardService } from './dashboard.service';

export const dashboardRouter = Router();

// Executive financial summary & reporting aggregates (Admin & Staff only)
dashboardRouter.get('/summary', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  const data = await DashboardService.getSummary({
    startDate,
    endDate,
  });

  res.json({
    data,
    message: 'Dashboard financial summary retrieved successfully',
  });
});
