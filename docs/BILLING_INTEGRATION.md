# Billing Integration Architecture & Verification Guide — Brightloop Subscription Manager

**Developer:** Atharv (Member B)  
**Step:** 12 — Recurring Billing Engine & Multi-Module Integration  
**Status:** Complete & Verified  

---

## 1. Overview & Objective

The Recurring Billing Engine (`BillingService`) automates periodic contract billing, financial snapshotting, tax/discount computations, and add-on adjustments across all active subscriptions in Brightloop Subscription Manager.

This document records the architectural improvements and integration verifications between the recurring billing engine and the features developed in Steps 8, 9, 10, and 11:
- **Step 8:** Taxes, discounts, vouchers, and authoritative decimal-safe pricing.
- **Step 9:** Quotation lifecycle, line items, and subscription activation.
- **Step 10:** Calendar-safe subscription lifecycles (pause, resume, renew, close, auto-expiry).
- **Step 11:** Customer self-service portal, quotations, add-ons, and payment ledger.

---

## 2. Subscription Billing Lifecycle Integration

The recurring billing engine enforces strict contract eligibility rules:

```
[Contract State] ───► Eligible for Periodic Invoicing?
  active         ───► YES (if next_billing_date <= target_date)
  paused         ───► NO  (Skipped with audit reason: 'Subscription is paused')
  closed         ───► NO  (Skipped with audit reason: 'Subscription is closed')
  expired        ───► NO  (Skipped with audit reason: 'Subscription expired on <end_date>')
  cancelled      ───► NO  (Skipped with audit reason: 'Subscription is cancelled')
```

### Date Advancement & Frequency Support
- **Frequencies:** `daily`, `weekly`, `monthly`, `yearly`.
- **Intervals:** Supports custom plan intervals (e.g., `billing_interval = 3` for quarterly billing on a monthly frequency).
- **Calendar-Safe Clamping:**
  - Jan 31 + 1 month → Feb 28 (or Feb 29 on leap years).
  - Mar 31 + 1 month → Apr 30.
  - Feb 29 leap year + 1 year → Feb 28.
- **Contract Boundary Guards:**
  - Invoices are never generated for periods starting on or after `sub.end_date`.
  - When a billing period advances to or beyond `sub.end_date`, the subscription automatically transitions to `expired`.
- **Resume & Renewal Synchronization:**
  - Resuming a paused contract sets status to `active` and snaps `next_billing_date = today` if past due.
  - Renewing extends contract `end_date` by the plan interval and re-enables periodic billing.

---

## 3. Authoritative Pricing, Taxes & Discounts Integration

### Authoritative Backend Pricing
- Prices are calculated exclusively on the backend via `PricingService`.
- Unit prices derive authoritatively from `products.sales_price` + `product_variants.price_extra`.
- Subscription line items and add-on records snapshot their agreed unit prices into immutable `invoice_lines`.
- Frontend-submitted prices or client overrides are strictly ignored.
- Historical invoices remain completely immutable when catalog prices change.

### Tax Rules Integration
- Recurring billing evaluates taxes against the specific billing period:
  - `taxes.is_active === 1`
  - `taxes.start_date <= period_start`
  - `taxes.end_date >= period_start`
- Inactive or expired taxes automatically yield `$0.00` tax on recurring invoices without crashing contract execution.
- Tax is calculated on `discounted_subtotal` (`subtotal - discount_amount`).

### Discount Rules & Usage Limits
- Supports both `percentage` and `fixed` discounts.
- Respects product-specific restrictions (`applicable_product_id`).
- Respects validity windows (`start_date <= period_start` and `end_date >= period_start`).
- **Usage Limits (`max_uses`):**
  - When an invoice applies an active discount, `discounts.used_count` is atomically incremented inside the transaction.
  - When `used_count >= max_uses`, subsequent billing cycles reject the discount, ensuring limits cannot be exceeded.

---

## 4. Subscription Add-on Billing Integration

Add-on records (`subscription_addons`) seamlessly merge into recurring invoices:

| Add-on Status | Behavior in Recurring Billing |
| :--- | :--- |
| `active` | Included in invoice lines; unit price and quantity added to billing subtotal. |
| `pending_activation` | Excluded until `effective_start_date <= period_start`. Transitions to `active` on the first qualifying period. |
| `pending_removal` | Included in billing up to `effective_end_date`. Transitions to `removed` once the period reaches `effective_end_date`. |
| `removed` | Strictly excluded from all future invoices. |

