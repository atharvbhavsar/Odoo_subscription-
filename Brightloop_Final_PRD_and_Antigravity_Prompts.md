# Brightloop Subscription Manager
## Final PRD, Team Split, Antigravity Prompts, and Integration Contract
**Team:** Ruturaj and Atharv  
**Product:** Brightloop Subscription Manager  
**Version:** 1.0  
**Purpose:** Build one integrated, deployable subscription-management application using two parallel Antigravity workstreams without conflicting architecture, database, or API decisions.

---

# 1. Final Technology Stack

| Layer | Final choice | Rule |
|---|---|---|
| Frontend | React + Vite + TypeScript | Atharv owns the frontend |
| UI | Tailwind CSS, React Router, reusable components | Responsive desktop and mobile |
| Data fetching | TanStack Query or a consistent Fetch-based service layer | Choose once and use consistently |
| Backend | Node.js + Express + TypeScript | One shared API |
| Database | Supabase PostgreSQL | One shared database; no separate databases |
| Database access | PostgreSQL driver/query layer and versioned SQL migrations | Backend connects to Supabase PostgreSQL |
| Authentication | Express-managed server-side sessions with HTTP-only cookies | One shared implementation, owned by Ruturaj |
| Validation | Zod or an agreed equivalent | Validate on the server and client |
| Charts | Recharts | Dashboard charts |
| Billing scheduler | node-cron initially | Calls the same billing service as manual billing |
| Invoice PDFs | PDFKit or another agreed library | Server generates PDFs or serves authorized PDF output |
| Payments | Razorpay **Test Mode** | Atharv integrates checkout; backend verifies payment |
| Frontend hosting | Vercel | Configure API URL and cookie/CORS settings |
| Backend hosting | Render or Railway | Pick one for the initial deployment |
| Testing | Vitest/React Testing Library, backend test framework, Playwright for end-to-end | Do not claim tests passed unless run |

### Architecture

```text
Customer / Staff / Admin
          |
          v
React + Vite + TypeScript (Vercel)
          |
          | HTTPS requests + session cookie
          v
Node.js + Express + TypeScript (Render/Railway)
          |
          +--> Authentication / RBAC
          +--> Products, Plans, Taxes, Discounts
          +--> Quotations, Subscriptions, Billing
          +--> Invoices, Payments, Razorpay verification
          +--> Customer Portal and Analytics
          |
          v
Supabase PostgreSQL
```

**Important security rules**
- The browser must never connect directly to PostgreSQL using database credentials.
- Never place the Supabase database password, service-role key, Razorpay secret, or session secret in frontend code.
- All authoritative business logic and financial calculations run on the backend.
- The backend is the source of truth for invoice totals, discounts, taxes, payments, outstanding balances, roles, ownership, subscription state, and billing dates.
- Use migrations as the source of truth for schema changes. Do not make undocumented schema changes in the Supabase dashboard.
- Use Supabase as the PostgreSQL host, not as a second competing authentication system. The agreed initial auth is Express sessions unless the team explicitly changes this before implementation.

### Payment scope for version 1

Version 1 uses Razorpay **Test Mode** to test payments against generated invoices. Recurring billing means generating invoices on the subscription schedule. It does **not** automatically charge saved cards or create gateway mandates in version 1. A customer can pay each invoice through Razorpay Checkout. Do not claim automatic recurring payment collection is implemented unless a separate mandate/subscription-gateway feature is designed and tested.

---

# 2. Product Requirements Document (PRD)

## 2.1 Product overview

**Brightloop Subscription Manager** is a full-stack web application that centralizes customers, products, plans, quotations, subscriptions, recurring invoice generation, invoice PDFs, payment records, customer self-service, and financial reporting.

### Problem
Subscription businesses can lose track of renewals and invoices when customer, billing, and payment information is spread across different tools. This can lead to missed billing dates, duplicate invoices, inconsistent pricing, incorrect balances, and poor visibility into revenue.

### Goal
Provide one secure application in which authorized staff can configure products and plans, create quotations, activate subscriptions, generate invoices on schedule, record and verify payments, and review accurate financial metrics.

### Primary user roles

**Admin**
- Manage staff accounts and users.
- Manage products, variants, plans, taxes, and discounts.
- Manage quotations and subscriptions.
- Run or inspect billing jobs.
- View and manage invoices and payment records according to policy.
- View dashboards and audit logs.

**Staff**
- Perform authorized customer, quotation, subscription, invoice, and payment operations.
- View operational reports.
- Cannot perform administrator-only actions unless explicitly granted by the agreed permissions model.

**Customer**
- Register as a customer, log in, and log out.
- View only their own profile, subscriptions, invoices, and payment history.
- Download their own invoice PDFs.
- Pay eligible invoices through Razorpay Test Mode.
- Perform only the subscription actions allowed by the plan and business rules.
- Cannot set an invoice to Paid manually or view another customer's data.

Public registration must never let a person choose the Admin or Staff role.

## 2.2 In-scope features

1. Secure registration, login, logout, session restoration, and password reset.
2. Server-side role-based access control (Admin, Staff, Customer).
3. Customer records and profile access.
4. Product catalogue and product variants.
5. Subscription plans with daily, weekly, monthly, and yearly billing frequencies.
6. Configurable tax rules.
7. Configurable fixed and percentage discounts, dates, eligibility, minimum purchase/quantity, and usage limits.
8. Quotation templates, quotation lines, expiry, confirmation, and cancellation.
9. Subscription creation and lifecycle: activation, pause, resume, renewal, and closure where permitted.
10. Recurring invoice generation through a shared billing service.
11. Scheduled billing and an authorized manual billing trigger.
12. Invoice list, details, status, line items, due dates, and PDF download.
13. Partial and full payment records, with correct outstanding balances.
14. Razorpay Test Mode checkout, backend signature verification, webhook verification where configured, and idempotent payment processing.
15. Customer self-service portal.
16. Dashboard KPIs and charts.
17. Audit logging for important administrative and financial actions.
18. Responsive design, validation, error states, tests, setup documentation, and deployment.

