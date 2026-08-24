# FikarNot Module 27 QA

## Scope

Backend source of truth for catalogue, categories, and admin inventory adjustments using Node.js + SQLite.

## Pre-release static checks

- [x] 0 broken relative imports
- [x] Plain `.js` syntax checks passed
- [x] API smoke test: `/api/health`
- [x] API smoke test: `/api/catalog`
- [x] Admin login smoke test
- [x] Product update API smoke test
- [x] Inventory adjustment API smoke test
- [x] Fresh SQLite database creation verified

## Manual checks for local testing

- [ ] `npm install`
- [ ] `npm run dev`
- [ ] Open `/products` as a guest
- [ ] Open a product detail page
- [ ] Login as `junaid@fikarnot.shop`
- [ ] Confirm first admin startup migrates existing local catalogue once
- [ ] Admin product create/edit persists after browser refresh
- [ ] Admin category create/edit persists after browser refresh
- [ ] Admin inventory adjustment persists after browser refresh
- [ ] Duplicate SKU is rejected
- [ ] Category deletion is blocked when products still use it
- [ ] Customer cannot access staff catalogue mutation endpoints
- [ ] Existing cart/wishlist/account/checkout flows still work
- [ ] `/product/does-not-exist` still shows Product Not Found

## Known incremental boundary

Orders are still browser-backed. Module 27 migrates the catalogue/categories/inventory administration first; transactional order + inventory mutation migration is the next backend phase.
