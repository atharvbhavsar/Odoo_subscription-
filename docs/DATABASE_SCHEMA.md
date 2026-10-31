# Database Schema Specification

**Target Database:** Supabase PostgreSQL (Production) / SQLite Driver (Testing & Local Development)  
**Migration Strategy:** Sequential versioned `.sql` files in `database/migrations/`  
**Monetary Standard:** `NUMERIC(12, 2)` (PostgreSQL) / `REAL` (SQLite with explicit half-up two-decimal rounding)

---

## 1. Relational Entity Diagram

```text
users ──< customer_profiles ──< quotations ──< quotation_lines
  │                                  │
  ├──< password_reset_tokens         └──> subscriptions ──< subscription_lines
  │                                            │
  ├──< audit_logs                              ├──> subscription_addons
  │                                            │
  └──< quotation_templates ──< quotation_template_lines └──> invoices ──< invoice_lines
                                                                 │
                                                                 └──< payments
```

---

## 2. Table Definitions & Constraints

### 2.1 `users`
Core user identity and authentication credentials.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Unique user identifier |
| `email` | `TEXT` / `VARCHAR(255)` | `UNIQUE NOT NULL` | Login email address |
| `password_hash` | `TEXT` / `VARCHAR(255)` | `NOT NULL` | Bcrypt password hash (cost factor 10) |
| `role` | `TEXT` / `VARCHAR(20)` | `NOT NULL CHECK (role IN ('admin', 'staff', 'customer'))` | User permission role |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Account creation timestamp |
| `updated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Last profile update timestamp |

### 2.2 `customer_profiles`
Customer organization details linked 1:1 with customer users.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Customer profile identifier |
| `user_id` | `TEXT` / `UUID` | `UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Link to user account |
| `name` | `TEXT` / `VARCHAR(255)` | `NOT NULL` | Primary customer contact name |
| `company_name` | `TEXT` / `VARCHAR(255)` | `NULLABLE` | Business organization name |
| `phone` | `TEXT` / `VARCHAR(50)` | `NULLABLE` | Contact phone number |
| `address` | `TEXT` | `NULLABLE` | Billing address |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Profile creation timestamp |

### 2.3 `password_reset_tokens`
Time-limited, single-use password reset tokens storing SHA-256 hashes only.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Token record identifier |
| `user_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Associated user |
| `token_hash` | `TEXT` | `UNIQUE NOT NULL` | SHA-256 hash of random token (raw token is never stored) |
| `expires_at` | `TIMESTAMP` | `NOT NULL` | 1-hour expiration timestamp |
| `used_at` | `TIMESTAMP` | `NULLABLE` | Timestamp when token was consumed (enforces single-use) |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Token generation timestamp |

### 2.4 `products`
Base software and add-on catalogue items.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Product identifier |
| `name` | `TEXT` / `VARCHAR(255)` | `NOT NULL` | Product name (e.g. Brightloop ERP) |
| `type` | `TEXT` / `VARCHAR(50)` | `DEFAULT 'service'` | Product type |
| `sales_price` | `NUMERIC(12, 2)` | `NOT NULL DEFAULT 0.00` | Authoritative sales price |
| `cost_price` | `NUMERIC(12, 2)` | `NOT NULL DEFAULT 0.00` | Internal cost price |
| `is_active` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Active catalogue status |
| `notes` | `TEXT` | `NULLABLE` | Description and sales notes |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Created timestamp |

### 2.5 `product_variants`
Pricing variations for products (e.g. Odoo brand edition).
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Variant identifier |
| `product_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES products(id) ON DELETE CASCADE` | Parent product |
| `attribute_name` | `TEXT` / `VARCHAR(100)` | `NOT NULL` | Attribute name (e.g. 'Brand') |
| `attribute_value` | `TEXT` / `VARCHAR(100)` | `NOT NULL` | Attribute value (e.g. 'Odoo Brand Edition') |
| `price_extra` | `NUMERIC(12, 2)` | `NOT NULL DEFAULT 0.00` | Additional fee added to base price (+560.00) |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Created timestamp |

### 2.6 `plans`
Recurring billing cadences and lifecycle permissions.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Plan identifier |
| `name` | `TEXT` / `VARCHAR(255)` | `NOT NULL` | Plan name (e.g. Professional Monthly) |
| `billing_frequency`| `TEXT` | `CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly'))` | Cadence |
| `price` | `NUMERIC(12, 2)` | `NOT NULL DEFAULT 0.00` | Base recurring fee |
| `min_qty` | `INTEGER` | `NOT NULL DEFAULT 1` | Minimum seat quantity |
| `is_active` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Available for new subscriptions |
| `can_pause` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Policy: permits user pause |
| `can_renew` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Policy: permits renewal |
| `can_close_early` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Policy: permits cancellation before term |
| `auto_close` | `INTEGER` / `BOOLEAN` | `DEFAULT 0` | Policy: close automatically after term |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Created timestamp |

