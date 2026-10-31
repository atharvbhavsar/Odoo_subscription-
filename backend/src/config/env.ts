import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres.lpqhxnacbvztrkdfzebk:BrightloopSecure2026!@aws-0-eu-north-1.pooler.supabase.com:6543/postgres',
  SESSION_SECRET: process.env.SESSION_SECRET || 'brightloop-super-secret-session-key-dev-2026',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_TuQtACkOb0gXaC',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'Jvca6aLus3ucpN5CpDVJqymU',

  // Email delivery configuration
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Brightloop Billing <billing@brightloop.io>',
  EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',

  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://lpqhxnacbvztrkdfzebk.supabase.co',
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcWh4bmFjYnZ6dHJrZGZ6ZWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MjI2MTIsImV4cCI6MjEwODk5ODYxMn0.Wng-NvJ8SDyPnvAN4lS8s64sIF6indrxtJzm4dNpz20',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcWh4bmFjYnZ6dHJrZGZ6ZWJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzQyMjYxMiwiZXhwIjoyMTA4OTk4NjEyfQ.NOejM40_gep576OsamOsd-LSnFp_GpM_wMiJRJmWXuk',
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8kURIdf-62ec5EAUVFl6NQ_0yU5qNqP',

  // Company details for invoices
  COMPANY_NAME: process.env.COMPANY_NAME || 'Brightloop Software Inc.',
  COMPANY_ADDRESS: process.env.COMPANY_ADDRESS || '100 Innovation Way, Suite 400, San Francisco, CA 94105',
  COMPANY_TAX_ID: process.env.COMPANY_TAX_ID || 'US-EIN-94-1234567',
  COMPANY_EMAIL: process.env.COMPANY_EMAIL || 'billing@brightloop.io',
  COMPANY_PHONE: process.env.COMPANY_PHONE || '+1 (555) 019-2834',
  COMPANY_WEBSITE: process.env.COMPANY_WEBSITE || 'https://brightloop.io',
  PAYMENT_INSTRUCTIONS:
    process.env.PAYMENT_INSTRUCTIONS ||
    'Wire to Silicon Valley Bank | Routing: 121000358 | Account: 987654321, or pay securely online via Razorpay Customer Portal.',
};
