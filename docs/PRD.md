# Product Requirements Document (PRD)

## Brightloop Subscription Manager
**Version:** 1.0  
**Authors:** Ruturaj (Backend Lead) & Atharv (Frontend & Operations Lead)

### 1. Product Overview
Brightloop Subscription Manager is a full-stack web application that centralizes customers, products, plans, quotations, subscriptions, recurring invoice generation, invoice PDFs, payment records, customer self-service, and financial reporting.

### 2. Business Problem & Story
Brightloop Software sells everything on subscription: business software billed daily, weekly, monthly, or yearly, add-ons customers switch on and off, and variants (e.g. Odoo brand adding $560).
Currently:
- Customer subscriptions are tracked in spreadsheets
- Renewals are missed
- Invoices typed by hand
- Payments matched manually
- Revenue reporting takes days

### 3. User Roles & RBAC
1. **Admin**
   - Manage staff accounts and users.
   - Manage products, variants, plans, taxes, and discounts.
   - Manage quotations and subscriptions.
   - Run/inspect billing jobs.
   - View all invoices, payments, dashboards, and audit logs.
2. **Staff**
   - Manage day-to-day customer, quotation, subscription, invoice, and payment operations.
   - View operational reports.
   - Cannot manage system staff or core system tax/product configurations unless permitted.
3. **Customer**
   - Register account (public registration only grants Customer role).
   - Log in, view only their own subscriptions, invoices, and payments.
   - Download invoice PDFs.
   - Pay invoices via Razorpay Test Mode.
   - Lifecycle self-service (pause, resume, close) strictly according to plan permissions.

### 4. Functional Requirements (FR-01 to FR-25)
- **FR-01 (Registration):** Public registration creates Customer accounts only.
- **FR-02 (Unique Identity):** Unique email validation.
- **FR-03 (Authentication):** Secure sessions with HTTP-only cookies, password hashing (bcrypt), password reset.
- **FR-04 (Authorization):** Backend RBAC middleware rejecting unauthorized calls.
- **FR-05 (Customer Ownership):** Strictly enforce `customer_id == session.user.customerId`.
- **FR-06 (Catalogue):** Products with sales price, cost price, active flags, and variants (e.g. Odoo brand +$560).
- **FR-07 (Plans):** Daily, weekly, monthly, yearly frequencies, min quantities, auto-close, and permitted lifecycle toggles.
- **FR-08 (Pricing Engine):** Calculation of fixed/percentage discounts, validity periods, usage limits, and taxes.
- **FR-09 (Quotations):** Quotation templates, line items, expiration dates, status transitions (Draft -> Quotation -> Confirmed -> Cancelled).
- **FR-10 (Subscriptions):** Moving Confirmed quotation to Subscription (Draft -> Quotation -> Confirmed -> Active -> Paused -> Closed -> Expired).
- **FR-11 (Add-ons):** Eligible add-on product lines attached to subscriptions.
- **FR-12 (Recurring Billing):** Automated and manual billing service generating period invoices.
- **FR-13 (Idempotent Billing):** Unique constraint on `(subscription_id, period_start)` prevents duplicate billing.
- **FR-14 (Missed Periods):** Safe processing of missed billing periods without gaps.
- **FR-15 (Invoice Records):** Immutable line snapshots, tax snapshots, and totals.
- **FR-16 (PDF):** Authorized PDF generation/download.
- **FR-17 (Payments):** Partial and full payment tracking.
- **FR-18 (Balance):** Outstanding = Total - Successful Payments. Status updates to `partially_paid` or `paid`.
- **FR-19 (Gateway):** Razorpay Test Mode with backend order creation and signature verification.
- **FR-20 (Duplicate Payments):** Idempotency on transaction IDs and signatures.
- **FR-21 (Overdue Tracking):** Invoices past due date with balance > 0 flagged as Overdue.
- **FR-22 (Dashboard):** Real database aggregates for MRR, Invoiced, Received, Outstanding, and Overdue.
- **FR-23 (Audit Logging):** Critical administrative and financial actions logged.
- **FR-24 (UX States):** Loading, empty, validation, success, and error feedback across UI.
- **FR-25 (Verification):** Full E2E flow verified through automated test suites.