### 2.7 `taxes`
Configurable tax rules applied to invoices.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Tax identifier |
| `name` | `TEXT` / `VARCHAR(100)` | `NOT NULL` | Tax label (e.g. GST 18%) |
| `rate_percentage`| `NUMERIC(5, 2)` | `NOT NULL DEFAULT 0.00` | Percentage rate (e.g. 18.00) |
| `is_active` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Active status |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Created timestamp |

### 2.8 `discounts`
Promotional coupons and volume discount rules.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Discount identifier |
| `code` | `TEXT` / `VARCHAR(50)` | `UNIQUE NOT NULL` | Coupon code (e.g. EARLYBIRD10) |
| `type` | `TEXT` / `VARCHAR(20)` | `CHECK (type IN ('fixed', 'percentage'))` | Discount type |
| `value` | `NUMERIC(12, 2)` | `NOT NULL` | Discount amount or percentage |
| `min_purchase_amount`| `NUMERIC(12, 2)` | `DEFAULT 0.00` | Minimum subtotal required |
| `min_quantity` | `INTEGER` | `DEFAULT 0` | Minimum seat quantity required |
| `start_date` | `DATE` / `TEXT` | `NULLABLE` | Start of validity period |
| `end_date` | `DATE` / `TEXT` | `NULLABLE` | End of validity period |
| `max_uses` | `INTEGER` | `DEFAULT 0` | Max total usage (0 = unlimited) |
| `used_count` | `INTEGER` | `DEFAULT 0` | Total times consumed |
| `is_active` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Active status |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Created timestamp |

### 2.9 `quotations` & `quotation_lines`
Customer price offers drafted by staff before turning into subscriptions.
- `quotations`: `id`, `quotation_number` (UNIQUE), `customer_id`, `plan_id`, `discount_id`, `tax_id`, `status` (`'draft'`, `'quotation'`, `'confirmed'`, `'cancelled'`), `valid_until`, `subtotal`, `discount_amount`, `tax_amount`, `total_amount`, `created_at`.
- `quotation_lines`: `id`, `quotation_id` (CASCADE), `product_id`, `variant_id`, `quantity`, `unit_price`, `subtotal`.

### 2.10 `subscriptions` & `subscription_lines`
Active recurring contracts driving the billing schedule.
- `subscriptions`: `id`, `subscription_number` (UNIQUE), `customer_id`, `plan_id`, `discount_id`, `tax_id`, `status` (`'draft'`, `'quotation'`, `'confirmed'`, `'active'`, `'paused'`, `'closed'`, `'expired'`), `start_date`, `end_date`, `next_billing_date`, `billing_frequency`, `subtotal`, `discount_amount`, `tax_amount`, `total_amount`, `created_at`.
- `subscription_lines`: `id`, `subscription_id` (CASCADE), `product_id`, `variant_id`, `quantity`, `unit_price`, `subtotal`.

### 2.11 `invoices` & `invoice_lines`
Periodic billing statements generated from active subscriptions.
- `invoices`:
  - `id`: Primary key UUID.
  - `invoice_number`: Unique invoice number (e.g. `INV-123456-789`).
  - `subscription_id`: Foreign key to `subscriptions(id)`.
  - `customer_id`: Foreign key to `customer_profiles(id)`.
  - `period_start`: Billing cycle start date.
  - `period_end`: Billing cycle end date.
  - `due_date`: Payment due date.
  - `status`: `'draft' | 'confirmed' | 'partially_paid' | 'paid' | 'cancelled'`.
  - `subtotal`, `discount_amount`, `tax_amount`, `total_amount`: Authoritative monetary snapshot.
  - `amount_paid`: Sum of verified successful payments.
  - `amount_due`: Remaining outstanding balance (`total_amount - amount_paid`).
  - **CRITICAL CONSTRAINT:** `CONSTRAINT unique_sub_period UNIQUE(subscription_id, period_start)`  
    *(Guarantees that re-running billing never creates duplicate period invoices).*
