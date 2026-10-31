# Brightloop Subscription Manager

Unified full-lifecycle subscription management and recurring billing web application for Brightloop Software.

## Features
- **Role-Based Access Control:** Secure session auth (Admin, Staff, Customer) with HTTP-only cookies.
- **Product & Variant Catalogue:** Configure base pricing, types, and brand variants (e.g. Odoo brand +$560).
- **Flexible Subscription Plans:** Daily, weekly, monthly, and yearly cadences with lifecycle policies.
- **Automated Tax & Discount Rules:** Percentage and fixed discounts, expiration dates, usage limits, and automatic calculation.
- **Quotation Workflow:** Draft &rarr; Quotation &rarr; Confirmed &rarr; Active Subscription.
- **Automated Billing Engine:** Recurring period invoice generation with database-level duplicate prevention `(subscription_id, period_start)`.
- **Invoices & PDF:** Immutable price snapshots and downloadable PDF statements.
- **Payment Processing:** Full and partial payments, Razorpay Test Mode integration, idempotent signature verification.
- **Customer Self-Service Portal:** Ownership-protected subscription and invoice views.
- **Executive Financial Dashboard:** Real-time metrics for MRR, Invoiced Revenue, Collected Payments, Outstanding Balances, and Overdue Invoices.

## Documentation
- [PRD](docs/PRD.md)
- [Project Rules](docs/PROJECT_RULES.md)
- [API Contract](docs/API_CONTRACT.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Setup Instructions](docs/SETUP.md)
- [Integration Checklist](docs/INTEGRATION_CHECKLIST.md)

