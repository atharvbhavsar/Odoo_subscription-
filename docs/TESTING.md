# Testing Guide — Brightloop Subscription Manager

## Overview

The Brightloop Subscription Manager test suite consists of **12 backend test suites** (119 tests) and **48 frontend unit tests**, covering all features from Steps 8–12.

---

## Backend Tests

All backend tests use the project's own in-memory SQLite engine. Each test suite runs `migrate` and `seed` automatically before executing.

### Running All Backend Tests
```bash
cd backend
npm run test:all
```
Expected output: `119 tests passing` across 12 suites.
---
### Individual Test Suites
| Command | Suite File | Tests | What It Covers |
|---|---|---|---|
| `npm run test:auth` | `auth_tests.ts` | 8 | Password complexity, public registration, RBAC, password reset, cross-customer isolation |
| `npm run test:billing` | `billing_tests.ts` | 10 | Recurring billing engine, idempotency, missed-period catch-up, pause/expiry, tax/discount rounding, add-on billing, transaction rollback |
| `npm run test:invoice` | `invoice_tests.ts` | ~10 | Invoice creation, line items, PDF generation, numbering uniqueness, status transitions |
| `npm run test:pdf-email` | `pdf_email_tests.ts` | ~8 | PDF invoice rendering, email delivery simulation, attachment handling |
| `npm run test:dashboard` | `dashboard_tests.ts` | ~8 | MRR aggregates, invoiced/collected revenue, outstanding balances, overdue metrics, RBAC gating |
| `npm run test:billing-run` | `billing_run_http_tests.ts` | ~10 | Billing run HTTP API, admin-only gate, run result reporting |
| `npm run test:addon` | `addon_tests.ts` | ~12 | Add-on creation, effective dates, quantity changes, pricing security, lifecycle states, ownership |
| `npm run test:quotation` | `quotation_tests.ts` | ~15 | Quotation creation, templates, line items, send/confirm/cancel/expire, duplicate confirmation prevention, subscription activation |
| `npm run test:customer-portal` | `customer_portal_tests.ts` | 11 | Customer dashboard, subscription actions, quotation viewing, invoice history, add-on self-service, ownership enforcement |
| `npm run test:lifecycle` | `subscription_lifecycle_tests.ts` | ~12 | Pause/resume/renew/close, billing date advancement, automatic expiry, plan policy checks, state machine transitions |
| `npm run test:billing-integration` | `billing_integration_tests.ts` | 16 | End-to-end billing integration: pricing, taxes, discounts, add-ons, payment lifecycle, idempotency, historical preservation |
| `npm run test:run` | `run_tests.ts` | 14 | Full integration smoke test: registration → pricing → quotation → subscription → billing → payment → dashboard → ownership |
---
## Frontend Tests
Frontend tests use Node.js's built-in `--test` runner.
### Running Frontend Tests
```bash
cd frontend
npm test
```

Expected output: `48 tests passing`.

### Frontend Production Build Check

```bash
cd frontend
npm run build
```

Expected: TypeScript compilation succeeds, Vite produces `dist/` with no errors.

---

### Frontend Test Coverage

| Area | Tests | What It Covers |
|---|---|---|
| Add-on logic | 9 | Payload creation, quantity validation, effective date, status mutability, RBAC |
| UI helpers | 5 | Badge color mapping, decimal rounding, role-based navigation filtering |
| Plans | 6 | Form validation, date windows, bundled products, search/filter, RBAC |
| Products & Variants | 5 | Form validation, effective price calculation, search/filter, RBAC |
| Quotations | 5 | Form validation, expiry logic, status mutability, search/filter, RBAC |
| Subscription Lifecycle | 4 | State transitions, plan policy, date advancement, search/filter |
| Tax & Discount | 5 | Form validation, search/filter, RBAC, exclusion from inactive selectors |
| Quotation Templates | 3 | Line mapping, validation rules, RBAC visibility |
| Customer Portal | 6 | Tab navigation, KPI aggregates, permission gating, invoice aging, ownership protection |
| Billing Run | 1 | Admin gating and report schema handling |

---

## Fresh Installation Test

To verify that all migrations run cleanly on an empty database:

```bash
cd backend
$env:DATABASE_PATH = "./test_fresh.sqlite"
npm run migrate
npm run seed
# Verify: "All 9 migrations applied successfully"
Remove-Item ./test_fresh.sqlite
```

All 9 migrations (`001` through `009`) must apply in order without errors.

---

## Test Environment Notes

- Backend tests create an isolated in-memory SQLite instance per suite run; they do **not** affect the development database.
- Tests use dynamic suffixes (`Date.now()`, `Math.random()`) for unique constraint fields (email, invoice number, payment gateway IDs, discount codes) to prevent collisions on repeated runs.
- The `billing_run_http_tests.ts` suite starts a temporary HTTP server on port `5001` during the test and tears it down after.
- Frontend tests run entirely in Node.js without a browser; they test pure logic functions and service layer behaviour.

---

## Interpreting Test Output

A passing run looks like:
```
ALL 16 BILLING INTEGRATION TESTS COMPLETED SUCCESSFULLY!
====================================================
ALL 14 INTEGRATION TESTS COMPLETED & PASSED SUCCESSFULLY!
====================================================
```

A failing test will print the error inline and exit with code 1, stopping the `test:all` chain.

---

## CI Integration

To run all tests in a CI pipeline:

```bash
# Backend
cd backend && npm run test:all

# Frontend
cd frontend && npm test && npm run build
```

Both commands exit with code `0` on full pass and code `1` on any failure — compatible with all standard CI systems.
