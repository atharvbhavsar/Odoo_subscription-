# Deployment Guide — Brightloop Subscription Manager

## Production Deployment (Vercel — Recommended)

The project is configured for single-command deployment via the Vercel CLI.

### Prerequisites
- Vercel account at https://vercel.com
- Vercel CLI: `npm install -g vercel`
- Repository linked to Vercel project (first-time setup only)

### First-Time Setup

```bash
# From project root
vercel link
# Select: Link to existing project OR create new project
# Project name: brightloop-subscription-manager
```

### Deploy to Production

```bash
# From project root
npx vercel --prod --yes
```

The deployment uses `vercel.json` to:
- Serve `frontend/dist/` as the static SPA (all non-API routes)
- Route `/api/*` to `api/index.js` (Express serverless function)

### Verify Deployment

```bash
curl https://brightloop-subscription-manager-five.vercel.app/api/health
# Expected: {"status":"healthy"}
```

---

## Environment Variables (Vercel Dashboard)

Set these in **Vercel Project Settings → Environment Variables**:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Required |
| `SESSION_SECRET` | A random 64-character string | **Never commit this** |
| `RAZORPAY_KEY_ID` | Your Razorpay Test Key ID | From Razorpay Dashboard |
| `RAZORPAY_KEY_SECRET` | Your Razorpay Test Key Secret | From Razorpay Dashboard |
| `FRONTEND_URL` | `https://your-vercel-domain.vercel.app` | For CORS |
| `VITE_API_BASE_URL` | `https://your-vercel-domain.vercel.app/api` | Frontend build var |
| `VITE_RAZORPAY_KEY_ID` | Your Razorpay Test Key ID | Frontend build var |

> **Security:** Never commit secrets, API keys, or passwords to version control.

---

## Vercel Configuration File

`vercel.json` (project root):

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "frontend/dist/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/(.*)", "dest": "/frontend/dist/$1" }
  ]
}
```

---

## Database Notes (Serverless)

The backend uses SQLite bundled with the serverless function. On Vercel:
- SQLite file is created in `/tmp/brightloop.sqlite` on cold start
- Migrations run automatically on first request via the bootstrap middleware
- Data persists within a warm serverless instance but is reset on cold starts

For a persistent production database, migrate to **PostgreSQL** (e.g., Supabase, Neon) and update the DB adapter in `backend/src/config/database.ts`.

---

## Local Development

See [README.md](../README.md) for local setup instructions.

### Backend

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
# API: http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## Alternative Backend Deployment (Render / Railway)

If you prefer a persistent server instead of serverless:

### Render

1. Create a **Web Service** on https://render.com
2. Set Root Directory: `backend`
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Set environment variables (see table above, add `DATABASE_PATH=/var/data/brightloop.sqlite`)

### Railway

1. Create a new project on https://railway.app
2. Connect your GitHub repository
3. Set Root Directory: `backend`
4. Set environment variables
5. Railway auto-detects Node.js and runs `npm start`

Then update `VITE_API_BASE_URL` in your frontend Vercel deployment to point to the Render/Railway backend URL.

---

## CORS and Cookie Configuration

Production cookies are configured with:
- `secure: true` — HTTPS only
- `sameSite: 'none'` — Cross-origin cookie support for Vercel SPA + API

CORS is configured to allow only `process.env.FRONTEND_URL` with `credentials: true`.

---

## Rollback

To roll back a Vercel deployment:

```bash
vercel rollback [deployment-url]
```

Or use the Vercel Dashboard → Deployments → select a previous deployment → **Promote to Production**.
