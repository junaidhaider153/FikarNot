# FikarNot — Software Requirements Specification (SRS)

> **Errata (November 2026 review).** This document predates the review in `docs/REVIEW_AND_STATUS.md`. Where it conflicts, the review, `AGENTS.md` and `ROADMAP.md` win. Known corrections: (1) commerce email uses the **Gmail REST API over HTTPS**, not SMTP — Edge Functions cannot use ports 25/587; Supabase Auth keeps Gmail SMTP on port 465; (2) **12** tables lacked RLS, now fixed by migration 0004; (3) guests may check out with **Cash on Delivery only**; (4) refunds and order deletion are **admin-only**; (5) the CORS env var is `ALLOWED_ORIGINS` (legacy `FIKARNOT_FRONTEND_ORIGIN` still accepted); (6) zod validation and TanStack Query are **planned, not present**.

**Standard Alignment:** IEEE 830 / ISO/IEC/IEEE 29148  
**Document Version:** 2.0  
**System Name:** FikarNot Web Commerce Platform

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification defines the complete functional, interface, data, and quality requirements for FikarNot v2.0. It serves as the authoritative contract for development, automated testing, security verification, and release sign-off.

### 1.2 Scope

FikarNot is a browser-based e-commerce system composed of a React 19 Single Page Application hosted on Vercel, a serverless backend on Supabase (PostgreSQL, Auth, Storage, and Deno 2 Edge Functions), and transactional/authentication email delivery via **Gmail 2FA App Password SMTP**.

### 1.3 Definitions & Acronyms

- **RLS:** Row Level Security in PostgreSQL.
- **RBAC:** Role-Based Access Control (`customer`, `editor`, `admin`).
- **COD:** Cash on Delivery.
- **TOTP:** Time-based One-Time Password (Authenticator App MFA).
- **SMTP:** Simple Mail Transfer Protocol (`smtp.gmail.com`, authenticated via Gmail 2FA App Password).
- **JWT:** JSON Web Token issued by Supabase Auth.

---

## 2. Overall Description

### 2.1 System Context

- **Client Browser:** Modern evergreen browsers (Chrome, Firefox, Safari, Edge — desktop and mobile viewports).
- **Frontend Host:** Vercel Edge Network serving built static assets and SPA routes.
- **Backend Platform:** Supabase Cloud (PostgreSQL + GoTrue Auth + Storage + Deno 2 Edge Functions).
- **Mail Transport:** Google Gmail SMTP (`smtp.gmail.com:465` SSL/TLS or `587` STARTTLS) using a 2FA-enabled Google App Password.
- **Optional External Services:** Google Gemini API (AI chat, gated behind feature flag) and PayFast (online checkout, gated behind feature flag).

### 2.2 User Characteristics

- **Customers:** Shop via mobile or desktop browsers; require clear PKR pricing, trustworthy order/payment status feedback, and reliable email verification/password reset.
- **Staff (Editors & Admins):** Manage inventory, review manual bank transfer screenshots, process returns/refunds, and monitor analytics; require audit trails and TOTP 2FA protection.

### 2.3 Operating Constraints

- Frontend must contain zero database service-role keys, zero Gmail App Passwords, and zero direct PostgREST `supabase.from()` calls.
- Gmail consumer SMTP imposes a ~500 emails/day limit; transactional email logic must avoid redundant sends and log delivery outcomes.

---

## 3. Specific Functional Requirements

### 3.1 Authentication & Identity Management (`FR-AUTH`)

- **FR-AUTH-01:** Users shall register with name, email, and password (minimum 8 characters). Upon registration, a trigger (`handle_new_user`) shall automatically create a corresponding row in `public.profiles` with default role `customer`.
- **FR-AUTH-02:** Supabase Auth shall send an account verification email through **Gmail 2FA Custom SMTP** before allowing full account activation.
- **FR-AUTH-03:** Users shall request password resets (`ForgotPasswordPage`) and complete resets (`ResetPasswordPage`) via tokenized links delivered through **Gmail 2FA Custom SMTP**.
- **FR-AUTH-04:** Staff users (and optionally customers) shall enroll TOTP authenticators via `supabase.auth.mfa.enroll` and be challenged for a 6-digit TOTP code at login when a verified factor is present.
- **FR-AUTH-05:** Authenticated users shall be able to delete their own accounts (`POST /api/auth/delete-account`), cascading dependent account state cleanly.

### 3.2 Catalog & Inventory Management (`FR-CAT`)

- **FR-CAT-01:** The system shall list and filter products by category, search query, price range, tags, and featured flag via the `catalog` Edge Function.
- **FR-CAT-02:** Staff (`editor`, `admin`) shall create, update, and delete products and categories; SKUs shall be case-insensitively unique (`citext`).
- **FR-CAT-03:** Every stock adjustment shall record an immutable row in `inventory_logs` capturing `previous_stock`, `next_stock`, `change`, `reason`, and `user_id`.

### 3.3 Cart, Coupons & Checkout (`FR-ORD`)

- **FR-ORD-01:** Logged-in users' cart, wishlist, recently viewed, and comparison lists shall persist in `customer_state` (`jsonb`).
- **FR-ORD-02:** Coupon codes (`coupons.code`, `citext`) shall be validated server-side via `POST /coupons/validate` against `active`, `expires_at`, `min_subtotal`, and `used_count < max_uses`.
- **FR-ORD-03:** Checkout shall compute `subtotal`, `discount`, `shipping`, `tax`, and `total` server-side inside `orders` Edge Function—never trusting client-submitted totals—and decrement product stock atomically.
- **FR-ORD-04:** Upon successful order creation, the `orders` Edge Function shall create an in-app notification and dispatch an order confirmation email via **Gmail 2FA SMTP** (`_shared/email.ts`).
- **FR-ORD-05:** Authenticated order owners and staff shall retrieve verified invoice data via `GET /orders/:id/invoice` and render a printable invoice without calling any legacy Railway endpoint.