## 2.3 Out of scope for version 1

- Live Razorpay payments or real-money processing.
- Automatic charging of stored cards or recurring gateway mandates.
- Multiple independent tenants/organizations unless the original project requirements explicitly require it.
- Complex accounting ledger, refunds, or reconciliation beyond the agreed payment scope.
- AI features not explicitly required by the original project.

Do not quietly expand scope. Document future improvements separately.

## 2.4 Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | Registration | Valid registration creates a Customer account only |
| FR-02 | Unique identity | Duplicate email addresses are rejected safely |
| FR-03 | Authentication | Login, logout, and session restoration work |
| FR-04 | Authorization | Backend rejects requests from unauthenticated or unauthorized users |
| FR-05 | Customer ownership | A customer cannot read or modify another customer's records, even by changing IDs |
| FR-06 | Product catalogue | Admin can create, update, activate/deactivate products and variants |
| FR-07 | Plans | Admin can configure prices, frequency, and permitted lifecycle behavior |
| FR-08 | Taxes and discounts | Server calculates applicable discounts and taxes using documented rules |
| FR-09 | Quotations | Authorized staff can create, view, confirm, and cancel valid quotations |
| FR-10 | Subscription lifecycle | Valid state transitions succeed; invalid transitions are rejected |
| FR-11 | Add-ons | Eligible add-ons can be managed according to agreed rules |
| FR-12 | Recurring billing | Due eligible subscriptions generate invoices |
| FR-13 | Idempotent billing | Re-running or concurrently running billing does not create duplicate invoices for the same subscription period |
| FR-14 | Missed periods | Billing can safely process eligible missed periods according to documented rules |
| FR-15 | Invoice records | Invoice lines and historical totals are preserved |
| FR-16 | PDF | Authorized users can download the appropriate invoice PDF |
| FR-17 | Payments | Partial and full payments are recorded with references and timestamps |
| FR-18 | Balance | Outstanding = invoice total minus successful/recorded applicable payments, with no negative balance unless a documented credit/refund model permits it |
| FR-19 | Payment gateway | Razorpay payment success is accepted only after server-side verification |
| FR-20 | Duplicate payments | Repeated callbacks/webhooks do not create duplicate payment records |
| FR-21 | Overdue | Invoices past due with a positive balance are classified consistently as overdue |
| FR-22 | Dashboard | KPIs are calculated from real backend/database data |
| FR-23 | Audit | Important financial and administrative actions are logged |
| FR-24 | UX | Loading, empty, validation, success, and failure states are provided |
| FR-25 | Testing | The primary end-to-end workflow and negative cases are documented and tested |

## 2.5 Business rules

### Money and historical prices
- Use PostgreSQL `NUMERIC` or another explicitly decimal-safe approach for authoritative money values.
- Serialize monetary values consistently, preferably as decimal strings in JSON.
- Document rounding and currency rules.
- The backend calculates subtotal, discount, tax, total, amount paid, and outstanding amount.
- Store snapshots of prices, tax rates, discounts, descriptions, and invoice lines when an invoice is created. Historical invoices must not change when catalogue prices change later.
- Financial changes involving multiple rows must use database transactions.

### Billing and duplicate prevention
- Scheduled and manual billing must call the same reusable billing service.
- Use a database-level unique constraint for the selected billing-period identity, such as `(subscription_id, period_start)` or an equivalent period key.
- Do not rely only on a pre-insert existence check; concurrent jobs can race.
- Lock/recheck eligible subscription state inside a transaction.
- Define how monthly/yearly dates and month-end dates are advanced.
- Define how paused, closed, expired, and missed-period subscriptions behave.
- A failed transaction must not leave an invoice created without the schedule update or vice versa.

### Payments
- A frontend success callback is not proof of payment.
- Verify the Razorpay signature on the backend and verify webhook signatures when webhooks are used.
- Store unique gateway order/payment/event identifiers and make processing idempotent.
- Never expose Razorpay secret credentials in the browser.
- Test mode only for the project demonstration.
- Do not mark an invoice Paid until verified payment records cover the outstanding amount.
- Partial payments leave the invoice partially paid until fully settled.
- Payment status must be derived by backend business logic.

### Dashboard definitions
Document and use stable definitions:
- **MRR:** normalized monthly value of active subscriptions, using the agreed treatment for discounts, taxes, pauses, and annual plans.
- **Invoiced amount:** total of invoices issued in the selected period; exclude cancelled/void invoices according to the documented policy.
- **Payments received:** verified/recorded successful payments in the selected period.
- **Outstanding:** sum of positive remaining balances on valid invoices.
- **Overdue amount:** outstanding balance on invoices past due date.
Do not label invoiced revenue as cash received. Use real backend aggregates, not hard-coded frontend numbers.

## 2.6 Non-functional requirements

**Security**
- Hash passwords with a maintained password-hashing library.
- Use HTTP-only session cookies, secure production cookie settings, appropriate SameSite configuration, CSRF protection for cookie-authenticated state-changing requests, session expiry, and rate limiting for sensitive endpoints.
- Configure CORS to allow only the actual frontend origin(s), with credentials enabled where required.
- Validate all input on the server.
- Do not leak stack traces or secrets to clients.
- Do not commit `.env` files or credentials.

**Reliability**
- Use transactions for financial workflows.
- Enforce uniqueness and ownership constraints in the database/backend.
- Handle duplicate requests, retries, and concurrent billing/payment events.
- Provide safe, actionable errors.

