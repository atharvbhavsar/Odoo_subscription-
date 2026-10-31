# API Contract

Prefix: `/api`

## Response Format

### Success:
```json
{
  "data": {},
  "message": "Operation completed"
}
```

### Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error explanation",
    "details": {}
  }
}
```

## Endpoints

### 1. Auth Module (`/api/auth`)
- `POST /api/auth/register` (Public) - Payload: `{ email, password, name, companyName?, phone? }`. Always assigns `role: customer`.
- `POST /api/auth/login` (Public) - Payload: `{ email, password }`. Sets HTTP-only session cookie.
- `POST /api/auth/logout` (Auth) - Clears session.
- `GET /api/auth/me` (Auth) - Returns current session user `{ id, email, role, customerId, name }`.
- `POST /api/auth/users/staff` (Admin only) - Creates staff user.

### 2. Products & Variants (`/api/products`)
- `GET /api/products` (Auth) - Lists products and active variants.
- `POST /api/products` (Admin only) - Creates product `{ name, type, sales_price, cost_price, notes }`.
- `PATCH /api/products/:id` (Admin only) - Updates product.
- `POST /api/products/:id/variants` (Admin only) - Creates variant `{ attribute_name, attribute_value, price_extra }`.

### 3. Plans (`/api/plans`)
- `GET /api/plans` (Auth) - Lists plans.
- `POST /api/plans` (Admin only) - Creates plan `{ name, billing_frequency, price, min_qty, can_pause, can_renew, can_close_early, auto_close }`.
- `PATCH /api/plans/:id` (Admin only) - Updates plan.

### 4. Taxes & Discounts (`/api/taxes`, `/api/discounts`)
- `GET /api/taxes` (Auth) - Lists taxes.
- `POST /api/taxes` (Admin only) - Creates tax `{ name, rate_percentage }`.
- `GET /api/discounts` (Auth) - Lists discounts.
- `POST /api/discounts` (Admin only) - Creates discount `{ code, type: "fixed"|"percentage", value, min_purchase_amount, min_quantity, start_date, end_date, max_uses }`.

### 5. Quotations (`/api/quotations`)
- `GET /api/quotations` (Admin/Staff) - Lists quotations.
- `POST /api/quotations` (Admin/Staff) - Creates quotation `{ customer_id, plan_id, discount_id?, tax_id?, valid_until, lines: [{ product_id, variant_id?, quantity, unit_price }] }`.
- `GET /api/quotations/:id` (Admin/Staff/Customer if owner) - Details.
- `POST /api/quotations/:id/confirm` (Admin/Staff) - Confirms quotation and activates/generates subscription.
- `POST /api/quotations/:id/cancel` (Admin/Staff) - Cancels quotation.

### 6. Subscriptions (`/api/subscriptions`)
- `GET /api/subscriptions` (Admin/Staff) - Lists all subscriptions.
- `GET /api/subscriptions/:id` (Admin/Staff/Customer if owner) - Details.
- `POST /api/subscriptions/:id/activate` (Admin/Staff) - Activates subscription.
- `POST /api/subscriptions/:id/pause` (Admin/Staff/Customer if plan permits) - Pauses subscription.
- `POST /api/subscriptions/:id/resume` (Admin/Staff/Customer if plan permits) - Resumes subscription.
- `POST /api/subscriptions/:id/close` (Admin/Staff/Customer if plan permits) - Closes subscription.

### 7. Billing Engine (`/api/billing`)
- `POST /api/billing/run` (Admin/Staff) - Executes billing run for due subscriptions. Calls the shared billing service.
- `GET /api/billing/history` (Admin/Staff) - Billing job execution logs.

### 8. Invoices (`/api/invoices`)
- `GET /api/invoices` (Admin/Staff) - Lists all invoices.
- `GET /api/invoices/:id` (Admin/Staff/Customer if owner) - Detailed snapshot with lines, taxes, payments, balance.
- `GET /api/invoices/:id/pdf` (Admin/Staff/Customer if owner) - Generates/downloads authorized PDF.

### 9. Payments & Razorpay (`/api/payments`)
- `POST /api/payments/create-order` (Customer/Staff) - Creates Razorpay Order for remaining balance.
- `POST /api/payments/verify` (Customer/Staff) - Verifies Razorpay signature, records payment, updates outstanding balance and invoice status (`partially_paid` or `paid`).
- `POST /api/payments/record-offline` (Admin/Staff) - Records offline/manual payment.

### 10. Customer Portal (`/api/customer/me`)
- `GET /api/customer/me/subscriptions` (Customer only) - Returns only authenticated customer's subscriptions.
- `GET /api/customer/me/invoices` (Customer only) - Returns only authenticated customer's invoices.

### 11. Dashboard (`/api/dashboard`)
- `GET /api/dashboard/summary` (Admin/Staff) - Real DB aggregates: MRR, total invoiced, payments received, total outstanding, overdue count/amount, active subscriptions.

