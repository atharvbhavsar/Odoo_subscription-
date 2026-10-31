import { Router, Request, Response } from 'express';
import { BillingService } from './billing.service';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { db } from '../../config/database';

export const billingRouter = Router();

// Admin-only manual billing run endpoint
billingRouter.post('/run', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  const targetDate = req.body.targetDate; // optional date override for testing/backdating
  const result = await BillingService.runBilling(targetDate, req.user?.id);

  res.json({
    data: result,
    message: `Billing run completed in ${result.durationMs}ms. Generated ${result.invoicesGenerated} invoices (${result.alreadyBilledCount} already billed, ${result.skippedCount} skipped, ${result.errors.length} errors).`,
  });
});

// Admin/Staff view billing execution logs
billingRouter.get('/history', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const logs = await db.query(
    "SELECT * FROM audit_logs WHERE action = 'BILLING_RUN_EXECUTED' ORDER BY created_at DESC LIMIT 20"
  );
  res.json({ data: logs, message: 'Billing execution history retrieved' });
});
