import cron from 'node-cron';
import { BillingService } from '../modules/billing/billing.service';

export function startBillingScheduler() {
  // Run daily at midnight: 0 0 * * *
  // For development/demo, also supports manual trigger through API
  const job = cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running scheduled recurring billing job...');
    try {
      const res = await BillingService.runBilling();
      console.log(`[Scheduler] Billing complete: ${res.invoicesGenerated} invoices generated.`);
    } catch (err) {
      console.error('[Scheduler] Error running billing job:', err);
    }
  });

  return job;
}

