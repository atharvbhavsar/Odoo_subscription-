# Database Schema Specification

Target Database: Supabase PostgreSQL (Supports SQL transactions, constraints, and numeric precision)

## Tables & Constraints

### 1. `users`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `email` VARCHAR(255) UNIQUE NOT NULL
- `password_hash` VARCHAR(255) NOT NULL
- `role` VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'customer'))
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

### 2. `customer_profiles`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `user_id` UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE
- `name` VARCHAR(255) NOT NULL
- `company_name` VARCHAR(255)
- `phone` VARCHAR(50)
- `address` TEXT
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 3. `products`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `name` VARCHAR(255) NOT NULL
- `type` VARCHAR(50) DEFAULT 'service'
- `sales_price` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `cost_price` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `is_active` BOOLEAN DEFAULT TRUE
- `notes` TEXT
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 4. `product_variants`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `product_id` UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE
- `attribute_name` VARCHAR(100) NOT NULL
- `attribute_value` VARCHAR(100) NOT NULL
- `price_extra` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 5. `plans`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `name` VARCHAR(255) NOT NULL
- `billing_frequency` VARCHAR(20) NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly'))
- `price` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `min_qty` INTEGER NOT NULL DEFAULT 1
- `is_active` BOOLEAN DEFAULT TRUE
- `can_pause` BOOLEAN DEFAULT TRUE
- `can_renew` BOOLEAN DEFAULT TRUE
- `can_close_early` BOOLEAN DEFAULT TRUE
- `auto_close` BOOLEAN DEFAULT FALSE
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 6. `taxes`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `name` VARCHAR(100) NOT NULL
- `rate_percentage` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `is_active` BOOLEAN DEFAULT TRUE
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 7. `discounts`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `code` VARCHAR(50) UNIQUE NOT NULL
- `type` VARCHAR(20) NOT NULL CHECK (type IN ('fixed', 'percentage'))
- `value` NUMERIC(12, 2) NOT NULL
- `min_purchase_amount` NUMERIC(12, 2) DEFAULT 0.00
- `min_quantity` INTEGER DEFAULT 0
- `start_date` DATE
- `end_date` DATE
- `max_uses` INTEGER DEFAULT 0
- `used_count` INTEGER DEFAULT 0
- `is_active` BOOLEAN DEFAULT TRUE
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 8. `quotations`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `quotation_number` VARCHAR(50) UNIQUE NOT NULL
- `customer_id` UUID NOT NULL REFERENCES customer_profiles(id)
- `plan_id` UUID NOT NULL REFERENCES plans(id)
- `discount_id` UUID REFERENCES discounts(id)
- `tax_id` UUID REFERENCES taxes(id)
- `status` VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'cancelled')) DEFAULT 'draft'
- `valid_until` DATE NOT NULL
- `subtotal` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `discount_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `tax_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 9. `quotation_lines`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `quotation_id` UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE
- `product_id` UUID NOT NULL REFERENCES products(id)
- `variant_id` UUID REFERENCES product_variants(id)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `unit_price` NUMERIC(12, 2) NOT NULL
- `subtotal` NUMERIC(12, 2) NOT NULL

### 10. `subscriptions`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `subscription_number` VARCHAR(50) UNIQUE NOT NULL
- `customer_id` UUID NOT NULL REFERENCES customer_profiles(id)
- `plan_id` UUID NOT NULL REFERENCES plans(id)
- `discount_id` UUID REFERENCES discounts(id)
- `tax_id` UUID REFERENCES taxes(id)
- `status` VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed', 'expired')) DEFAULT 'confirmed'
- `start_date` DATE NOT NULL
- `end_date` DATE
- `next_billing_date` DATE NOT NULL
- `billing_frequency` VARCHAR(20) NOT NULL
- `subtotal` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `discount_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `tax_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `created_at` TIMESTAMPTZ DEFAULT NOW()

### 11. `subscription_lines`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `subscription_id` UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE
- `product_id` UUID NOT NULL REFERENCES products(id)
- `variant_id` UUID REFERENCES product_variants(id)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `unit_price` NUMERIC(12, 2) NOT NULL
- `subtotal` NUMERIC(12, 2) NOT NULL

### 12. `invoices`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `invoice_number` VARCHAR(50) UNIQUE NOT NULL
- `subscription_id` UUID NOT NULL REFERENCES subscriptions(id)
- `customer_id` UUID NOT NULL REFERENCES customer_profiles(id)
- `period_start` DATE NOT NULL
- `period_end` DATE NOT NULL
- `due_date` DATE NOT NULL
- `status` VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'confirmed', 'partially_paid', 'paid', 'cancelled')) DEFAULT 'confirmed'
- `subtotal` NUMERIC(12, 2) NOT NULL
- `discount_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `tax_amount` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_amount` NUMERIC(12, 2) NOT NULL
- `amount_paid` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `amount_due` NUMERIC(12, 2) NOT NULL
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- **CRITICAL CONSTRAINT:** `CONSTRAINT unique_sub_period UNIQUE(subscription_id, period_start)`

### 13. `invoice_lines`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `invoice_id` UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE
- `product_id` UUID NOT NULL REFERENCES products(id)
- `variant_id` UUID REFERENCES product_variants(id)
- `description` VARCHAR(255) NOT NULL
- `quantity` INTEGER NOT NULL
- `unit_price` NUMERIC(12, 2) NOT NULL
- `subtotal` NUMERIC(12, 2) NOT NULL

### 14. `payments`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `invoice_id` UUID NOT NULL REFERENCES invoices(id)
- `amount` NUMERIC(12, 2) NOT NULL CHECK (amount > 0)
- `payment_method` VARCHAR(50) NOT NULL DEFAULT 'razorpay'
- `gateway_order_id` VARCHAR(100)
- `gateway_payment_id` VARCHAR(100) UNIQUE
- `gateway_signature` VARCHAR(255)
- `status` VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'successful', 'failed')) DEFAULT 'successful'
- `notes` TEXT
- `recorded_at` TIMESTAMPTZ DEFAULT NOW()

### 15. `audit_logs`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `user_id` UUID REFERENCES users(id)
- `action` VARCHAR(100) NOT NULL
- `entity` VARCHAR(100) NOT NULL
- `entity_id` UUID
- `payload` JSONB
- `created_at` TIMESTAMPTZ DEFAULT NOW()

