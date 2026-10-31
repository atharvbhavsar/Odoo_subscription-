# Project Rules: Brightloop Subscription Manager

We are building Brightloop Subscription Manager in one shared repository.

## Team
- **Ruturaj** owns backend foundation, Supabase PostgreSQL schema/migrations lead, auth/session/RBAC, products, plans, taxes, discounts, quotations, subscription lifecycle, and the core recurring billing engine/scheduler.
- **Atharv** owns the React frontend, invoice operational APIs, payment operations and Razorpay Test Mode, customer portal, dashboard analytics, and end-to-end integration.

## Fixed Stack
- React + Vite + TypeScript + Tailwind CSS frontend.
- Node.js + Express + TypeScript backend.
- Supabase PostgreSQL as the primary database (with pluggable SQL driver for tests/local SQLite/PostgreSQL compatibility).
- Express-managed server-side sessions using HTTP-only cookies.
- Razorpay Test Mode for version 1 invoice payments.
- node-cron for scheduled invoice generation.

## One Source of Truth
- Backend and PostgreSQL are authoritative for users/roles, ownership, product and plan prices, tax, discounts, invoices, payment verification, balances, subscription state, and dashboard metrics.
- Frontend must never determine authoritative financial values.
- No browser-to-database connection and no secrets in frontend code.

## Integration & Contracts
- Use one API prefix (`/api`), one response/error convention, one ID strategy, one schema, and one auth/session implementation.
- Document every API method/path, request/response, roles, validation, errors, ownership, and business rules in `docs/API_CONTRACT.md`.
- Document schema and relationships in `docs/DATABASE_SCHEMA.md`.
- Do not change contracts or shared schema without notifying the other member and updating documentation.
- Every schema change uses a migration.
- Invoice generation has a database-level uniqueness rule for each subscription billing period `(subscription_id, period_start)`.
- Manual and scheduled billing call the same service.
- Payment processing is idempotent and verified on the backend.
- Razorpay secret credentials remain server-side.
- Do not build duplicate billing engines, separate databases, or duplicate auth systems.

## Git & Workflow
- main = stable.
- develop = integration.
- feature/ruturaj-backend = Ruturaj's work.
- feature/atharv-frontend = Atharv's work.
- Small commits, frequent integration.
- Do not commit `.env` files, secrets, or sensitive data.
- Run tests and report actual observed results.

