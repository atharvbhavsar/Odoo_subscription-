# Project Architecture — Brightloop Subscription Manager

## System Overview

Brightloop Subscription Manager is a full-stack web application for subscription billing management. It follows a classic **monolithic API + SPA frontend** architecture, deployed as a single Vercel project using serverless functions for the backend.

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
│  ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │  React SPA   │    │  Express API (Serverless Fn)     │   │
│  │  (Vite dist) │───▶│  /api/* routes → api/index.js   │   │
│  └──────────────┘    └──────────────────┬───────────────┘   │
│                                         │                    │
│                              ┌──────────▼──────────┐        │
│                              │  SQLite (bundled DB) │        │
│                              └─────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 18 |
| Frontend Build | Vite + TypeScript | 5 / 5 |
| Frontend Routing | React Router | 6 |
| Frontend Styling | Tailwind CSS | 3 |
| Backend Runtime | Node.js | 20 |
| Backend Framework | Express | 4 |
| Database | SQLite (Node built-in) | — |
| Authentication | express-session + bcrypt | — |
| PDF Generation | pdfkit | — |
| Payment Gateway | Razorpay Test Mode | — |
| Hosting | Vercel (serverless) | — |

---

## Backend Module Structure

```
backend/src/modules/
├── auth/               # Registration, login, logout, password reset
├── billing/            # Recurring billing engine + billing run routes
├── customers/          # Customer profile management
├── dashboard/          # Executive financial metrics aggregation
├── discounts/          # Discount CRUD, PricingService
├── invoices/           # Invoice CRUD, PDF generation, email
├── payments/           # Payment recording, Razorpay webhook verification
├── plans/              # Subscription plan CRUD and line items
├── products/           # Product and variant catalogue
├── quotations/         # Quotation lifecycle, templates, confirmation
├── subscriptions/      # Subscription CRUD, lifecycle, add-ons
└── taxes/              # Tax rule CRUD
```

Each module follows the pattern:
```
<module>/
├── <module>.routes.ts      # Express router — HTTP endpoints, auth/RBAC guards
├── <module>.service.ts     # Business logic — pure functions, DB queries
└── <module>.types.ts       # TypeScript interfaces (where applicable)
```

---

## Frontend Page Structure

```
frontend/src/pages/
├── AdminDashboardPage.tsx       # Executive metrics dashboard
├── BillingRunPage.tsx           # Trigger/view recurring billing runs
├── CustomerPortalPage.tsx       # Customer self-service hub
├── CustomersPage.tsx            # Customer management (Staff/Admin)
├── InvoicesPage.tsx             # Invoice list and detail
├── LoginPage.tsx                # Auth entry point
├── PlansPage.tsx                # Plan management
├── ProductsPage.tsx             # Product & variant catalogue
├── QuotationsPage.tsx           # Quotation management
├── QuotationTemplatesPage.tsx   # Quotation template management
├── RegisterPage.tsx             # Customer self-registration
├── SubscriptionsPage.tsx        # Subscription management
└── TaxDiscountPage.tsx          # Tax and discount rule management
```

---

## Data Flow

### Subscription Creation Flow

```
Customer Request
      │
      ▼
QuotationsPage ──POST /api/quotations──▶ quotations.routes.ts
                                               │
                                               ▼
                                        QuotationService.create()
                                        - Validates plan, products, pricing
                                        - Snapshots line item prices
                                        - Status: 'quotation'
                                               │
                      (staff confirms)         ▼
                                        QuotationService.confirm()
                                        - Creates Subscription record
                                        - Status: 'active'
                                        - Sets next_billing_date
```

### Recurring Billing Flow

```
BillingRunPage ──POST /api/billing/run──▶ billing.routes.ts (Admin only)
                                                │
                                                ▼
                                         BillingService.runBillingCycle()
                                         For each active subscription:
                                           1. Check next_billing_date ≤ today
                                           2. Check subscription end_date
                                           3. Activate pending add-ons
                                           4. Remove pending_removal add-ons
                                           5. Calculate pricing via PricingService
                                              - Base product price
                                              - Variant price_extra
                                              - Active add-ons
                                              - Tax rules (date-valid, active)
                                              - Discount rules (date-valid, within limit)
                                           6. INSERT invoice + invoice_lines (transaction)
                                           7. UPDATE subscription.next_billing_date
                                           8. Increment discount.used_count
```

### Payment Flow

```
Customer ──POST /api/payments──▶ payments.routes.ts
                                        │
                                        ▼
                                 Verify Razorpay signature
                                 (HMAC-SHA256 of order_id + payment_id)
                                        │
                               ┌────────┴────────┐
                            Success            Failure
                               │                  │
                               ▼                  ▼
                        INSERT payment      POST /api/payments/record-failure
                        UPDATE invoice      INSERT payment (status='failed')
                        status='paid'       Invoice balance unchanged
                        (if fully paid)
```

---

## Database Architecture

### Migration Sequence

| Migration | Purpose |
|---|---|
| `001_initial_schema.sql` | Core tables: users, products, plans, subscriptions, invoices, payments |
| `002_quotation_templates.sql` | Quotation template tables |
| `003_invoice_emails.sql` | Email delivery tracking columns |
| `004_subscription_addons.sql` | Subscription add-on tables and status machine |
| `005_product_variants_active.sql` | `is_active` flag on product variants |
| `006_plan_improvements.sql` | Plan billing interval and policy columns |
| `007_tax_discount_improvements.sql` | Tax/discount date validity and usage limit columns |
| `008_quotation_lifecycle_improvements.sql` | Quotation status machine improvements |
| `009_subscription_lifecycle_improvements.sql` | Subscription pause/resume/renew/close columns |

### Key Relationships

```
users ─────────── customer_profiles ─────── subscriptions
                                                  │
plans ────────────────────────────────────────────┤
                                                  │
                  quotations ──────── confirmed ──┘
                       │
              quotation_line_items
                       │
                    products ── product_variants
                                      │
                                plan_line_items

subscriptions ─── invoices ─── invoice_line_items
      │                │
subscription_addons   payments
```

---

## Security Model

### Authentication
- Session-based using `express-session` with HTTP-only, SameSite cookies
- Passwords hashed with `bcrypt` (10 rounds)
- Password reset tokens stored as SHA-256 hashes, single-use

### Authorization (RBAC)

| Role | Capabilities |
|---|---|
| **Admin** | Full access including user management, billing runs, all data |
| **Staff** | Create/manage quotations, subscriptions, products, plans, taxes, discounts; view dashboard |
| **Customer** | Access only their own subscriptions, quotations, invoices, add-ons |

### Data Isolation
- All customer-facing routes enforce `customer_id` ownership checks
- Backend always recalculates pricing from authoritative catalog — client-submitted prices are ignored
- Invoice line items are immutable snapshots; historical records are never modified

---

## Pricing Engine (PricingService)

The `PricingService` (`backend/src/modules/discounts/pricing.service.ts`) is the single authoritative source for all price calculations.

**Inputs:** product ID, optional variant ID, quantity, optional discount ID, optional tax ID, evaluation date  
**Output:** `{ unitPrice, quantity, subtotal, discountAmount, taxAmount, total }`

Rules enforced:
1. Unit price = `product.sales_price` + `variant.price_extra` (if variant selected)
2. Discount applied only if: `is_active = 1`, `start_date ≤ evalDate ≤ end_date`, `used_count < usage_limit`
3. Tax applied only if: `is_active = 1`, `start_date ≤ evalDate ≤ end_date`
4. Percentage discount: `subtotal × (rate / 100)`
5. Fixed discount: min(`fixed_amount`, `subtotal`)
6. Tax: `(subtotal - discountAmount) × (rate_percentage / 100)`
7. All calculations use JavaScript `Number` with 2-decimal rounding via `Math.round(x * 100) / 100`

---

## Vercel Deployment Architecture

```
vercel.json
  │
  ├── / → frontend/dist (static SPA)
  └── /api/* → api/index.js (serverless function)
                    │
                    └── imports backend/src/index.ts (compiled Express app)
                              │
                              └── SQLite file at /tmp/brightloop.sqlite
                                  (bootstrapped on cold start from bundled migrations)
```

> **Note:** Vercel's serverless runtime uses an ephemeral `/tmp` filesystem. The SQLite database is re-initialized on each cold start from bundled migration SQL files. This is suitable for development and demo; production workloads should use a persistent database like PostgreSQL.

---

## Environment Variables

### Backend

| Variable | Description | Required |
|---|---|---|
| `PORT` | HTTP server port | Yes (default: 5000) |
| `NODE_ENV` | `development` or `production` | Yes |
| `SESSION_SECRET` | High-entropy secret for session signing | Yes |
| `RAZORPAY_KEY_ID` | Razorpay API key (test mode) | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (test mode) | Yes |
| `DATABASE_PATH` | SQLite file path | No (default: `./brightloop.sqlite`) |
| `FRONTEND_URL` | Frontend origin for CORS | Yes (production) |

### Frontend

| Variable | Description | Required |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | Yes |
| `VITE_RAZORPAY_KEY_ID` | Razorpay key for client-side SDK | Yes |