### 3.4 Manual Payment Proof & Verification (`FR-PAY`)

- **FR-PAY-01:** For manual bank/wallet transfer orders, only the owning customer (`caller.id === order.user_id`) shall upload a payment proof image via `POST /payment-proof/:orderId`.
- **FR-PAY-02:** The `storage` Edge Function shall validate MIME type, file size, binary magic bytes, and SHA-256 uniqueness before storing the file in the private `payment-proofs` bucket and recording metadata in `payment_proofs`.
- **FR-PAY-03:** Staff and the order owner shall view uploaded payment proofs exclusively via time-limited signed URLs (TTL = 300 seconds) issued by `GET /payment-proof/:orderId`.
- **FR-PAY-04:** Staff confirming payment via `POST /confirm-payment/:orderId` shall update `orders.payment_status`, record/update `payments`, write an `audit_logs` entry, and dispatch a payment confirmation email via **Gmail 2FA SMTP**.

### 3.5 Post-Purchase: Fulfillment, Returns, Reviews & Support (`FR-POST`)

- **FR-POST-01:** Staff shall update order statuses and shipping details (`courier`, `tracking_number`, `tracking_url`), triggering a shipment notification email via **Gmail 2FA SMTP**.
- **FR-POST-02:** Customers shall submit at most one return request per order (`unique (order_id, user_id)`). Admins shall process refunds into `refunds` linked to `return_requests` and `payments`.
- **FR-POST-03:** Customers shall submit product reviews only if they hold a verified purchase for that `product_id` (unique per `product_id, user_id`); staff shall toggle `published`/`hidden` moderation status.
- **FR-POST-04:** Users shall submit support tickets (`support_tickets`); staff shall transition tickets across `open`, `in_progress`, and `resolved`, with status updates emailed via **Gmail 2FA SMTP**.

### 3.6 Administration & Governance (`FR-ADM`)

- **FR-ADM-01:** Only `admin` users shall create users, modify user roles (`customer`/`editor`/`admin`), or delete users via the `account` Edge Function.
- **FR-ADM-02:** Privileged staff mutations (role changes, payment confirmations, refunds, site settings updates) shall write structured records to `audit_logs`.
- **FR-ADM-03:** Staff shall view revenue, order volume, status distributions, and low-stock metrics in the Analytics Dashboard.

---

## 4. External Interface Requirements

### 4.1 API Routing Contract (`src/api/apiClient.js`)

| Legacy Frontend Path Pattern                                                                                                             | Target Edge Function | Mapped Subpath                                                                             | Auth Level                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `/api/catalog/*`                                                                                                                         | `catalog`            | `/`, `/products/*`, `/categories/*`, `/inventory/adjust`                                   | Public GET / Staff mutations                                    |
| `/api/auth/me`, `/api/account/*`, `/api/users/*`                                                                                         | `account`            | `/`, `/profile`, `/state`, `/addresses/*`, `/users/*`                                      | Authenticated / Admin for `/users`                              |
| `/api/uploads/image`, `/api/media/*`, `/api/orders/:id/payment-proof`, `/api/admin/orders/:id/confirm-payment`                           | `storage`            | `/image`, `/media/*`, `/payment-proof/:id`, `/confirm-payment/:id`                         | Staff or Order Owner                                            |
| `/api/orders/*`, `/api/coupons/*`, `/api/commerce-settings`                                                                              | `orders`             | `/`, `/:id`, `/:id/invoice`, `/:id/cancel`, `/:id/status`, `/:id/fulfilment`, `/coupons/*` | Public validate / Auth / Staff                                  |
| `/api/reviews/*`, `/api/support/*`, `/api/returns/*`, `/api/notifications/*`, `/api/site-settings`, `/api/audit-logs`, `/api/engagement` | `admin`              | Mirrors subpath                                                                            | Mixed (Public GET settings/reviews, Auth customer, Staff admin) |

### 4.2 Feature-Flagged / Deferred Interfaces

Any unported feature (`/api/payments/payfast/session`, `/api/chat`, `/api/uploads/video`) MUST be hidden in the UI when its corresponding `VITE_ENABLE_*` environment flag is `false`.

---

## 5. Verification & Acceptance Criteria

1. **RLS Penetration Test:** Direct REST requests using `VITE_SUPABASE_ANON_KEY` against all 21 tables return zero rows on `SELECT` and `401`/`403` on `INSERT`/`UPDATE`/`DELETE`.
2. **Auth & Email Test:** New user signup, email verification, password reset, and order confirmation successfully deliver emails via **Gmail 2FA SMTP** (`smtp.gmail.com`).
3. **Zero Legacy Coupling Test:** No network request in browser DevTools targets `railway.app`, `/uploads/`, or a non-Supabase `/api/` path.
4. **RBAC Test:** A `customer` JWT receives `403 Forbidden` on every staff/admin endpoint and on other customers' orders and payment proofs.
5. **CI Verification:** Lint, production Vite build + SEO prerender, Vitest unit suite, and Edge Function integration suite all pass green in GitHub Actions.
