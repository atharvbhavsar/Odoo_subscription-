import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { sessionMiddleware } from './config/session';
import { errorHandler } from './middleware/error.middleware';

import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { productsRouter } from './modules/products/products.routes';
import { plansRouter } from './modules/plans/plans.routes';
import { taxesRouter } from './modules/taxes/taxes.routes';
import { discountsRouter } from './modules/discounts/discounts.routes';
import { quotationsRouter } from './modules/quotations/quotations.routes';
import { quotationTemplatesRouter } from './modules/quotations/quotation-templates.routes';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

const app = express();
(app as any).app = app;
(app as any).default = app;

app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    message: 'Brightloop API is active',
  });
});

// Module routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/taxes', taxesRouter);
app.use('/api/discounts', discountsRouter);
app.use('/api/quotations', quotationsRouter);
app.use('/api/quotation-templates', quotationTemplatesRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/dashboard', dashboardRouter);

// Central error handler
app.use(errorHandler);

export = app;
