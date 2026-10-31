# Brightloop Subscription Manager

> Full-lifecycle subscription management and automated recurring billing platform.

**Production URL:** https://brightloop-subscription-manager-five.vercel.app  
**Tech Stack:** Node.js · Express · SQLite · React · TypeScript · Vite · Vercel

---
## Features
| Module | Description |
|---|---|
| **Authentication & RBAC** | Session-based auth with HTTP-only cookies; Admin, Staff, and Customer roles |
| **Product Catalogue** | Base pricing, product types, and brand variants (e.g. Odoo brand +\$560) |
| **Subscription Plans** | Daily / weekly / monthly / yearly cadences with lifecycle policies |
| **Tax & Discount Engine** | Percentage and fixed discounts, validity dates, usage limits, automatic calculation |
| **Quotation Workflow** | Draft → Quotation → Confirmed → Active Subscription with template support |
| **Recurring Billing Engine** | Period invoice generation with duplicate prevention `(subscription_id, period_start)` |
| **Invoices & PDF** | Immutable price snapshots, downloadable PDF statements, email delivery |
| **Payment Processing** | Full/partial payments, Razorpay Test Mode integration, idempotent webhook verification |
| **Customer Self-Service Portal** | Ownership-protected subscription, invoice, and add-on management |
| **Executive Dashboard** | Real-time MRR, invoiced revenue, collected payments, outstanding balances, overdue metrics |

---

## Project Structure

```
brightloop-subscription-manager/
├── backend/                  # Express API server
│   ├── src/
│   │   ├── modules/          # Feature modules (auth, billing, products, …)
│   │   ├── config/           # DB connection, migrations, seeds
│   │   └── index.ts          # Express app entry point
│   ├── database/
│   │   ├── 001_initial_schema.sql … 009_subscription_lifecycle_improvements.sql
│   │   └── seeds/001_seed_data.sql
│   └── tests/                # 12 test suites (119 tests)
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── pages/            # Admin, Staff, Customer, and shared pages
│   │   ├── components/       # Shared UI components
│   │   └── services/         # API service layer
│   └── tests/                # 48 frontend unit tests
├── docs/                     # Full documentation suite
├── api/index.js              # Vercel serverless entry point
└── vercel.json               # Vercel routing config
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- npm 10+

### 1. Clone the repository
```bash
git clone https://github.com/atharvbhavsar/Odoo_subscription-.git
cd Odoo_subscription-
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Configure backend environment
Create `backend/.env`:
```
PORT=5000
NODE_ENV=development
SESSION_SECRET=your-local-session-secret-min-32-chars
RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
DATABASE_PATH=./brightloop.sqlite
FRONTEND_URL=http://localhost:5173
```

### 4. Run database migrations and seed
```bash
cd backend
npm run migrate
npm run seed
```

### 5. Start the backend server
```bash
cd backend
npm run dev
# API available at http://localhost:5000
```

### 6. Install frontend dependencies
```bash
cd frontend
npm install
```

### 7. Configure frontend environment
Create `frontend/.env`:
```
VITE_API_BASE_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=your_razorpay_test_key_id
```

### 8. Start the frontend dev server
```bash
cd frontend
npm run dev
# App available at http://localhost:5173
```

---

## Default Credentials (Development / Seed Data)

| Role | Email | Password |
|---|---|---|
| Admin | admin@brightloop.com | Password@123 |
| Staff | staff@brightloop.com | Password@123 |
| Customer | customer@acme.com | Password@123 |

> **Note:** These credentials are for development/demo only. Change all passwords before going to production.

---

## Running Tests

### Backend (119 tests across 12 suites)
```bash
cd backend
npm run test:all
```

Individual suites:
```bash
npm run test:auth
npm run test:billing
npm run test:invoice
npm run test:pdf-email
npm run test:dashboard
npm run test:billing-run
npm run test:addon
npm run test:quotation
npm run test:customer-portal
npm run test:lifecycle
npm run test:billing-integration
npm run test:run
```

### Frontend (48 tests)
```bash
cd frontend
npm test
```

### Frontend Build Check
```bash
cd frontend
npm run build
```

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full Vercel deployment instructions.

**Quick deploy (requires Vercel CLI):**
```bash
npx vercel --prod --yes
```

---

## Documentation

| Document | Description |
|---|---|
| [API Contract](docs/API_CONTRACT.md) | Full REST API reference with request/response schemas |
| [Database Schema](docs/DATABASE_SCHEMA.md) | All tables, columns, constraints, and relationships |
| [Billing Integration](docs/BILLING_INTEGRATION.md) | Recurring billing architecture and integration guide |
| [Deployment](docs/DEPLOYMENT.md) | Vercel deployment guide and environment variables |
| [Testing](docs/TESTING.md) | Test suite overview and how to run tests |
| [Project Architecture](docs/PROJECT_ARCHITECTURE.md) | System design, module overview, and data flow |
| [PRD](docs/PRD.md) | Product requirements document |
| [Project Rules](docs/PROJECT_RULES.md) | Development conventions and team rules |

---

## Team

| Developer | Role | Scope |
|---|---|---|
| Ruturaj (Member A) | Backend & Lifecycle | Steps 9, 10 — Quotations, Subscription Lifecycle |
| Atharv (Member B) | Billing & Portal | Steps 11, 12 — Customer Portal, Billing Integration |

---

## License

This project is developed as an academic software engineering project for Brightloop Software.
