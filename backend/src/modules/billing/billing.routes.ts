import { Router, Request, Response } from 'express';
import { BillingService } from './billing.service';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { db } from '../../config/database';

export const billingRouter = Router();

// Staff/Admin can trigger a manual billing run
billingRouter.post('/run', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const targetDate = req.body.targetDate; // optional override for testing/backdating
  const result = await BillingService.runBilling(targetDate, req.user?.id);

  res.json({
    data: result,
    message: `Billing completed. Generated ${result.invoicesGenerated} invoices from ${result.subscriptionsChecked} subscriptions checked.`,
  });
});

// View billing run audit logs
billingRouter.get('/history', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const logs = await db.query(
    "SELECT * FROM audit_logs WHERE action = 'BILLING_RUN_EXECUTED' ORDER BY created_at DESC LIMIT 20"
  );
  res.json({ data: logs, message: 'Billing history retrieved' });
});

