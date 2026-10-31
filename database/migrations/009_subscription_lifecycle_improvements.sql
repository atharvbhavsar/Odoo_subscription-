-- Migration 009: Subscription Lifecycle Improvements
ALTER TABLE subscriptions ADD COLUMN updated_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN paused_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN closed_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN renewed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