**Maintainability**
- TypeScript across frontend and backend.
- Modular services; avoid business logic inside route handlers.
- Versioned migrations and repeatable seeds.
- Document API schemas, permissions, errors, and environment variables.
- Keep a single shared repository and one authoritative database.

**Usability**
- Responsive layouts.
- Accessible form labels and validation.
- Consistent navigation and status badges.
- Loading, empty, error, and confirmation states.

---

# 3. Team Division — Exact Ownership

## Ruturaj: Backend Platform, Database, and Core Billing

**Owns**
- Backend foundation, Express/TypeScript configuration, server setup, shared middleware.
- Supabase PostgreSQL connection and migrations.
- Database schema and seed scripts.
- Authentication, sessions, password reset, role authorization, customer ownership enforcement.
- Products and variants APIs.
- Subscription plans APIs.
- Taxes and discounts/pricing service.
- Quotation templates, quotations, and quotation confirmation.
- Subscription lifecycle and add-on rules.
- Core recurring billing service and scheduler.
- Shared audit infrastructure.
- API and schema documentation for the modules he owns.
- Backend tests for these modules.

**Must deliver**
- Working backend connected to Supabase PostgreSQL.
- Migrations and seeds.
- Auth/RBAC.
- Product, plan, tax, discount, quotation, subscription, and billing endpoints.
- Reusable billing service and scheduled job.
- Shared API/error conventions.
- Tests and setup documentation.

## Atharv: Frontend, Invoice/Payment Operations, Customer Portal, Analytics

**Owns**
- React/Vite/TypeScript/Tailwind frontend.
- Routing, layouts, reusable components, forms, navigation, responsive UX.
- Login/registration/password reset UI and session restoration using Ruturaj's auth API.
- Product, plan, tax, discount, quotation, and subscription interfaces using Ruturaj's APIs.
- Invoice operational APIs and UI, coordinated with the shared backend architecture.
- Payment operational APIs and UI, including Razorpay Test Mode integration.
- Customer portal and ownership-safe customer experiences.
- Dashboard analytics API/UI, coordinated with the backend.
- Invoice PDF presentation/download integration.
- Frontend tests and primary end-to-end integration tests.
- Integration and deployment documentation for the frontend.

**Must not**
- Build a second billing engine.
- Create a separate database.
- duplicate auth/session logic.
- calculate authoritative invoice totals in React.
- trust the browser's claim that a payment succeeded.
- alter shared schema/contracts without coordination.

**Shared responsibility**
- Agree on schema/API contracts before dependent implementation.
- Review one another's integration-facing changes.
- Maintain one repository and one PRD.
- Test the complete flow together.

---

# 4. Shared Repository and Integration Contract

Use one repository:

```text
brightloop-subscription-manager/
├── frontend/                 # Atharv owns
├── backend/
│   └── src/modules/
│       ├── auth/             # Ruturaj owns
│       ├── users/            # Ruturaj owns
│       ├── products/         # Ruturaj owns
│       ├── plans/             # Ruturaj owns
│       ├── taxes/             # Ruturaj owns
│       ├── discounts/         # Ruturaj owns
│       ├── quotations/        # Ruturaj owns
│       ├── subscriptions/     # Ruturaj owns
│       ├── billing/           # Ruturaj owns
│       ├── invoices/          # Atharv owns operational API, shared schema
│       ├── payments/          # Atharv owns operational API, shared schema
│       └── dashboard/         # Atharv owns analytics API
├── database/
│   ├── migrations/            # Ruturaj leads; all schema changes reviewed
│   └── seeds/
├── docs/
│   ├── PRD.md
│   ├── PROJECT_RULES.md
│   ├── API_CONTRACT.md
│   ├── DATABASE_SCHEMA.md
│   ├── SETUP.md
│   └── INTEGRATION_CHECKLIST.md
├── .env.example
├── .gitignore
└── README.md
```

Adapt to an existing working structure instead of rebuilding it unnecessarily. If both members use separate local copies initially, they must use the same Git repository and merge through branches; do not later copy-paste whole projects together.

## Required shared API conventions

Use `/api` as the API prefix.

Success example:

```json
{
  "data": {},
  "message": "Operation completed"
}
```

Error example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted information is invalid",
    "details": {}
  }
}
```

These examples are the required starting convention. If the team chooses a different structure before implementation, update `docs/API_CONTRACT.md` and use that one structure everywhere.

Every endpoint must document:
- Method and path.
- Authentication required.
- Allowed roles.
- Request schema.
- Response schema.
- Validation and error codes.
- Ownership rules.
- Business logic and idempotency behavior.

### Initial API map

Exact paths and schemas must be agreed in `docs/API_CONTRACT.md` before frontend integration. The following is the proposed starting map:

| Area | Proposed endpoints | Owner |
|---|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me`, forgot/reset password | Ruturaj |
| Products | `GET/POST /api/products`, `GET/PATCH /api/products/:id`, variant endpoints | Ruturaj |
| Plans | `GET/POST /api/plans`, `GET/PATCH /api/plans/:id` | Ruturaj |
| Taxes | `GET/POST /api/taxes`, update/deactivate endpoints | Ruturaj |
| Discounts | `GET/POST /api/discounts`, update/deactivate endpoints | Ruturaj |
| Quotations | `GET/POST /api/quotations`, details/update/confirm/cancel | Ruturaj |
| Subscriptions | `GET/POST /api/subscriptions`, details/activate/pause/resume/renew/close | Ruturaj |
| Billing | authorized manual run endpoint and billing-job status/history endpoints | Ruturaj |
| Invoices | `GET /api/invoices`, `GET /api/invoices/:id`, authorized status actions, PDF endpoint | Atharv, with Ruturaj's shared billing output |
| Payments | create Razorpay order, verify payment, payment history, manual payment record if allowed | Atharv |
| Customer portal | `GET /api/customer/me/subscriptions`, `/invoices`, eligible subscription actions | Atharv with shared auth/ownership middleware |
| Dashboard | `GET /api/dashboard/summary`, chart/series endpoints | Atharv |

