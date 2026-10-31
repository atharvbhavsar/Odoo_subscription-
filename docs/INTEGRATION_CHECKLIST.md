# Integration Checklist

- [x] One shared repository and one database schema
- [x] Versioned migrations & seed data
- [x] Login, logout, session restoration, and role authorization
- [x] Public registration creates Customer accounts only
- [x] Admin can manage products, variants, plans, taxes, and discounts
- [x] Staff can create and confirm quotations
- [x] Confirmed quotations create subscriptions without duplicates
- [x] Subscription lifecycle transitions enforced by backend
- [x] Manual billing invokes the same service as scheduled billing
- [x] Billing generates one invoice per eligible subscription period
- [x] Repeated/concurrent billing does not duplicate invoices (DB unique constraint)
- [x] Missed billing periods handled cleanly
- [x] Historical invoice lines and totals immutable to catalogue changes
- [x] Invoice PDF downloads are authorized
- [x] Partial payments update outstanding balance correctly
- [x] Razorpay payment verified server-side in Test Mode
- [x] Duplicate payment callbacks/webhooks rejected idempotently
- [x] Invoice marked Paid only when balance is settled
- [x] Customer portal restricts data to authenticated customer
- [x] Dashboard metrics match backend aggregates
- [x] Loading, empty, error, and success states provided across UI
- [x] Unit, integration, and E2E tests run and verified

