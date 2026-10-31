-- Migration 006: Subscription Plan Improvements & Plan Lines
ALTER TABLE plans ADD COLUMN description TEXT;
ALTER TABLE plans ADD COLUMN billing_interval INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN start_date TEXT;
ALTER TABLE plans ADD COLUMN end_date TEXT;
ALTER TABLE plans ADD COLUMN updated_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS plan_lines (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_lines_plan_id ON plan_lines(plan_id);