### Shared database rules
1. PostgreSQL/Supabase is the single source of truth.
2. All schema changes are tracked in migrations.
3. Before creating/changing a table, check `docs/DATABASE_SCHEMA.md`, agree ownership, update the document, create a migration, and tell the other member.
4. Use one ID strategy consistently (UUID is recommended if the project is new).
5. Invoice tables must store snapshots of line description, quantity, unit price, discounts, tax, and total.
6. Invoice billing-period identity must have a database-level unique constraint.
7. Payment gateway identifiers must have appropriate unique constraints.
8. Use foreign keys, checks, and indexes where appropriate.
9. Do not expose Supabase database credentials or privileged keys to the frontend.
10. Never independently create competing versions of a shared table.

---

# 5. Antigravity Prompt — Ruturaj
Copy the entire prompt below into Ruturaj's Antigravity workspace.

---

## PROMPT START — RUTURAJ

You are my senior backend engineer, database architect, security-minded reviewer, and technical mentor.

I am Ruturaj, one of two developers building **Brightloop Subscription Manager** with Atharv. We are building one integrated product in one shared Git repository. Atharv is separately using Antigravity for the frontend and operational modules. Your implementation must integrate with his work through documented API contracts and a shared Supabase PostgreSQL schema.

### My ownership
I own:
- Express + TypeScript backend foundation and shared middleware.
- Supabase PostgreSQL connection, migrations, seeds, and database documentation.
- Authentication, Express-managed server-side sessions, role-based authorization, and customer ownership checks.
- Products, product variants, subscription plans.
- Tax and discount rules/pricing service.
- Quotations and quotation templates.
- Subscription lifecycle and allowed add-on rules.
- Core recurring invoice-generation/billing engine and scheduler.
- Shared audit infrastructure.
- API contracts and backend tests for my modules.

Atharv owns the React frontend, invoice operational APIs, payment operations/Razorpay Test Mode, customer portal, dashboard analytics, and end-to-end integration. Do not take over his modules or build a separate frontend.

### Product goal
Build a reliable backend for a subscription management web app supporting Admin, Staff, and Customer roles, products/plans, quotations, subscriptions, recurring invoice generation, invoices, payments, customer self-service, and financial reporting.

### Fixed technology choices
- Node.js + Express + TypeScript.
- Supabase-hosted PostgreSQL as the single database.
- SQL migrations and seed scripts.
- Zod or one agreed validation library.
- Express-managed server-side sessions using HTTP-only cookies; do not independently add Supabase Auth.
- `node-cron` for the initial scheduled billing task.
- A maintained password hashing library.
- A suitable PostgreSQL driver/query layer compatible with the existing repository.
- Automated backend tests.

Inspect the existing repository before selecting ORM/query tools or replacing dependencies. Do not introduce unnecessary frameworks.

### Critical integration rules
1. First inspect the existing repository and documents. Do not overwrite working code or documentation without checking it.
2. Read and follow `docs/PRD.md`, `docs/PROJECT_RULES.md`, `docs/API_CONTRACT.md`, and `docs/DATABASE_SCHEMA.md`. If a file is missing, create it with the agreed rules.
3. Do not invent a second architecture. Use the shared API prefix `/api`, shared response/error structure, one session/auth implementation, one database, and one ID strategy.
4. Coordinate invoice/payment tables with Atharv before finalizing the schema because he owns those operational APIs.
5. Do not change shared endpoint names, payloads, response formats, auth behavior, or database columns without documenting the change and notifying Atharv.
6. All money calculations happen on the server using decimal-safe calculations and PostgreSQL `NUMERIC` or an equally safe approach.
7. Use transactions for multi-step financial operations.
8. Billing scheduler and manual billing endpoint must invoke the same reusable billing service.
9. Prevent duplicate invoices with database constraints and safe transaction/locking logic.
10. Do not mark payments as verified based on frontend input. Payment verification is handled in the agreed payment module.
11. Never expose database passwords, Supabase privileged keys, session secrets, or other credentials.
12. Never claim a test/build works unless you actually ran it and observed the result.
13. Do not use fake endpoints or mock data as a replacement for the real implementation.
14. Do not generate the whole backend in one huge step. Implement small phases, test each, and report what remains.

### Required repository structure (adapt if a working structure already exists)

```text
backend/src/
  app.ts
  server.ts
  config/
  middleware/
  modules/
    auth/
    users/
    products/
    plans/
    taxes/
    discounts/
    quotations/
    subscriptions/
    billing/
    audit/
    invoices/      # shared with Atharv; coordinate before editing
    payments/      # shared with Atharv; coordinate before editing
    dashboard/     # shared with Atharv; coordinate before editing
  jobs/
  utils/
backend/tests/
database/migrations/
database/seeds/
docs/
```

Keep route handlers thin. Separate route/controller, validation, service, and database concerns when useful.

### Phase 0 — Inspect and align
Before coding:
- Inspect repository structure, package files, existing APIs, current schema, migrations, environment files, and tests.
- Identify completed, partial, and missing features.
- Read the shared PRD and team rules.
- Create/update:
  - `docs/PRD.md`
  - `docs/PROJECT_RULES.md`
  - `docs/API_CONTRACT.md`
  - `docs/DATABASE_SCHEMA.md`
  - `docs/SETUP.md`
- Report architecture, risks, file ownership, and phased plan.
- Do not implement a feature that conflicts with Atharv's ownership.

