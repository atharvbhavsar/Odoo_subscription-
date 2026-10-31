# Setup Guide

## Prerequisites
- Node.js >= 18 (Current: v24.13.1)
- npm >= 9 (Current: 11.8.0)
- PostgreSQL / Supabase connection (or SQLite compatibility driver for zero-dependency local runs & tests)

## Environment Variables
See `backend/.env.example` and `frontend/.env.example`.

### Backend:
```bash
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
SESSION_SECRET=supersecret-session-key-change-in-production
FRONTEND_URL=http://localhost:5173
RAZORPAY_KEY_ID=rzp_test_mock_key
RAZORPAY_KEY_SECRET=rzp_test_mock_secret
```

### Frontend:
```bash
VITE_API_BASE_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=rzp_test_mock_key
```

## Running the Application

### 1. Backend
```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Automated Tests
```bash
# In backend:
npm test

# In frontend:
npm test
```

