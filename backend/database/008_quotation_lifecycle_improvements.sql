-- Migration 008: Quotation Lifecycle Improvements
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS quotations_new (
  id TEXT PRIMARY KEY,
  quotation_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customer_profiles(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  discount_id TEXT REFERENCES discounts(id),
  tax_id TEXT REFERENCES taxes(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'quotation', 'sent', 'confirmed', 'cancelled', 'expired')) DEFAULT 'draft',
  valid_until TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0.00,
  discount_amount REAL NOT NULL DEFAULT 0.00,
  tax_amount REAL NOT NULL DEFAULT 0.00,
  total_amount REAL NOT NULL DEFAULT 0.00,
  subscription_id TEXT REFERENCES subscriptions(id),
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO quotations_new (id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, created_at)
SELECT id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, created_at
FROM quotations;

DROP TABLE quotations;

ALTER TABLE quotations_new RENAME TO quotations;

CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_subscription_id ON quotations(subscription_id) WHERE subscription_id IS NOT NULL;

ALTER TABLE subscriptions ADD COLUMN quotation_id TEXT REFERENCES quotations(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_quotation_id ON subscriptions(quotation_id) WHERE quotation_id IS NOT NULL;

PRAGMA foreign_keys = ON;
