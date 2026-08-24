# FikarNot Module 25 QA

## Automated checks completed

- Relative imports: 154 checked, 0 missing.
- Node syntax: backend, auth API, store, and dev runner checked.
- Auth API smoke tests: health, login, session restore, invalid credentials, register, change password, delete account.
- ZIP integrity verified.
- `npm ci --ignore-scripts` attempted but timed out in the packaging environment; a full Vite build is therefore not claimed here.

## Manual checks required

1. `npm install`
2. `npm run dev`
3. Confirm both Vite and API start.
4. Customer login: `urwa@fikarnot.shop` / `maya123`.
5. Admin login: `junaid@fikarnot.shop` / `admin123`.
6. Register a new customer.
7. Refresh the browser while logged in; session should remain.
8. Logout; session should disappear.
9. Change password from Account → Security.
10. Delete a customer account.
11. Inspect browser localStorage: no password should be stored in the user/session record.
12. Verify `/api/health` returns `{ok:true}`.
13. Verify an unauthenticated browser cannot access `/api/auth/profile` or `/api/auth/change-password`.

## Current boundary

This module secures authentication and account lifecycle at the server boundary, but product/order/inventory/business data remains browser/localStorage backed. Those business operations must be migrated behind authenticated APIs before production deployment.
