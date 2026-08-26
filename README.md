# FikarNot — Production-Hardened 1.6.5

## Module 1.6.6

- Fixed ESLint Node-global errors for `.mjs` utility scripts.
- Fixed `no-empty` lint errors in intentional best-effort cleanup/legacy parsing catches.
- Kept the full 40-test regression suite and production SEO safeguards intact.

## Module 19 — SEO, Accessibility & Performance
## Module 34.1 Patch (1.6.1)

This patch removes the unused SEO helper, keeps the production catalogue pagination, live sitemap, staff cancellation inventory restoration, and product SEO prerender changes included in Module 34. It is the recommended baseline after local `npm run verify` regression fixes.


- Added site-level Organization/WebSite structured data and product-level Product/Breadcrumb JSON-LD.
- Added route-aware canonical URLs and Open Graph URL/type metadata.
- Added 404 and recently-viewed noindex handling.
- Added a keyboard-accessible skip-to-content link.
- Added reduced-motion support for accessibility.
- Added font preconnect to reduce first-render latency.

# FikarNot — Modular React E-commerce Demo

## Module 9 — Account Deletion & Lifecycle

This version builds directly on the latest verified Module 8 project.

### Module 9 improvements

- Added a customer self-service account deletion flow under Account → Security.
- Requires the current password plus typing `DELETE` to confirm.
- Prevents admin/editor self-deletion from the customer account area.
- Clears the active customer session, cart, and wishlist after deletion.
- Removes the customer account while preserving existing orders with anonymized customer details.
- Added a permanent-danger-zone section and confirmation modal.

## Module 8 — Wishlist & Saved Products

This version builds directly on the latest verified Module 7 project.

### Module 8 improvements

- Added persistent wishlist state with localStorage support.
- Added wishlist toggle on product cards and product detail pages.
- Added dedicated `/wishlist` page with clear-wishlist action.
- Added wishlist section inside the customer account area.
- Added wishlist count and navigation in the desktop/mobile header and footer.
- Added wishlist cleanup when an admin deletes a product.
- Added heart icon and responsive wishlist styling.

### Module 7 improvements

- Reworked checkout into a clearer two-step flow.
- Added contact and shipping validation with field-level feedback.
- Added Card (mock) and Cash on Delivery payment options.
- Improved payment-field formatting and validation.
- Added a detailed order summary with product thumbnails.
- Added free-shipping messaging on checkout.
- Added checkout security/status hints for the demo environment.
- Added a polished order-confirmation screen with item count, total, payment method, and delivery address.
- Prevented duplicate submissions while an order is being placed.
- Added a final stock cap inside the order-creation action.
- Fixed the loading logo in the router boot state to use FikarNot branding.

### Important demo limitation

Payment is still simulated. No real card details are sent to a payment provider or server. Local uploads, products, users, carts, and orders remain browser/localStorage-based for this personal project.

## Run

```bash
npm install
npm run dev
```

## Pre-release verification performed

- Relative import scan: passed (87 local import references checked, 0 missing).
- Checkout route reference check: passed.
- Product-detail route regression reference: passed.
- FikarNot branding scan: no selected legacy Kiosk branding remained in source/README/index.
- Store order-creation logic reviewed for stock-safe quantities.
- Full `npm install` / Vite production build could not be completed in the packaging environment because dependency installation timed out.

## Module 7

Added protected customer accounts with profile management, order history, saved addresses, and password change flows.

## Module 8

Added persistent wishlist functionality across product cards, product details, customer account, and a dedicated wishlist page.

## Module 14

Inventory management now includes SKUs, configurable low-stock thresholds, quick stock adjustments, inventory KPIs, and a recent inventory activity log.

## Module 15 — Coupons & Promotions

- Added customer-facing promo code support at checkout.
- Added percentage, fixed-amount, and free-shipping coupons.
- Added minimum-subtotal, expiry, active/inactive, and usage-limit validation.
- Added coupon snapshots to orders so historical discounts remain accurate.
- Added admin Studio → Coupons management with create, edit, pause/activate, and delete actions.
- Added current-offer cards to the homepage with copy-code behavior.

## Module 15 — Coupons & Promotions

