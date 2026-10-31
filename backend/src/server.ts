import { app } from './app';
import { env } from './config/env';
import { runMigrations } from './config/migrate';
import { runSeeds } from './config/seed';
import { startBillingScheduler } from './jobs/billing.job';

async function bootstrap() {
  try {
    // Run migrations and seeds on startup
    await runMigrations();
    await runSeeds();

    // Start background billing scheduler
    startBillingScheduler();

    app.listen(env.PORT, () => {
      console.log(`[Brightloop API] Server running on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