### Phase 1 — Backend foundation
Implement:
- Express + TypeScript startup scripts.
- Environment validation.
- Supabase PostgreSQL connection using the backend's server-side connection configuration.
- Centralized error handler.
- Request validation and safe logging.
- CORS configured for the actual frontend origin with credentials when required.
- Graceful shutdown.
- `GET /api/health`, which checks application/database readiness without exposing secrets.
- `.env.example` with placeholders only.
- `.gitignore` rules that prevent `.env` and credentials from being committed.

Acceptance:
- Server starts.
- Database connection is tested.
- Health endpoint responds.
- TypeScript build works.
- Invalid configuration fails clearly without exposing secrets.

### Phase 2 — Database schema and migrations
Design migrations for:
- Users and customer profiles.
- Password reset tokens if used.
- Products and variants.
- Plans and plan-product relationships.
- Tax rules.
- Discounts and applicability/usage tracking.
- Quotation templates and template lines.
- Quotations and quotation lines.
- Subscriptions and subscription lines/add-ons.
- Invoices, invoice lines, payments, and audit logs in coordination with Atharv.

Use primary/foreign keys, appropriate indexes, uniqueness, checks, timestamps, and explicit deletion/archival behavior. Use `NUMERIC` for authoritative monetary values. Use one consistent ID type. Invoice schema must preserve price/tax/discount snapshots and billing-period identity. Payment schema must support idempotent gateway processing.

All schema changes require migrations and documentation. Create repeatable seed scripts that do not accidentally duplicate records.

Acceptance:
- A clean database can be migrated.
- Constraints behave as expected.
- Seed scripts can be safely rerun.
- Schema docs match actual migrations.

### Phase 3 — Authentication and authorization
Implement the agreed endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- A protected admin-only endpoint for creating staff accounts.

Requirements:
- Public registration always creates Customer accounts only.
- Passwords are hashed.
- Server-side sessions use HTTP-only cookies.
- Configure secure production cookies, SameSite, expiry, logout invalidation, CSRF protection for state-changing cookie-authenticated requests, and rate limits on sensitive endpoints.
- Never trust a role from the browser.
- Use backend middleware for Admin, Staff, and Customer permissions.
- Derive customer identity from the authenticated session; never trust a customer ID supplied by the browser to prove ownership.
- Return consistent, non-revealing authentication errors.

Acceptance:
- Valid login/logout/session restoration works.
- Duplicate email is rejected.
- Public users cannot create Admin/Staff accounts.
- Unauthorized requests are rejected.
- Customer A cannot access Customer B's data.

### Phase 4 — Products and variants
Build the product and variant APIs. Support product name, description, type, active status, price fields required by the PRD, variant attributes, and documented price-adjustment rules. Validate all writes and preserve historical invoice snapshots when catalogue prices change.

### Phase 5 — Plans
Support daily, weekly, monthly, and yearly billing frequencies; name, description, price, product lines, quantity constraints, availability, active status, and allowed pause/resume/renewal/closure rules. Define month-end date behavior. Changing a plan must not silently change the agreed price on an existing subscription.

### Phase 6 — Tax, discounts, and pricing
Support fixed and percentage discounts, date windows, minimum purchase/quantity, product applicability, usage limits, and active status. Implement a reusable pricing service that returns line subtotals, discounts, tax breakdown, and final total. Document calculation order and rounding. Use decimal-safe arithmetic. Prevent concurrent requests from exceeding discount limits.

### Phase 7 — Quotations
Implement quotation templates, quotation lines, customer selection, product quantities, price snapshots, validity/expiry, status, and authorized confirm/cancel actions. Validate status transitions. Confirming a quotation must not create duplicate subscriptions if the request is retried. Coordinate the exact endpoint and response contract with Atharv.

### Phase 8 — Subscription lifecycle
Implement create/list/detail and valid lifecycle actions: activate, pause, resume, renew, and close. Validate each transition on the server and against plan permissions. Preserve subscription number, customer, plan, agreed prices, start/expiry dates, status, next billing date, billing frequency, lines, and add-ons. Document pause/resume effects on billing dates.

### Phase 9 — Recurring billing engine (critical)
Build one reusable billing service called by:
1. The scheduled `node-cron` job.
2. An authorized manual billing endpoint.
3. Automated tests.

For each eligible subscription:
- Select eligible subscriptions.
- Lock/recheck subscription state inside the transaction.
- Determine exact billing period and period key.
- Apply status, expiry, pause, and plan rules.
- Use agreed subscription prices and applicable add-ons.
- Calculate discounts and taxes using the shared pricing service.
- Create invoice and invoice-line snapshots.
- Persist billing-period identity.
- Advance next billing date only as part of the successful transaction.
- Record relevant audit events.
- Commit all related changes atomically.

Duplicate prevention must be enforced by a database unique constraint, not only an application-level existence check. Handle concurrency safely. Define and test how missed periods are processed. Do not silently skip periods. If a period fails, leave the database in a consistent state. Manual and scheduled runs must use identical business logic.

### Phase 10 — Shared API documentation and handoff
For every endpoint document method/path, auth, allowed roles, request/response schemas, errors, validation, ownership, and business rules in `docs/API_CONTRACT.md`. Keep `docs/DATABASE_SCHEMA.md` synchronized with migrations. Provide setup commands, environment variables, seed instructions, and test commands in `docs/SETUP.md`.

### Testing requirements
Test:
- Valid and invalid inputs.
- Role and ownership boundaries.
- Subscription state transitions.
- Tax and discount calculations and rounding.
- Quotation expiry and duplicate confirmation.
- Monthly/yearly and month-end billing dates.
- Duplicate invoice prevention.
- Concurrent billing attempts.
- Missed billing periods.
- Transaction rollback when a billing step fails.
- Auth session expiry/logout.
- API errors and pagination.

