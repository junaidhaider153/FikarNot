# FikarNot Final QA Checklist

Before considering the personal project complete, verify these flows manually in the local development server:

## Shopper flows

- Homepage, responsive layout, hero, WhatsApp button, back-to-top
- Product search, filters, sorting, comparison, recently viewed
- Product detail, gallery, hover slideshow, related products
- Wishlist and account-specific cart
- Checkout as signed-in customer and guest with email
- Coupon apply/remove and order confirmation
- Order history, timeline, cancellation and returns
- Reviews, review removal confirmation, notifications
- Help center and support ticket creation

## Account flows

- Register, login, logout, profile updates
- Customer-specific cart/wishlist restore after re-login
- Address management
- Password change
- Account deletion and anonymized order history

## Admin flows

- Dashboard, analytics, products, categories, inventory, orders
- Coupons, reviews, support, returns, users
- Permissions for customer/editor/admin roles

## Error/regression checks

- `/product/does-not-exist` shows a proper not-found page
- Refresh works on direct routes
- Destructive customer actions use confirmation dialogs
- No blank/white screen on product detail, admin edit, checkout, or account pages
- Mobile navigation and layouts remain usable