This module was built from the user-provided `FikarNot_Module14_fixed.zip` and keeps the latest fixes as the source of truth.

### Improvements

- Added percentage, fixed-amount, and free-shipping promo codes.
- Added minimum subtotal, expiry, active/inactive, and usage-limit validation.
- Added checkout coupon entry, discount display, free-shipping promotion messaging, and removal.
- Saved coupon snapshots on orders so historical totals remain accurate.
- Added Studio → Coupons for create, edit, pause/activate, and delete actions.
- Added current-offer cards to the homepage with copy-code support.
- Added coupon/discount details to customer order history and order confirmation.

### Verification

- 113 relative imports checked: 0 missing.
- 41 JS/JSX files parsed successfully with TypeScript's JSX parser.
- Coupon calculation cases checked for percent, fixed amount, free shipping, minimum subtotal, and expiry/usage state.
- Full npm/Vite build was not completed in the packaging environment because dependency installation timed out; run `npm install` and `npm run build` locally for final verification.

## Module 16 — Recently Viewed & Recommendations

- Added centralized recently viewed history with localStorage persistence.
- Added `/recently-viewed` with clear-history action and empty state.
- Added Recently Viewed access to desktop/mobile navigation, footer, and homepage.
- Product details now record views through the central store instead of local component storage.
- Added "You may also like" recommendations using category, tags, rating, featured state, and price similarity.
- Removed recently viewed references when a product is deleted.
- Added clock icon and dedicated browsing-history UI.

## Module 17 — Notifications

FikarNot now includes account-level in-app notifications for welcome and order events, with read/unread state, mark-all-read, clear-all, a notification center, and a header unread badge.

## Module 18 — Support Center & Store Information

Help Center with FAQ, customer support requests, account-specific support history, admin support inbox, and About/Shipping/Returns/Privacy/Terms pages.

## Module 21 — Analytics & Reporting

Admin Studio now includes an Analytics workspace with date-range reporting, KPI cards, sales trend, order status distribution, top products, top customers, coupon performance, stock-risk signals, and CSV export.

Additional audit fix: Returns is now visible in the Admin Studio navigation, matching the existing `/admin/returns` route.

## Module 22 — Product Comparison

FikarNot now supports comparing up to three products side by side. Customers can add/remove comparison items from product cards, open `/compare`, inspect price, rating, availability, SKU, tags and description, clear the comparison, and jump back to a product. The comparison list is stored locally and automatically cleaned when a product is deleted.

## Module 24 — Final Hardening & UX Polish

This release adds accessible confirmation modals for important customer-side destructive actions, plus a lightweight back-to-top control. It is intended as the final interaction-hardening pass before the project is considered portfolio-ready.

## Module 24 — Final Hardening & UX Polish

Final interaction pass for the personal FikarNot project. Adds accessible confirmation dialogs for destructive shopper actions, a lightweight back-to-top control, and a final manual QA checklist.

## Module 25 — Secure Backend Foundation

The project now starts a local authentication API alongside Vite with `npm run dev`. Authentication uses server-side SQLite, scrypt password hashing, opaque HttpOnly session cookies, server-side role data, password-change and account-deletion endpoints, and a small login-attempt rate limiter. The browser no longer persists authentication passwords.

See `SECURITY-FOUNDATION.md` for the API boundary and the remaining migration work.

## Module 26 — Account recovery

This version adds secure password-reset token storage and the `/forgot-password` and `/reset-password` flows. In local development, the API may expose a development reset link to make testing possible without an email provider. In production, connect the reset token to a transactional email service and keep reset links out of API responses.

## Module 27 — Backend Catalogue & Inventory Foundation

This release moves the product catalogue, categories, and admin inventory adjustments onto the Node.js/SQLite backend introduced in Module 25.

- Public product/category reads use `/api/catalog`.
- Admin/editor product and category changes use server-side endpoints.
- Inventory adjustments are persisted in SQLite with an activity log.
- On first authenticated staff startup, existing browser catalogue data is migrated to the backend once.
- LocalStorage remains as a browser cache during this incremental migration. Orders and their transaction-safe inventory mutations remain the next backend migration stage.

## Module 30 — Security & Reliability Hardening