- `invoice_lines`:
  - `id`, `invoice_id` (CASCADE), `product_id`, `variant_id`, `description`, `quantity`, `unit_price`, `subtotal`.  
    *(Stores snapshot descriptions and prices so catalogue changes never alter past invoices).*

### 2.12 `payments`
Audit trail of recorded customer settlements.
- `id`: Primary key UUID.
- `invoice_id`: Foreign key to `invoices(id)`.
- `amount`: Verified payment amount (`CHECK (amount > 0)`).
- `payment_method`: `'razorpay' | 'bank_transfer' | 'check' | 'cash'`.
- `gateway_order_id`: Razorpay Order identifier.
- `gateway_payment_id`: Razorpay Payment identifier (`UNIQUE` to enforce idempotency).
- `gateway_signature`: Razorpay HMAC-SHA256 signature string.
- `status`: `'pending' | 'successful' | 'failed'`.
- `notes`: Administrative or settlement memo.
- `recorded_at`: Timestamp.

### 2.13 `audit_logs`
System-wide audit log for compliance.
- `id`, `user_id`, `action`, `entity`, `entity_id`, `payload` (JSONB / TEXT), `created_at`.

### 2.14 `quotation_templates`
Pre-configured line item bundles for fast quotation drafting.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Template identifier |
| `name` | `TEXT` / `VARCHAR(255)` | `NOT NULL` | Template name (e.g. Standard Enterprise Setup) |
| `description` | `TEXT` | `NULLABLE` | Template description |
| `default_plan_id` | `TEXT` / `UUID` | `NULLABLE REFERENCES plans(id) ON DELETE SET NULL` | Suggested default subscription plan |
| `is_active` | `INTEGER` / `BOOLEAN` | `DEFAULT 1` | Active status |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Last update timestamp |

### 2.15 `quotation_template_lines`
Specific product and variant line items bundled within a quotation template.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Line item identifier |
| `template_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE` | Parent template |
| `product_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES products(id)` | Associated product |
| `variant_id` | `TEXT` / `UUID` | `NULLABLE REFERENCES product_variants(id)` | Associated product variant |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK (quantity > 0)` | Default item quantity |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Creation timestamp |

### 2.16 `subscription_addons`
Supplementary recurring products/services attached to an active subscription.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `TEXT` / `UUID` | `PRIMARY KEY` | Add-on identifier |
| `subscription_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE` | Associated subscription |
| `product_id` | `TEXT` / `UUID` | `NOT NULL REFERENCES products(id)` | Associated product |
| `variant_id` | `TEXT` / `UUID` | `NULLABLE REFERENCES product_variants(id)` | Optional product variant |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK (quantity > 0)` | Number of add-on units |
| `unit_price` | `NUMERIC(12, 2)` | `NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0)` | Agreed price snapshot per unit |
| `status` | `TEXT` | `CHECK (status IN ('pending_activation', 'active', 'pending_removal', 'removed'))` | Add-on lifecycle state |
| `effective_start_date` | `DATE` / `TEXT` | `NOT NULL` | Billing date from which add-on is billed (next billing period) |
| `effective_end_date` | `DATE` / `TEXT` | `NULLABLE` | Billing date from which add-on removal takes effect |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | Last update timestamp |

---

## 3. Migration Policy
1. All changes must be written as a versioned script in `backend/database/`:
   - `001_initial_schema.sql`: Core schema (users, customer profiles, products, variants, plans, subscriptions, invoices, payments, audit logs)
   - `002_quotation_templates.sql`: Quotation template heads and line items
   - `003_invoice_emails.sql`: Email tracking metadata on invoices
   - `004_subscription_addons.sql`: Subscription add-on line items and lifecycle states
   - `005_product_variants_active.sql`: Active/inactive flags on product variants
   - `006_plan_improvements.sql`: Plan billing intervals and lifecycle policy rules
   - `007_tax_discount_improvements.sql`: Tax and discount validity date ranges and usage limits
   - `008_quotation_lifecycle_improvements.sql`: Quotation status transitions, expiration, and subscription linkage
   - `009_subscription_lifecycle_improvements.sql`: Pause/resume/renew/close tracking and add-on termination rules
2. Schema changes must be agreed upon between Atharv and Ruturaj before deployment.
3. Zero destructive changes to historical invoices or payment records.
