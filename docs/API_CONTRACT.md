# Shared API Contract & Integration Specification

**Product:** Brightloop Subscription Manager  
**Version:** 1.0  
**Ownership:** Ruturaj (Backend, Database, Core Billing) & Atharv (Auth Foundation, Invoice Operations, Payments, Dashboard, Client Portal)  
**Base URL:** `/api`

---

## 1. Architectural Conventions & Global Standards

### 1.1 Envelope Formats
Every response returned by the backend uses a standardized envelope structure.

#### Success Envelope (`200 OK`, `201 Created`):
```json
{
  "data": {},
  "message": "Operation completed successfully"
}
```

#### Error Envelope (`400`, `401`, `403`, `404`, `409`, `429`, `500`):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error description",
    "details": [
      { "path": "email", "message": "Invalid email address" }
    ]
  }
}
```

### 1.2 Common Error Codes
- `UNAUTHORIZED` (401): Missing or expired session cookie.
- `FORBIDDEN` (403): User role lacks permission or violates customer data ownership boundaries.
- `VALIDATION_ERROR` (400): Schema validation failure (Zod).
- `NOT_FOUND` (404): Resource ID does not exist.
- `EMAIL_ALREADY_EXISTS` (409): Attempting to register an email already in use.
- `DUPLICATE_PERIOD_INVOICE` (409): Unique constraint violation on `(subscription_id, period_start)`.
- `INVALID_SIGNATURE` (400): Razorpay payment signature verification failed.
- `TOO_MANY_REQUESTS` (429): Rate limiter threshold exceeded on sensitive auth routes.

### 1.3 Monetary and Numerical Standards
- Monetary calculations run strictly on the backend.
- Authoritative money values use PostgreSQL `NUMERIC(12, 2)` or two-decimal decimal-safe rounding.
- Rounding rule: Standard half-up to two decimal places: `Math.round((val + Number.EPSILON) * 100) / 100`.
- Historical snapshot rule: Invoice lines and totals snapshot product unit prices, variants, discounts, and taxes at generation time. Changing catalogue prices must never alter past invoices.

---

## 2. Authentication, Session & User Roles

### 2.1 User Roles & RBAC Matrix
| Role | Permissions & Access Scope |
|---|---|
| **`admin`** | Full access to users, staff creation, product catalogue, variant pricing, subscription plans, taxes, discounts, quotation creation/confirmation, manual billing engine runs, all invoices, all payments, executive dashboard, and audit logs. |
| **`staff`** | Operational access to products, plans, customer quotations, confirming quotes into subscriptions, viewing all invoices, recording offline payments, viewing dashboard metrics, and triggering manual billing runs. Cannot provision staff or alter core tax policies. |
| **`customer`** | Self-service access only. Can register, log in, view own profile, view own active subscriptions, download own invoice PDFs, pay outstanding invoices via Razorpay Test Mode, and pause/resume/close subscriptions *only if allowed by plan policy*. Strictly blocked from viewing other customers' data or administrative endpoints. |

### 2.2 Session Security
- Stored via server-side session with HTTP-only cookie (`brightloop.sid`).
- Cookie flags: `httpOnly: true`, `secure: true` in production, `sameSite: 'none'` (cross-site Vercel-to-Render) or `'lax'` (local dev).
- Session expiry: 7 days.
- Rate limiting: Max 10–15 attempts per minute per IP on `/login`, `/register`, `/forgot-password`, `/reset-password`.

---

## 3. Detailed Endpoint Contracts

### 3.1 Authentication Module (`/api/auth`)

#### `POST /api/auth/register`
- **Access:** Public
- **Behavior:** Strictly assigns `role: "customer"`. Ignores/strips any `role` in request payload. Creates `users` record and linked `customer_profiles` record in a single transaction. Sets session cookie.
- **Request:**
  ```json
  {
    "email": "customer@example.com",
    "password": "Password!123",
    "name": "Jane Doe",
    "companyName": "Acme Inc",
    "phone": "+1-555-0100",
    "address": "123 Market St"
  }
  ```
- **Password Complexity Rule:** Length > 8 characters, at least 1 uppercase letter, 1 lowercase letter, and 1 special symbol.
- **Response (`201 Created`):**
  ```json
  {
    "data": {
      "user": {
        "id": "usr-uuid",
        "email": "customer@example.com",
        "role": "customer",
        "customerId": "cust-uuid",
        "name": "Jane Doe"
      }
    },
    "message": "Registration successful"
  }
  ```

#### `POST /api/auth/login`
- **Access:** Public
- **Behavior:** Verifies email and bcrypt password hash. Sets session cookie (`brightloop.sid`).
- **Request:**
  ```json
  { "email": "customer@example.com", "password": "Password!123" }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "data": {
      "user": {
        "id": "usr-uuid",
        "email": "customer@example.com",
        "role": "customer",
        "customerId": "cust-uuid",
        "name": "Jane Doe"
      }
    },
    "message": "Login successful"
  }
  ```

#### `POST /api/auth/logout`
- **Access:** Authenticated
- **Behavior:** Destroys session server-side, clears `brightloop.sid` cookie.
- **Response (`200 OK`):**
  ```json
  { "data": null, "message": "Logged out successfully" }
  ```

#### `GET /api/auth/me`
- **Access:** Authenticated
- **Behavior:** Validates active session cookie and returns current user context.
- **Response (`200 OK`):**
  ```json
  {
    "data": {
      "user": {
        "id": "usr-uuid",
        "email": "admin@brightloop.com",
        "role": "admin",
        "name": "Administrator"
      }
    },
    "message": "Session verified"
  }
  ```

#### `POST /api/auth/forgot-password`
- **Access:** Public
- **Behavior:** Generates 32-byte secure random token. Stores SHA-256 hash in `password_reset_tokens` with 1-hour expiry. Returns standard message without revealing whether email exists.
- **Request:** `{ "email": "user@example.com" }`
- **Response (`200 OK`):**
  ```json
  { "data": null, "message": "If the email exists in our system, a password reset link has been dispatched." }
  ```

#### `POST /api/auth/reset-password`
- **Access:** Public
- **Behavior:** Hashes token with SHA-256, matches unused unexpired token, updates user bcrypt password hash, and marks `used_at = datetime('now')` to enforce single-use.
- **Request:** `{ "token": "raw-token-string", "newPassword": "NewPassword!2026" }`
- **Response (`200 OK`):**
  ```json
  { "data": null, "message": "Password has been reset successfully. You can now log in with your new password." }
  ```

#### `POST /api/auth/users/staff`
- **Access:** Admin only
- **Request:** `{ "email": "staff@brightloop.com", "password": "StaffPassword!123", "name": "Staff User" }`
- **Response (`201 Created`):** Returns created staff user profile.

---

### 3.2 Products & Variants (`/api/products`)

#### `GET /api/products`
- **Access:** Authenticated
- **Response:** List of products with nested variants array.

#### `POST /api/products`
- **Access:** Admin only
- **Request:**
  ```json
  {
    "name": "Brightloop CRM Core",
    "type": "service",
    "sales_price": 200.00,
    "cost_price": 50.00,
    "notes": "Core subscription module"
  }
  ```

#### `POST /api/products/:id/variants`
- **Access:** Admin only
- **Request:**
  ```json
  {
    "attribute_name": "Brand",
    "attribute_value": "Odoo Brand Edition",
    "price_extra": 560.00
  }
  ```

---

### 3.3 Plans (`/api/plans`)

#### `GET /api/plans`
- **Access:** Authenticated
- **Response:** List of active plans.

#### `POST /api/plans`
- **Access:** Admin only
- **Request:**
  ```json
  {
    "name": "Enterprise Monthly",
    "billing_frequency": "monthly",
    "price": 200.00,
    "min_qty": 1,
    "can_pause": true,
    "can_renew": true,
    "can_close_early": true,
    "auto_close": false
  }
  ```

---

### 3.4 Taxes & Discounts (`/api/taxes`, `/api/discounts`)

#### `GET /api/taxes` & `POST /api/taxes`
- **POST Request (Admin):** `{ "name": "GST 18%", "rate_percentage": 18.00 }`

#### `GET /api/discounts` & `POST /api/discounts`
- **POST Request (Admin):**
  ```json
  {
    "code": "EARLYBIRD10",
    "type": "percentage",
    "value": 10.00,
    "min_purchase_amount": 100.00,
    "min_quantity": 1,
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "max_uses": 100
  }
  ```

---

### 3.5 Quotations (`/api/quotations`)

#### `GET /api/quotations`
- **Access:** Admin/Staff sees all; Customer sees only their own quotations.

#### `POST /api/quotations`
- **Access:** Admin/Staff
- **Request:**
  ```json
  {
    "customer_id": "cust-uuid",
    "plan_id": "plan-uuid",
    "discount_id": "disc-uuid",
    "tax_id": "tax-uuid",
    "valid_until": "2026-12-31",
    "lines": [
      {
        "product_id": "prod-uuid",
        "variant_id": "var-uuid",
        "quantity": 2
      }
    ]
  }
  ```
- **Behavior:** Runs `PricingService` on backend. Subtotal = `(200 + 560) * 2 = 1520.00`. Calculates discount and tax, creates immutable line items.

#### `POST /api/quotations/:id/confirm`
- **Access:** Admin/Staff
- **Behavior:** Atomically updates quotation status to `confirmed`, increments discount usage counter, and creates an `active` subscription with lines snapshot.

---

### 3.5.1 Quotation Templates (`/api/quotation-templates`)
**Authorization:** Admin or Staff (`requireRole(['admin', 'staff'])`). Customers receive `403 FORBIDDEN`.

#### `GET /api/quotation-templates`
- **Access:** Admin/Staff
- **Query Parameters:** `include_inactive=true` (optional, default: false)
- **Response (`200 OK`):**
  ```json
  {
    "data": [
      {
        "id": "tpl-uuid",
        "name": "Standard Enterprise Setup",
        "description": "Pre-configured SaaS bundle",
        "default_plan_id": "plan-monthly-01",
        "default_plan_name": "Professional Monthly",
        "default_plan_price": 499.00,
        "default_plan_frequency": "monthly",
        "is_active": 1,
        "line_count": 2,
        "created_at": "2026-10-31T09:00:00.000Z"
      }
    ],
    "message": "Quotation templates retrieved successfully"
  }
  ```

#### `GET /api/quotation-templates/:id`
- **Access:** Admin/Staff
- **Response (`200 OK`):** Detailed template record including joined lines (`product_name`, `variant_value`, `price_extra`, `quantity`).
- **Errors:** `404 NOT_FOUND`

#### `POST /api/quotation-templates`
- **Access:** Admin/Staff
- **Request:**
  ```json
  {
    "name": "Standard Enterprise Setup",
    "description": "Pre-configured SaaS bundle",
    "default_plan_id": "plan-monthly-01",
    "lines": [
      {
        "product_id": "prod-01",
        "variant_id": "var-01",
        "quantity": 2
      }
    ]
  }
  ```
- **Validation Rules & Errors:**
  - Name is required (`VALIDATION_ERROR`).
  - `default_plan_id` must exist and be active (`INVALID_PLAN` / `INACTIVE_PLAN`).
  - `product_id` must exist and be active (`INVALID_PRODUCT` / `INACTIVE_PRODUCT`).
  - `variant_id` must belong to the specified product (`INVALID_VARIANT_COMBINATION`).
  - `quantity` must be integer > 0 (`VALIDATION_ERROR`).
- **Response (`201 Created`):** Created template and line items.

#### `PATCH /api/quotation-templates/:id`
- **Access:** Admin/Staff
- **Request:** Subset of `{ name, description, default_plan_id, is_active, lines }`.
- **Behavior:** Safely updates metadata and replaces lines inside a database transaction.
- **Response (`200 OK`):** Updated template record with refreshed lines.

#### `PATCH /api/quotation-templates/:id/deactivate`
- **Access:** Admin/Staff
- **Behavior:** Soft deactivation (`is_active = 0`), preserving lines and template for historical records.
- **Response (`200 OK`):** `{ "data": { "id": "tpl-uuid", "is_active": 0 }, "message": "Quotation template deactivated successfully" }`

---

### 3.6 Subscriptions (`/api/subscriptions`)

#### Fields Needed by Billing Engine:
1. `id`: Subscription UUID
2. `customer_id`: Target customer
3. `status`: Must be `'active'`
4. `next_billing_date`: Eligible if `<= targetDate`
5. `billing_frequency`: `'daily' | 'weekly' | 'monthly' | 'yearly'`
6. `subtotal`, `discount_amount`, `tax_amount`, `total_amount`: Agreed financial values
7. `subscription_lines`: Line descriptions, quantities, and unit prices

#### Lifecycle Actions:
- `POST /api/subscriptions/:id/pause`
- `POST /api/subscriptions/:id/resume`
- `POST /api/subscriptions/:id/close`
*(Customer role checks `can_pause` / `can_close_early` permissions from the plan).*

---

### 3.7 Recurring Billing Engine (`/api/billing`)

#### `POST /api/billing/run`
- **Access:** Admin/Staff
- **Request:** `{ "targetDate": "2026-10-31" }` (Optional; defaults to current date)
- **Shared Service:** `BillingService.runBilling(targetDate, userId)`
- **Behavior:**
  1. Finds active subscriptions where `next_billing_date <= targetDate`.
  2. For each subscription:
     - Sets `period_start = next_billing_date`.
     - Advances `period_end` by billing frequency (e.g. +1 month).
     - Checks `(subscription_id, period_start)` uniqueness. If already billed, safely advances schedule without generating duplicates.
     - Inserts invoice and copies subscription lines into `invoice_lines`.
     - Sets `amount_paid = 0.00` and `amount_due = total_amount`.
     - Advances `subscriptions.next_billing_date = period_end` inside transaction.
     - Emits `BILLING_RUN_EXECUTED` audit event.
- **Response (`200 OK`):**
  ```json
  {
    "data": {
      "subscriptionsChecked": 4,
      "invoicesGenerated": 1,
      "invoices": [{ "id": "inv-uuid", "invoiceNumber": "INV-12345", "amount": 1614.24 }],
      "errors": []
    },
    "message": "Billing completed."
  }
  ```

---

### 3.8 Invoices (`/api/invoices`)

#### `GET /api/invoices`
- **Access:** Admin/Staff sees all; Customer sees only invoices where `customer_id == req.user.customerId`.

#### `GET /api/invoices/:id`
- **Access:** Admin/Staff or Customer owner.
- **Response:** Detailed snapshot with `lines` and `payments`.

#### `GET /api/invoices/:id/pdf`
- **Access:** Admin/Staff or Customer owner.
- **Behavior:** Returns print/PDF document with official invoice styling.

---

### 3.9 Payments & Razorpay (`/api/payments`)

#### `POST /api/payments/create-order`
- **Access:** Authenticated (Customer or Staff)
- **Behavior:** Reads invoice from database, computes exact remaining `amount_due`. Does NOT trust client-sent amount. Creates Razorpay order.
- **Request:** `{ "invoice_id": "inv-uuid" }`
- **Response (`200 OK`):**
  ```json
  {
    "data": {
      "orderId": "order_1792182",
      "amount": 1614.24,
      "amountInPaise": 161424,
      "currency": "INR",
      "keyId": "rzp_test_key"
    },
    "message": "Razorpay order created successfully"
  }
  ```

#### `POST /api/payments/verify`
- **Access:** Authenticated
- **Behavior:**
  1. Verifies HMAC-SHA256 signature: `createHmac('sha256', secret).update(orderId + "|" + paymentId).digest('hex')`.
  2. Idempotency check: Verifies `gateway_payment_id` has not already been processed.
  3. Records payment in `payments` table.
  4. Recalculates:
     - `amount_paid = amount_paid + payment_amount`
     - `amount_due = total_amount - amount_paid`
     - Status: `amount_due <= 0 ? 'paid' : 'partially_paid'`
- **Request:**
  ```json
  {
    "invoice_id": "inv-uuid",
    "gateway_order_id": "order_1792182",
    "gateway_payment_id": "pay_98213",
    "gateway_signature": "hmac-signature",
    "amount": 614.24
  }
  ```

#### `POST /api/payments/record-offline`
- **Access:** Admin/Staff
- **Request:** `{ "invoice_id": "inv-uuid", "amount": 614.24, "payment_method": "bank_transfer", "notes": "Wire confirmation #991" }`
- **Behavior:** Updates invoice balance and status (`partially_paid` or `paid`).

---

### 3.10 Finance Dashboard (`/api/dashboard`)

#### `GET /api/dashboard/summary`
- **Access:** Admin/Staff
- **Formulas & Definitions:**
  - **MRR (Monthly Recurring Revenue):** Normalized monthly value of active subscriptions:
    - Monthly: `total_amount`
    - Yearly: `total_amount / 12`
    - Weekly: `total_amount * 4.333`
    - Daily: `total_amount * 30`
  - **Total Invoiced:** `SUM(total_amount)` of all non-cancelled invoices.
  - **Total Collected:** `SUM(amount)` of verified payments with `status = 'successful'`.
  - **Total Outstanding:** `SUM(amount_due)` of all non-cancelled invoices.
  - **Overdue Invoices:** Invoices where `due_date < CURRENT_DATE AND amount_due > 0`.
- **Response (`200 OK`):**
  ```json
  {
    "data": {
      "mrr": 200.00,
      "activeSubscriptions": 1,
      "totalInvoiced": 1614.24,
      "totalCollected": 1614.24,
      "totalOutstanding": 0.00,
      "overdueCount": 0,
      "overdueAmount": 0.00,
      "recentInvoices": [],
      "recentPayments": []
    },
    "message": "Dashboard metrics retrieved"
  }
  ```

---

## 4. Architectural Agreements & Alignment with Ruturaj

1. **One Database:** Supabase PostgreSQL in production, with SQLite compatibility for offline testing.
2. **One Migration History:** All schema modifications committed to `database/migrations/`.
3. **One Session System:** Express server-side session using HTTP-only cookies (`brightloop.sid`).
4. **One Pricing Engine:** Shared service `PricingService.calculatePricing()`.
5. **One Billing Engine:** Shared service `BillingService.runBilling()`.
6. **Unique Period Constraint:** Enforced at database level on `invoices(subscription_id, period_start)`.

---

## 5. Open Questions Requiring Ruturaj's Explicit Agreement

1. **Month-End Date Advancement Policy:**  
   If a monthly subscription starts on January 31st, should the next billing date advance to February 28th/29th, and should subsequent dates lock to the 28th or revert to the 31st in March? *(Proposed: Lock to the last valid day of the month).*
2. **Discount Stacking:**  
   Should future versions allow multiple coupon codes, or remain strictly one coupon code per quotation/subscription? *(Proposed: Keep strictly 1 coupon code for Version 1).*
3. **Webhook vs Client Verification:**  
   In Razorpay live mode, if a customer closes the browser before checkout signature verification completes, should a Razorpay Webhook endpoint (`POST /api/payments/webhook`) also be registered with webhook signature verification? *(Proposed: Yes, for production deploy).*
