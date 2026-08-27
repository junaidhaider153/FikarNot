# FikarNot Module 37 — Backend Security & Data Integrity

This module continues from the latest verified FikarNot Module 36 baseline.

## What changed

- Added server-side audit logging for sensitive admin/staff mutations.
- Added an admin-only `/api/audit-logs` endpoint with pagination.
- Revoked target-user sessions after staff role/password/email changes where appropriate.
- Added stricter server-side product validation for name, category, price, stock, and stock threshold.
- Coupon creation/update no longer trusts a client-provided `usedCount` value; usage is retained from the database.
- Coupon usage-limit updates are performed inside order creation using a conditional update to prevent exceeding the configured maximum.
- Added a timeout to transactional email provider requests.
- Production 500 responses no longer expose internal exception messages.
- Sensitive order, return, media, coupon, product, inventory, user, and settings actions now leave an audit trail where applicable.
- Package version is 1.6.5.

## Verification

`npm test` passes all 39 tests sequentially in the prepared environment.

For the full local verification pipeline, run:

```powershell
npm ci
npm run verify
```

The verify script runs lint, all tests, the Vite production build, and production configuration checks.