### Development loop
For each phase:
1. Explain the feature in simple English.
2. List files to create/change.
3. Implement only that phase.
4. Run tests/builds and report actual output.
5. Fix failures before continuing.
6. Update docs.
7. List acceptance criteria and remaining work.
8. Wait for my verification before starting the next major phase.

### Start now
First inspect the repository. Report:
1. Current structure and what already exists.
2. What is missing.
3. Shared contract/schema conflicts that must be resolved with Atharv.
4. A phased plan.
5. Exact Phase 1 commands.
Then implement Phase 1 only. Do not build the entire application at once.

## PROMPT END — RUTURAJ

---

# 6. Antigravity Prompt — Atharv
Copy the entire prompt below into Atharv's Antigravity workspace.

---

## PROMPT START — ATHARV

You are my senior full-stack engineer, frontend architect, payment integration engineer, test engineer, and technical mentor.

I am Atharv, one of two developers building **Brightloop Subscription Manager** with Ruturaj. We are building one integrated product in one shared Git repository. Ruturaj is separately using Antigravity for the backend platform, shared database, authentication, catalogue, quotations, subscription lifecycle, and core billing engine. Your work must integrate with his code using the shared API contract and Supabase PostgreSQL schema.

### My ownership
I own:
- React + Vite + TypeScript + Tailwind frontend.
- Routing, layouts, reusable components, responsive UI, forms, validation, and error states.
- Login/register/password reset screens and session restoration through Ruturaj's auth API.
- Product, plan, tax, discount, quotation, and subscription screens using Ruturaj's APIs.
- Invoice operational APIs and UI, coordinated with the shared database/schema.
- Payment operations, Razorpay Test Mode checkout, backend payment verification flow, and payment UI.
- Customer portal, with customer ownership enforced by the backend.
- Dashboard analytics APIs/UI, using real backend aggregates.
- Invoice PDF download/presentation.
- Frontend tests and end-to-end integration.
- Frontend setup/deployment docs.

Ruturaj owns the shared authentication/session implementation, database migrations lead, product/plan/tax/discount/quotation/subscription APIs, and core recurring billing service/scheduler. Do not rebuild these modules.

### Product goal
Build a polished, responsive, fully working application—not static mockup screens. The UI must communicate with the real Express API, persist through Supabase PostgreSQL via the backend, and display real backend results.

### Fixed technology stack
- React + Vite + TypeScript.
- Tailwind CSS.
- React Router.
- TanStack Query or one agreed API/data-fetching approach.
- React Hook Form and Zod where useful.
- Recharts for charts.
- A suitable icon library.
- Vitest and React Testing Library.
- Playwright for primary end-to-end tests if practical.
- Backend is Node.js + Express + TypeScript.
- Database is Supabase PostgreSQL, accessed through the backend.
- Razorpay Test Mode only.

Do not connect the browser directly to Supabase PostgreSQL. Do not put any Supabase privileged/database credentials or Razorpay secret into frontend variables. Only public, non-secret frontend configuration such as the API base URL may be exposed.

### Critical collaboration rules
1. Inspect the existing repository before modifying anything.
2. Read `docs/PRD.md`, `docs/PROJECT_RULES.md`, `docs/API_CONTRACT.md`, and `docs/DATABASE_SCHEMA.md`.
3. Do not create a separate app/database or second billing engine.
4. Do not invent endpoint response shapes. Use the API contract. If an endpoint is missing, document it and coordinate with Ruturaj before changing shared contracts.
5. Do not modify Ruturaj-owned modules, auth middleware, billing service, or shared schema without agreement.
6. Invoice and payment operational APIs are my responsibility, but their tables and shared types must be agreed with Ruturaj and documented before changes.
7. The backend owns authoritative prices, taxes, discounts, invoice totals, outstanding amounts, permissions, subscription state, and payment verification. The frontend only displays server-calculated values.
8. Do not mark an invoice paid from a frontend callback alone. The backend must verify Razorpay payment/signature and process payment idempotently.
9. Do not use fake data as a substitute for working APIs. Temporary fixtures may be used only for isolated component tests and must not be presented as real integrated data.
10. Never claim a build/test passed unless you actually ran it and observed the result.
11. Implement in phases; do not generate the entire app in one response.
12. Use simple explanations and exact run/test commands.

### Phase 0 — Inspect and align
Inspect the current repository, package files, routes, components, API contracts, schema docs, and test setup. Identify existing and missing modules. Create/update docs only after checking current contents. Report any API or schema decisions that require Ruturaj's agreement.

### Phase 1 — Frontend foundation
Set up or adapt:
- React + Vite + TypeScript.
- Tailwind CSS.
- React Router.
- Shared page layout, navigation, responsive shell, reusable buttons/forms/tables/dialogs/status badges.
- API client with configured base URL, JSON parsing, credentials/session cookies, and standardized errors.
- Environment example with non-secret frontend configuration only.
- Loading, empty, error, success, and unauthorized states.
- Route guards based on `/api/auth/me`; the backend remains the authority for permissions.

Acceptance:
- Frontend runs.
- TypeScript checks/build works.
- Responsive base layout works.
- API client handles successful and failed requests consistently.
- No secret is present in frontend code.

### Phase 2 — Auth UI and session integration
Implement registration, login, logout, password-reset screens, session restoration, and role-based navigation using Ruturaj's documented API. Send credentials with requests where cookie sessions require it. Handle session expiry and unauthorized API responses. Do not invent your own session token system or put session IDs in local storage.

### Phase 3 — Catalogue and quotation interfaces
Implement Admin/Staff screens for products, variants, plans, taxes, discounts, quotations, and quotation details by calling the real APIs. Include forms, client-side usability validation, server-error display, loading/empty states, pagination if needed, and confirmation dialogs. Client-side validation is for usability only; server validation remains authoritative.

