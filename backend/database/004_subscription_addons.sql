-- Migration 003: Subscription Add-Ons
CREATE TABLE IF NOT EXISTS subscription_addons (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price REAL NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending_activation', 'active', 'pending_removal', 'removed')) DEFAULT 'pending_activation',
  effective_start_date TEXT NOT NULL,
  effective_end_date TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_addons_sub_id ON subscription_addons(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_addons_status ON subscription_addons(status);

