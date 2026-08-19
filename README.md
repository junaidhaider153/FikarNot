# FikarNot Modular React E-commerce

A modular React/Vite e-commerce demo built from the original single-file FikarNot project.

## Requirements

- Node.js 24 LTS or another currently supported Node.js LTS
- VS Code

## Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Demo accounts

- Admin: `admin@fikarnot.shop` / `admin123`
- Editor: `editor@fikarnot.shop` / `editor123`
- Customer: `maya@fikarnot.shop` / `maya123`

## Current architecture

```text
src/
├── api/          data access / mock API
├── assets/       image and asset definitions
├── components/   reusable UI
├── config/       application constants and storage keys
├── data/         seed/demo data
├── hooks/        reusable React hooks
├── pages/        route-level screens
├── router/       routing and protected routes
├── store/        application state and actions
├── utils/        storage, formatting, IDs, shared helpers
├── App.jsx       application bootstrap
├── main.jsx      React entry point
└── styles.css    global styling
```

## Module 1 completed

Foundation and architecture cleanup includes:

- centralized role constants and storage keys
- idempotent bootstrap to avoid duplicate initialization under React StrictMode
- dedicated application layout shell
- route-level Not Found and permission-denied pages
- scroll-to-top navigation behavior
- application-level React error boundary
- reduced-motion accessibility support
- consistent page spacing utility

The project uses BrowserRouter for clean URLs such as `/products` and `/product/p1`. For static production hosting, configure the host to rewrite unknown routes to `index.html` so browser refreshes and direct links continue to work.


## Routing cleanup (Module 1.2)

- HashRouter replaced with BrowserRouter for clean URLs
- Direct product URLs now work, including `/product/does-not-exist`
- Browser refreshes preserve the current route when the host is configured for SPA fallback
- Demo reset now returns to the site root without hash navigation
## Module 2 — Homepage

The homepage now includes a stronger content hierarchy with dynamic catalogue stats, improved section labels, a FikarNot principles section, popular products, a newsletter signup demo, and responsive styling.

The newsletter form is intentionally demo-only and does not send or persist email data.


## Module 3 — Product Catalogue
- Search relevance is centralized in `src/utils/search.js`.
- Catalogue filters are URL-aware: search, category, sort, maximum price, rating, and stock.
- Added `ProductFilters` component and improved responsive catalogue layout.
- Search/filter changes use replace-state behavior so browsing does not create a long browser-history trail.

## Module 4 — Product Details & Images

- Product detail page now supports multiple product images with thumbnails.
- Clicking the main image opens a larger lightbox preview.
- Product actions now include Add to Cart and Buy Now.
- Added product information and shopping-confidence sections.
- Admin product editor now supports uploading images from the device/gallery.
- Uploaded images are resized client-side before being stored in the browser demo.
- Admin can also add image URLs, reorder images, make an image primary, and remove images.
- Existing URL-based images continue to work.
- Product data remains local/demo-only; uploaded files are stored as browser data rather than uploaded to a server.
- Product detail supports old products that only have a single `image` field.
