# FikarNot

FikarNot is a full-stack e-commerce web app: a React storefront and admin dashboard backed by a
single Node.js API with an embedded SQLite database. It covers the full commerce loop — catalog,
cart, checkout, coupons, orders, returns, reviews, wishlists, notifications — plus staff-facing
inventory, order management, and analytics.

## Tech stack

- **Frontend:** React 19, React Router, Vite, hand-authored CSS (no framework)
- **Backend:** Node.js (`node:http`, no framework), `node:sqlite` (built-in, no external DB service)
- **Email:** Gmail REST API over HTTPS (not SMTP) — works on hosts that restrict outbound SMTP ports
- **Payments:** PayFast (optional, disabled by default) plus manual bank/wallet transfer
- **Tests:** Node's built-in test runner (`node --test`), real integration tests against a live server

## Project structure

```
src/                     React frontend
  api/                   Thin fetch wrappers per domain (auth, catalog, orders, ...)
  components/            Shared UI (layout, product cards, icons, admin widgets)
  pages/                 One file per route (Home, ProductDetail, Checkout, Admin, ...)
  router/                Route definitions and auth guards
  store/                 Lightweight global state (no Redux/Context ceremony)
  styles/                CSS split by feature area, assembled via styles/index.css
  utils/                 Cart math, coupon logic, search relevance, etc.

server/                  Node.js API
  index.js               HTTP server and route handlers
  config/                Environment config and filesystem paths
  db/                    SQLite connection and schema/migrations
  lib/                   Cross-cutting helpers: http/CORS/CSRF, auth security, validation, email
  data/                  Runtime SQLite file + uploaded images (gitignored, created automatically)

tests/                   Integration tests (spin up a real server instance per file)
scripts/                 Deployment, backup, sitemap, and one-off ops scripts
deploy/                  Docker/production deployment assets
```

## Getting started

Requires Node.js 22+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env      # then fill in what you need — see below
npm run dev                # runs the Vite dev server and the API together
```

The frontend runs at `http://localhost:5173`, the API at `http://localhost:8787` by default.
On first boot in development, demo catalog/user data is seeded automatically
(`FIKARNOT_SEED_DEMO_DATA=1`); set it to `0` for a clean database.

### Running frontend and backend separately

```bash
npm run dev:frontend   # Vite only
npm run dev:server     # API only
```

## Environment variables

See `.env.example` for the full, commented list. The essentials for local development:

| Variable | Purpose |
|---|---|
| `FIKARNOT_API_PORT` | Port the API listens on (also honors `PORT`, for hosts like Railway that inject it) |
| `FIKARNOT_FRONTEND_ORIGIN` | Comma-separated allowed CORS origins |
| `FIKARNOT_APP_URL` | Public frontend URL, used in emailed links |
| `FIKARNOT_SEED_DEMO_DATA` | `1` to seed demo catalog/users, `0` for a clean DB |
| `FIKARNOT_EXPOSE_RESET_LINKS` | `1` to return password-reset/verification links directly in API responses (dev only — always ignored in production) |

Everything needed for production (email, payments, backups, security hardening) is documented
inline in `.env.example` and enforced at boot by `scripts/check-production-config.mjs`.

### Transactional email

Email (welcome, verification, password reset, order/return updates) is sent via the **Gmail REST
API over HTTPS**, not SMTP, so it isn't affected by hosts that block outbound SMTP ports. One-time
setup:

1. In Google Cloud Console, enable the **Gmail API** on a project.
2. Configure the OAuth consent screen and, if in Testing mode, add the sending Gmail account as a
   Test User.
3. Create an OAuth 2.0 Client ID (type: **Desktop app**) and copy the client ID/secret.
4. Run `node scripts/get-gmail-refresh-token.mjs` and follow the printed instructions to authorize
   the sending account once — it prints a refresh token.
5. Set `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, and
   `GMAIL_SENDER_EMAIL`.

Without these four variables, the API logs email content instead of sending it (non-production
only) — real delivery is required in production.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Frontend + API together, for local development |
| `npm run build` | Production frontend build (also generates the sitemap and prerenders SEO pages) |
| `npm test` | Run the integration test suite |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, write mode |
| `npm run verify` | lint + test + build + production-config check + release audit — run before deploying |
| `npm run check:production` | Validate required production env vars are set |
| `npm run db:backup` / `npm run db:restore` | Manual SQLite backup/restore |
| `npm run db:backup:schedule` | Recurring backup process |
| `npm run ops:healthcheck` | Hit the API's health endpoint |

## Testing

```bash
npm test
```

Each test file boots a real instance of the API against an isolated temporary SQLite database, then
exercises it over real HTTP requests — these are integration tests, not mocks. Test files run
sequentially (`--test-concurrency=1`) since each one uses its own live server on its own port.

## Deployment

See `DEPLOYMENT.md` for full details. In short: this is a single Node process (no separate database
service to provision) that can run on Railway, a VPS, or any host that runs a long-lived Node
process and gives it a persistent volume for `server/data/`. `deploy/.env.production.example` lists
every production environment variable; `npm run check:production` fails startup loudly if a required
one is missing.

## License

MIT — see [LICENSE](./LICENSE).