This pass focused on closing gaps found in a full audit of the Module 27–29 backend: image storage, CSRF, review moderation, pagination, CSP, rate limiting, password strength, and automated test coverage.

- **Image storage**: product images are now decoded server-side and stored as files under `server/data/uploads/`, served via `/uploads/:file`, instead of being embedded as base64 inside the products table. Uploads go through a dedicated staff-only endpoint (`POST /api/uploads/image`) with its own size limit.
- **CSRF protection**: added a double-submit cookie (`fn_csrf`). Every state-changing request must echo the cookie's value back as an `X-CSRF-Token` header. All frontend API modules were consolidated from seven duplicated `fetch` wrappers into one shared `src/api/apiClient.js` that handles this automatically.
- **Review moderation**: added `POST /api/reviews/:id/status` (staff-only) to hide/restore a review without deleting it — the `hidden` status already existed in the schema but had no way to be set. Hiding a review correctly recalculates the product's visible average rating.
- **Pagination**: `GET /api/orders`, `/api/users`, `/api/catalog`, and `/api/engagement` now accept `?limit=&offset=` and return a `total` count, with sane defaults and hard ceilings so a growing table can't turn into an unbounded query. Note: the storefront still filters/searches the full product and review lists client-side, so those two endpoints default to a high limit rather than a small page — a true paginated UI is a larger follow-up.
- **Content-Security-Policy**: added via `<meta>` in `index.html` (the Node API server is API-only and never serves this file, so a response header there would have no effect).
- **Rate limiting**: login and password-reset throttling moved from an in-memory `Map` to a `rate_limits` table in SQLite, so limits survive a server restart/redeploy and would work correctly if this app is ever run as more than one process sharing the same database. Also added rate limits that didn't exist before on **registration** (max 6 per 15 min per IP, prevents mass fake-account creation) and **guest order creation** (max 20 per 10 min per IP, prevents bot-driven stock exhaustion or order-table flooding) — previously only login and password-reset were throttled at all.
- **Password strength**: new passwords (registration, change-password, reset-password) are checked against the Have I Been Pwned breach corpus via the k-anonymity range API. The check fails open (allows the password) on any network error or timeout, and can be disabled entirely with `FIKARNOT_DISABLE_BREACH_CHECK=1`.
- **Production account seeding**: if the `users` table is empty on boot in production, the server now generates one random admin password and prints it once to the log, instead of creating the well-known `junaid@fikarnot.shop / admin123` demo account. Set `FIKARNOT_SEED_DEMO_USERS=1` to opt back into the demo accounts if you really want them.
- **Password reset link exposure**: now requires the explicit `FIKARNOT_EXPOSE_RESET_LINKS=1` flag in addition to `NODE_ENV !== production`, so a misconfigured deploy can't leak live reset tokens by accident.
- **Tests**: added `npm test` (Node's built-in test runner, no new dependency) covering checkout stock decrement/insufficient-stock rejection/cancellation restock, coupon validation (percent/fixed/free-shipping/expired/inactive/min-subtotal/usage-limit/duplicate-code), and auth security (CSRF enforcement, password strength, registration/login/order rate limiting, admin-only route protection) — 27 tests total. Each test file boots a real server instance against an isolated temp SQLite database — nothing touches your dev data.
- **Alt-text audit**: checked, already correct — product images use `alt={productName}`, and gallery thumbnail buttons correctly use `alt=""` on the `<img>` since the parent `<button>` already carries a descriptive `aria-label`. No change needed.

### Running tests

```bash
npm test
```

### Known limitations carried forward

- Per-route SEO metadata (title/description/OG/canonical, `noindex` on private routes) is already implemented for every page via `useDocumentMeta`. The one remaining gap is that this is set client-side after render, so a bot or social-media link-preview scraper that doesn't execute JavaScript will only ever see the static tags in `index.html`. Fixing that properly requires prerendering or SSR, which is a larger project than fits in this pass.
- `node:sqlite` is still an experimental Node API. `package.json` now pins `"engines": { "node": ">=22.5.0" }` so incompatible hosts fail fast at install time instead of crashing at runtime.




## Module 32 updates
- Customer email verification with one-time 24-hour tokens.
- Resend verification flow with local development link fallback.
- Login is blocked until a newly registered customer's email is verified.
- Admin-created users are considered verified because an admin explicitly created the account.
- Store CMS settings now include About content, WhatsApp, social URLs, and SEO metadata.


## Module 32 — Email verification & CMS expansion
- New customer accounts require email verification before login.
- Verification links are one-time tokens valid for 24 hours; development uses a local link fallback when no email provider is configured.
- Existing accounts are migrated once and marked verified so upgrades do not lock them out.
- Admin Settings now controls About content, WhatsApp, social URLs, and SEO metadata in addition to homepage hero settings.


## Module 34 hardening / production-readiness pass

This pass closes the main remaining engineering gaps identified in the audit:

- **Server-side catalogue search/filter/sort/pagination**: the storefront now asks SQLite for only the requested page instead of filtering the full catalogue in the browser. The legacy unfiltered `/api/catalog` response remains available for bootstrap/admin compatibility.
- **Live sitemap**: `GET /sitemap.xml` is generated from the current database catalogue. `SITEMAP_API_URL` can also be used during frontend builds so `npm run build` can write a static sitemap from the live API. Development falls back to seed data when the API is not available.
- **Product SEO prerendering**: the postbuild step creates `dist/product/<id>/index.html` files with product-specific titles, descriptions, canonicals, Open Graph metadata and JSON-LD. This reduces dependence on JavaScript execution for search/social crawlers while keeping the React app as the interactive client.
- **Proxy-aware rate limiting**: `X-Forwarded-For` is trusted only when `FIKARNOT_TRUST_PROXY=1`. Keep it off unless a controlled reverse proxy sanitizes that header.
- **Mock payment safety**: card checkout is explicitly demo-only outside production. Production API requests using `card` are rejected until a real provider is integrated; Cash on Delivery remains available.
- **Upload URL configuration**: `FIKARNOT_UPLOADS_PUBLIC_BASE_URL` can prepend a public asset host/reverse-proxy URL to upload responses.
- **Password policy consistency**: new registration/reset/admin-created passwords require at least 12 characters throughout the UI and API.
- **Regression coverage**: the automated suite now covers catalogue filtering/pagination and the live sitemap in addition to the existing security, coupon, email/CMS and order-inventory tests.

### Production deployment notes

Before a real launch, connect a payment provider, put uploads behind object storage/CDN, run the Node API behind a trusted reverse proxy, set `FIKARNOT_TRUST_PROXY=1` only in that controlled topology, and configure the frontend host to route `/sitemap.xml` to the live API or publish the sitemap generated with `SITEMAP_API_URL`.

The current project is deliberately fail-safe about card payments: a production build does not pretend that a mock card form is a real payment gateway.


## Module 34.2 QA stability patch
- Test suites run sequentially with Node test concurrency set to 1 to prevent isolated server instances from competing for shared test ports/resources on local machines.
- `npm test` now uses `node --test --test-concurrency=1 tests/*.test.js`.
- This patch preserves the production-hardening work from Module 34.1.

## Module 34.3 reconciliation patch
- Reconciles the Windows `_3` project with the hardened Module 34.1 server implementation.
- Restores staff cancellation inventory transactions, server-side catalogue filtering/pagination, and the live `/sitemap.xml` endpoint.
- Restores the 12-character password policy and upload magic-byte validation.
- Preserves the project's sequential test runner and existing lint-oriented edits.

## Production hardening utilities

- `npm run db:backup` creates a SQLite backup using `VACUUM INTO`.
- `npm run check:production` validates required production environment settings.
- `npm run verify` now includes the production configuration check after lint/tests/build.
- Test servers automatically request a free localhost port, avoiding conflicts with a running development server.
- See `DEPLOYMENT.md` for persistent-data, reverse-proxy, health-check, and environment guidance.

## Production startup guard

When `NODE_ENV=production`, the API refuses to start if required HTTPS origins/email settings are missing or if demo seeding, mock payments, or development reset links are enabled. Use `npm run check:production` before deployment as a fast preflight check.


## Verification
Module 36.1.5 includes 40 automated tests covering security, orders, catalogue pagination, live sitemap generation, media storage and SEO build fail-safe behavior. See `AUDIT_MODULE35_MODULE36.md` and `DEPLOYMENT_VERCEL.md`.