### Phase 4 — Subscription interfaces and customer portal
Build subscription list/details and permitted lifecycle actions. Render action buttons based on the returned role/status/permissions, but remember that backend authorization is mandatory. Build the customer portal with My Subscriptions, My Invoices, payment status, PDF downloads, and allowed pause/resume/renew/close actions. Never trust a customer ID from the URL/body to determine ownership.

### Phase 5 — Invoice operations
Coordinate schema and endpoints with Ruturaj before implementing. Implement:
- Invoice list with pagination, search, status filters, and dates.
- Invoice detail with line snapshots, subtotal, discounts, taxes, total, amount paid, outstanding balance, currency, due date, and billing period.
- Authorized invoice actions according to the agreed status model.
- PDF download through an authorized backend endpoint.
- Correct status labels and clear error handling.

Do not calculate authoritative totals in React. Use the backend response. Do not allow customers to arbitrarily edit invoice amounts or mark invoices paid.

### Phase 6 — Payment operations and Razorpay Test Mode
Integrate Razorpay in test mode only. Confirm the current backend contract with Ruturaj and document any required endpoints before implementing.

Expected high-level flow:
1. Customer opens an eligible invoice and chooses Pay.
2. Frontend requests the backend to create a Razorpay order for the exact remaining payable amount.
3. Backend calculates the amount from the invoice; it does not trust a browser-provided amount.
4. Frontend opens Razorpay Checkout using the order information returned by the backend and test-mode public key ID.
5. On checkout result, frontend sends the required payment identifiers/signature to the backend verification endpoint.
6. Backend verifies the Razorpay signature, validates the order/invoice association, and records the payment idempotently.
7. Where webhooks are configured, backend verifies the webhook signature and deduplicates events.
8. Frontend refetches the invoice/payment data from the backend and shows the verified result.

Security rules:
- Razorpay key secret exists only in backend environment variables.
- Never mark an invoice Paid based only on a frontend callback.
- Repeated callbacks or webhooks must not create duplicate payments.
- Use test credentials only.
- Handle cancel, failure, pending, partial, and successful payment states.
- Never log secrets or full sensitive payment payloads.

Version 1 recurring billing means generating invoices on schedule, not automatic charging of saved payment methods. Each invoice is paid through checkout unless the team later agrees to implement mandates as a separate feature.

### Phase 7 — Dashboard and analytics
Build an Admin/Staff dashboard using real backend summary/series endpoints. Suggested KPIs:
- MRR (according to the agreed normalization rules).
- Invoiced amount.
- Payments received.
- Outstanding amount.
- Overdue amount.
- Active subscriptions.
- Upcoming renewals.
- Recent invoices/payments.

Use charts with date filters and sensible empty states. Keep KPI definitions in `docs/PRD.md` or `docs/API_CONTRACT.md`. Do not calculate financial KPIs from only the currently visible frontend table or use hard-coded sample values.

### Phase 8 — Testing
Write tests for:
- Auth form validation and API errors.
- Route/session states.
- Role-based navigation.
- Catalogue/quotation/subscription form behavior.
- Invoice totals displayed exactly as returned by the backend.
- Partial/full payment status display.
- Razorpay cancel/failure/success UI flow with test-mode integration.
- Dashboard loading, errors, empty states, and filters.
- Customer ownership behavior as verified through backend integration tests.
- Responsive navigation and critical pages.

Create a Playwright end-to-end flow where practical. Use a dedicated test dataset/environment and never use real payment credentials.

### Primary end-to-end acceptance workflow
1. Admin configures a product and subscription plan.
2. Staff creates a quotation for a customer.
3. Quotation is confirmed and a subscription is created/activated.
4. Billing service creates the invoice.
5. Invoice shows correct server-calculated lines, discounts, taxes, and total.
6. Customer opens their own invoice and downloads the PDF.
7. Customer pays through Razorpay Test Mode.
8. Backend verifies and records payment.
9. Invoice/payment page shows the verified amount and correct remaining balance.
10. Dashboard reflects the backend's invoiced/payment/outstanding figures.
11. Running billing again does not create a duplicate invoice for the same billing period.
12. Customer cannot access another customer's invoice/subscription by changing an ID.

### Development loop
For every phase:
1. Explain the feature in simple English.
2. List files to create/change.
3. Check the API contract before wiring UI.
4. Implement the phase.
5. Run tests/builds and report actual output.
6. Fix failures before continuing.
7. Update documentation and list any endpoints still needed from Ruturaj.
8. Wait for my verification before starting the next major phase.

### Start now
First inspect the repository. Report:
1. Existing frontend/backend structure and features.
2. Current API contracts and what is missing.
3. Shared schema/API decisions requiring Ruturaj.
4. A phased plan.
5. Exact Phase 1 commands.
Then implement Phase 1 only. Do not generate the entire application at once.

## PROMPT END — ATHARV

---

# 7. Shared Prompt — Paste into BOTH Antigravity Workspaces First

Save this as `docs/PROJECT_RULES.md` and give it to both coding assistants.

