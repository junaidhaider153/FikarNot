# FikarNot Module 26 QA Checklist

- [ ] Forgot password link is visible on sign-in.
- [ ] Unknown email returns a generic recovery message.
- [ ] Existing email creates a time-limited reset token.
- [ ] Development reset link opens `/reset-password?token=...`.
- [ ] Invalid/expired/used token cannot reset password.
- [ ] New password requires at least 8 characters.
- [ ] Password confirmation must match.
- [ ] Successful reset creates a new authenticated session.
- [ ] Previous sessions are invalidated after reset.
- [ ] User can log out and sign in with the new password.
- [ ] Old password no longer works.
- [ ] Login, registration, account, delete-account, and admin routes still work.
- [ ] `/product/p1`, `/product/p6`, and `/product/does-not-exist` still work.
- [ ] Cart, checkout, wishlist, notifications, admin inventory/orders/reviews/coupons/support/returns/analytics still work.
