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