```text
We are building Brightloop Subscription Manager in one shared repository.

Team:
- Ruturaj owns backend foundation, Supabase PostgreSQL schema/migrations lead, auth/session/RBAC, products, plans, taxes, discounts, quotations, subscription lifecycle, and the core recurring billing engine/scheduler.
- Atharv owns the React frontend, invoice operational APIs, payment operations and Razorpay Test Mode, customer portal, dashboard analytics, and end-to-end integration.

Fixed stack:
- React + Vite + TypeScript + Tailwind CSS frontend.
- Node.js + Express + TypeScript backend.
- Supabase PostgreSQL as the only database.
- Express-managed server-side sessions using HTTP-only cookies.
- Razorpay Test Mode for version 1 invoice payments.
- node-cron for scheduled invoice generation.

One source of truth:
- Backend and PostgreSQL are authoritative for users/roles, ownership, product and plan prices, tax, discounts, invoices, payment verification, balances, subscription state, and dashboard metrics.
- Frontend must never determine authoritative financial values.
- No browser-to-database connection and no secrets in frontend code.

Integration:
- Use one API prefix, one response/error convention, one ID strategy, one schema, and one auth/session implementation.
- Document every API method/path, request/response, roles, validation, errors, ownership, and business rules in docs/API_CONTRACT.md.
- Document schema and relationships in docs/DATABASE_SCHEMA.md.
- Do not change contracts or shared schema without notifying the other member and updating documentation.
- Every schema change uses a migration.
- Invoice generation has a database-level uniqueness rule for each subscription billing period.
- Manual and scheduled billing call the same service.
- Payment processing is idempotent and verified on the backend.
- Razorpay secret credentials remain server-side.
- Do not build duplicate billing engines, separate databases, or duplicate auth systems.

Git:
- main = stable.
- develop = integration.
- feature/ruturaj-backend = Ruturaj's work.
- feature/atharv-frontend = Atharv's work.
- Prefer small commits and frequent integration.
- Do not commit .env files, secrets, or sensitive data.

Coding workflow:
- Inspect existing files before modifying.
- Implement in small phases.
- Run tests/builds and report only results actually observed.
- Do not replace real implementation with fake data.
- If an API dependency is missing, document it and coordinate; do not invent a conflicting contract.
- Keep docs updated.
- Stop after the current phase and wait for review before proceeding.
```

---

# 8. Development Order — Follow This Sequence

## Phase 1: Align before coding (both)
1. Create/use one Git repository.
2. Add the PRD and shared project rules.
3. Agree the API response/error convention.
4. Agree the shared database schema, including invoices and payments.
5. Agree endpoint names and payloads.
6. Create `.env.example` with placeholders.
7. Create a shared issue/task list.

**Gate:** Neither member starts dependent feature implementation until API and schema contracts are written down.

## Phase 2: Work in parallel
**Ruturaj**
- Express/TypeScript foundation.
- Supabase PostgreSQL connection.
- Migrations, seed strategy, health endpoint.
- Auth/session/RBAC.

**Atharv**
- React/Vite/TypeScript/Tailwind foundation.
- App shell, routing, reusable components, API client.
- Login/register screens ready to connect to documented APIs.

## Phase 3: Catalogue and core business workflows
**Ruturaj:** products, variants, plans, taxes, discounts, quotations, subscriptions.  
**Atharv:** corresponding UI pages and forms using the agreed contracts.

## Phase 4: Billing and financial operations
**Ruturaj:** transaction-safe recurring invoice-generation service, scheduler, manual trigger, duplicate prevention, missed periods.  
**Atharv:** invoice operations/UI, PDF integration, payment operations, Razorpay Test Mode, dashboard analytics, customer portal.

## Phase 5: Integrate continuously
- Merge small changes regularly.
- Keep the integration branch buildable.
- Do not wait until both modules are “finished” before combining them.
- When an API changes, update the contract and notify the other member before frontend code depends on it.

## Phase 6: Test and deploy
- Run backend and frontend tests.
- Run the primary end-to-end workflow below.
- Deploy frontend to Vercel and backend to Render or Railway.
- Configure CORS, cookie settings, API base URL, and environment variables for production hosting.
- Use only Razorpay Test Mode credentials for the project demo.
- Verify deployment with real requests; do not report success until tested.

---

# 9. Final Integration Checklist

- [ ] One shared repository and one Supabase PostgreSQL database.
- [ ] Migrations initialize a clean database.
- [ ] Login, logout, session restoration, and role authorization work.
- [ ] Public registration can create Customer accounts only.
- [ ] Admin can manage products, variants, plans, taxes, and discounts.
- [ ] Staff can create and confirm quotations.
- [ ] Confirmed quotations create the expected subscription without duplicates.
- [ ] Subscription lifecycle transitions are enforced by the backend.
- [ ] Manual billing invokes the same service as scheduled billing.
- [ ] Billing generates one invoice per eligible subscription period.
- [ ] Repeated/concurrent billing does not duplicate invoices.
- [ ] Missed billing periods follow documented rules.
- [ ] Historical invoice lines and totals do not change when catalogue prices change.
- [ ] Invoice PDF downloads are authorized.
- [ ] Partial payments update outstanding balance correctly.
- [ ] Razorpay payment is verified server-side in Test Mode.
- [ ] Duplicate callbacks/webhooks do not duplicate payment records.
- [ ] Invoice becomes Paid only when verified payments settle the balance.
- [ ] Customer portal restricts data to the authenticated customer.
- [ ] Dashboard metrics match backend/database records.
- [ ] Loading, empty, error, and success states work.
- [ ] Frontend build and backend tests are run and results documented.
- [ ] `.env` and secrets are not committed.
- [ ] Setup instructions work from a fresh checkout.

## The primary demo workflow

1. Admin creates a product and a monthly plan.
2. Staff creates a quotation for a customer.
3. Staff confirms the quotation; a subscription is created.
4. The billing service creates the invoice.
5. The invoice displays correct line items, tax, discounts, total, and due date.
6. Customer logs in and sees only their own subscription/invoice.
7. Customer downloads the invoice PDF.
8. Customer makes a test payment using Razorpay Test Mode.
9. Backend verifies the payment and records it once.
10. Invoice and dashboard show the correct paid and outstanding amounts.
11. A second billing run does not create a duplicate invoice.
12. A customer attempting to access another customer's invoice is denied.

**Final instruction to both developers:** Build one product, not two separate projects. Shared contracts and migrations come before dependent features. Integrate early, test the complete workflow, and keep the backend authoritative for all financial and security decisions.
