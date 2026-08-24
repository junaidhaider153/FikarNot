## Module 19 — SEO, Accessibility & Performance

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

Before replacing an existing working project, back up `server/data/fikarnot.sqlite`.
