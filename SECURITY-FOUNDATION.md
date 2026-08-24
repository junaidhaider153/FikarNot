# FikarNot Module 25 — Secure Backend Foundation

Module 25 introduces a server-backed authentication boundary without adding third-party backend dependencies.

## Architecture

- React/Vite remains the storefront UI.
- `server/index.js` exposes the initial authentication API.
- SQLite stores users and sessions locally on the server.
- Passwords are hashed with Node's `scrypt` implementation.
- Sessions are opaque random tokens stored server-side and presented to the browser only through an HttpOnly cookie.
- The browser no longer stores the authenticated password or the authoritative session role.

## Development

Use:

```bash
npm run dev
```

This starts both Vite and the API server. The frontend proxies `/api/*` to `http://localhost:8787`.

You can also run them separately:

```bash
npm run dev:server
npm run dev:frontend
```

## API endpoints in this module

- `GET /api/health`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/delete-account`

## Important boundary

Business data (products, orders, inventory, reviews, coupons, returns, support tickets, etc.) is still browser/localStorage backed in this module. Those operations are intentionally left for the next backend migration modules. Do not treat this version as production-ready yet.

## Environment

Copy `.env.example` to `.env` when you need to override the API port or frontend origin. Do not commit `.env`.
