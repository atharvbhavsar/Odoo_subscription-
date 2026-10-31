# Deployment Guide

## Frontend Deployment (Vercel)
1. Import repository on [Vercel](https://vercel.com).
2. Set Root Directory to `frontend`.
3. Set Build Command: `npm run build`.
4. Set Output Directory: `dist`.
5. Environment Variables:
   - `VITE_API_BASE_URL`: URL of your deployed backend (e.g. `https://brightloop-api.onrender.com/api`)
   - `VITE_RAZORPAY_KEY_ID`: Your Razorpay Test Mode Key ID.

## Backend Deployment (Render / Railway)
1. Create a Web Service on [Render](https://render.com) or [Railway](https://railway.app).
2. Set Root Directory to `backend`.
3. Build Command: `npm run build`.
4. Start Command: `npm start`.
5. Environment Variables:
   - `PORT`: `5000` (or injected by platform)
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: Connection string for Supabase PostgreSQL.
   - `SESSION_SECRET`: A high-entropy secret string.
   - `FRONTEND_URL`: URL of your deployed frontend on Vercel.
   - `RAZORPAY_KEY_ID`: Razorpay Test Mode Key ID.
   - `RAZORPAY_KEY_SECRET`: Razorpay Test Mode Key Secret.

## CORS and Cookie Configuration
- In production, session cookies are configured with `secure: true` and `sameSite: 'none'`.
- `cors` origin is set dynamically to `process.env.FRONTEND_URL` with `credentials: true`.

