-- Seed Data for Brightloop Subscription Manager

-- Users: password is 'Password@123' (hashed via bcrypt or plain in dev fallback)
INSERT OR IGNORE INTO users (id, email, password_hash, role)
VALUES 
  ('usr-admin-01', 'admin@brightloop.com', '$2b$10$wE995.UeNlHw/j2lJ0U2uehE71wZ7x5hQ4YpPn4M5g6V2yO5sD7ye', 'admin'),
  ('usr-staff-01', 'staff@brightloop.com', '$2b$10$wE995.UeNlHw/j2lJ0U2uehE71wZ7x5hQ4YpPn4M5g6V2yO5sD7ye', 'staff'),
  ('usr-cust-01', 'customer@acme.com', '$2b$10$wE995.UeNlHw/j2lJ0U2uehE71wZ7x5hQ4YpPn4M5g6V2yO5sD7ye', 'customer');

INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name, phone, address)
VALUES 
  ('cust-01', 'usr-cust-01', 'Acme Customer', 'Acme Corp', '+1-555-0199', '123 Market St, Tech City');

-- Products & Variants
INSERT OR IGNORE INTO products (id, name, type, sales_price, cost_price, is_active, notes)
VALUES 
  ('prod-01', 'Brightloop ERP Core', 'service', 200.00, 50.00, 1, 'Core ERP system subscription'),
  ('prod-02', 'Storage Add-on (100GB)', 'service', 50.00, 10.00, 1, 'Extra secure cloud storage');

INSERT OR IGNORE INTO product_variants (id, product_id, attribute_name, attribute_value, price_extra, is_active)
VALUES 
  ('var-01', 'prod-01', 'Brand Edition', 'Odoo Brand Edition', 560.00, 1);

-- Plans
INSERT OR IGNORE INTO plans (id, name, description, billing_frequency, billing_interval, price, min_qty, is_active, can_pause, can_renew, can_close_early, auto_close)
VALUES 
  ('plan-monthly-01', 'Professional Monthly', 'Full ERP core package with recurring monthly cadence', 'monthly', 1, 200.00, 1, 1, 1, 1, 1, 0),
  ('plan-yearly-01', 'Enterprise Annual', 'Yearly enterprise commitment with bundled volume savings', 'yearly', 1, 2000.00, 1, 1, 1, 1, 1, 0);

-- Plan Lines
INSERT OR IGNORE INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
VALUES
  ('pline-01', 'plan-monthly-01', 'prod-01', NULL, 1);

-- Taxes
INSERT OR IGNORE INTO taxes (id, name, rate_percentage, is_active)
VALUES 
  ('tax-gst-18', 'GST 18%', 18.00, 1),
  ('tax-vat-5', 'VAT 5%', 5.00, 1);

-- Discounts
INSERT OR IGNORE INTO discounts (id, code, type, value, min_purchase_amount, min_quantity, start_date, end_date, max_uses, used_count, is_active)
VALUES 
  ('disc-early10', 'EARLY10', 'percentage', 10.00, 100.00, 1, '2026-01-01', '2026-12-31', 100, 0, 1),
  ('disc-flat50', 'FLAT50', 'fixed', 50.00, 200.00, 1, '2026-01-01', '2026-12-31', 50, 0, 1);