- Parent subscription early closure cascades to all attached add-ons, snapping `effective_end_date = today` and setting status to `removed`.

---

## 5. Invoice Generation & Financial Safety

All invoice generation occurs inside database transactions:
1. **Idempotency Guard:** `SELECT id FROM invoices WHERE subscription_id = ? AND period_start = ?`. Existing periods are safely skipped without duplicate invoice numbers.
2. **Sequential Missed-Period Invoicing:** If a subscription missed multiple cycles, catch-up invoicing generates an invoice for each distinct period sequentially up to `target_date`.
3. **Transaction Rollback:** If any error occurs (e.g. database constraint failure, network abort), the entire transaction rolls back, leaving `next_billing_date` and contract status unchanged.
4. **Decimal Rounding:** All monetary operations employ `Number.EPSILON` rounding:
   $$\text{round}(v) = \frac{\lfloor (v + \epsilon) \cdot 100 \rceil}{100}$$

---

## 6. Payment Ledger & Razorpay Integration

### Razorpay Verification & Status Management
- `POST /api/payments/create-order`: Validates customer ownership and invoice outstanding balance before creating gateway order IDs.
- `POST /api/payments/verify`: Idempotent payment verification with HMAC SHA-256 signature check.
  - Supports partial payments: Updates `amount_paid`, reduces `amount_due`, and marks `status = 'partially_paid'`.
  - Full settlement: Once `amount_due <= 0`, invoice status transitions to `'paid'`.
  - Duplicate callbacks safely return `status: 'already_processed'`.
- `POST /api/payments/record-failure`: Records gateway errors or declined card attempts as `status: 'failed'` in the `payments` ledger while preserving invoice unpaid status.
- `POST /api/payments/record-offline`: Staff/Admin recording of manual bank transfers and offline remittances.

---

## 7. Security & Role-Based Access Control (RBAC)

- **Billing Run (`POST /api/billing/run`):** Restricted exclusively to `admin` role. Customers and staff are rejected with `403 FORBIDDEN`.
- **Billing History (`GET /api/billing/history`):** Visible to `admin` and `staff` audit viewers.
- **Tenant Isolation:** Customers can only inspect and pay for invoices where `invoice.customer_id === req.user.customerId`. Cross-tenant payment attempts return `403 FORBIDDEN`.

---

## 8. Test Matrix & Verification Results

All 16 verification requirements are tested in `backend/tests/billing_integration_tests.ts`:

| # | Test Case | Target Feature | Status |
| :-: | :--- | :--- | :-: |
| 1 | Active subscription invoice generation | Periodic invoice creation & confirmed status | **PASS** |
| 2 | Daily, weekly, monthly, yearly frequencies | Calendar date advancement & interval settings | **PASS** |
| 3 | Paused subscription exclusion | Suspension of billing & audit skip log | **PASS** |
| 4 | Closed and expired subscription exclusion | Lifecycle termination & contract boundary guard | **PASS** |
| 5 | Resume and renewal billing dates | Contract alignment on resume and renewal | **PASS** |
| 6 | Product and variant price calculations | Authoritative catalog pricing & variant extra | **PASS** |
| 7 | Tax calculation and date validity | Active check & validity window enforcement | **PASS** |
| 8 | Fixed and percentage discount calculations | Multi-type discount calculations | **PASS** |
| 9 | Discount usage limits (`max_uses`) | Atomic consumption & limit enforcement | **PASS** |
| 10 | Active add-on invoice calculation | Dynamic line addition & subtotal aggregation | **PASS** |
| 11 | Pending activation and removal date handling | Effective date gating & lifecycle transition | **PASS** |
| 12 | Duplicate invoice prevention | Idempotency guard on `(subscription_id, period_start)` | **PASS** |
| 13 | Historical invoice snapshot preservation | Immutability against product catalog price changes | **PASS** |
| 14 | Payment success and failure handling | Failed attempts preserve balance; settlements mark paid | **PASS** |
| 15 | Unauthorized billing-run access | RBAC rejection of customer and unauthenticated calls | **PASS** |
| 16 | Customer invoice ownership restrictions | Cross-customer payment protection | **PASS** |

### Full Test Suite Execution Summary
- **Billing Integration Suite (`npm run test:billing-integration`):** 16/16 Passed
- **Full Backend Suite (`npm run test:all`):** 119/119 Passed across 12 suites
- **Frontend Test Suite (`npm test`):** 48/48 Passed
- **Production Build (`npm run build`):** Clean (0 errors)
