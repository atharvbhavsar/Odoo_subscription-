-- Initial Schema for Brightloop Subscription Manager

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'customer')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'service',
  sales_price REAL NOT NULL DEFAULT 0.00,
  cost_price REAL NOT NULL DEFAULT 0.00,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_name TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  price_extra REAL NOT NULL DEFAULT 0.00,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  price REAL NOT NULL DEFAULT 0.00,
  min_qty INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  can_pause INTEGER DEFAULT 1,
  can_renew INTEGER DEFAULT 1,
  can_close_early INTEGER DEFAULT 1,
  auto_close INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS taxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rate_percentage REAL NOT NULL DEFAULT 0.00,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discounts (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percentage')),
  value REAL NOT NULL,
  min_purchase_amount REAL DEFAULT 0.00,
  min_quantity INTEGER DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  quotation_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customer_profiles(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  discount_id TEXT REFERENCES discounts(id),
  tax_id TEXT REFERENCES taxes(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'cancelled')) DEFAULT 'draft',
  valid_until TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0.00,
  discount_amount REAL NOT NULL DEFAULT 0.00,
  tax_amount REAL NOT NULL DEFAULT 0.00,
  total_amount REAL NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_lines (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  subscription_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customer_profiles(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  discount_id TEXT REFERENCES discounts(id),
  tax_id TEXT REFERENCES taxes(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed', 'expired')) DEFAULT 'confirmed',
  start_date TEXT NOT NULL,
  end_date TEXT,
  next_billing_date TEXT NOT NULL,
  billing_frequency TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0.00,
  discount_amount REAL NOT NULL DEFAULT 0.00,
  tax_amount REAL NOT NULL DEFAULT 0.00,
  total_amount REAL NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_lines (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  customer_id TEXT NOT NULL REFERENCES customer_profiles(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'partially_paid', 'paid', 'cancelled')) DEFAULT 'confirmed',
  subtotal REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0.00,
  tax_amount REAL NOT NULL DEFAULT 0.00,
  total_amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0.00,
  amount_due REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_sub_period UNIQUE(subscription_id, period_start)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT REFERENCES product_variants(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'razorpay',
  gateway_order_id TEXT,
  gateway_payment_id TEXT UNIQUE,
  gateway_signature TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'successful', 'failed')) DEFAULT 'successful',
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  payload TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

