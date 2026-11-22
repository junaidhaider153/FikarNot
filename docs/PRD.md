# FikarNot — Product Requirements Document (PRD)

> **Errata (November 2026 review).** This document predates the review in `docs/REVIEW_AND_STATUS.md`. Where it conflicts, the review, `AGENTS.md` and `ROADMAP.md` win. Known corrections: (1) commerce email uses the **Gmail REST API over HTTPS**, not SMTP — Edge Functions cannot use ports 25/587; Supabase Auth keeps Gmail SMTP on port 465; (2) **12** tables lacked RLS, now fixed by migration 0004; (3) guests may check out with **Cash on Delivery only**; (4) refunds and order deletion are **admin-only**; (5) the CORS env var is `ALLOWED_ORIGINS` (legacy `FIKARNOT_FRONTEND_ORIGIN` still accepted); (6) zod validation and TanStack Query are **planned, not present**.

**Document Version:** 2.0  
**Project:** FikarNot E-Commerce Platform  
**Status:** Active Migration Stabilization & Production Hardening  
**Stack Baseline:** React 19, Vite 8, React Router 7, Supabase (Postgres, Auth, Storage, Deno 2 Edge Functions), Vercel, Gmail 2FA SMTP, Google Gemini AI

---

## 1. Executive Summary

FikarNot is a full-stack e-commerce storefront and staff operations platform designed for reliable direct-to-consumer (DTC) commerce in Pakistan (default currency: `PKR`) with support for Cash on Delivery (COD), manual bank/wallet transfer with verifiable payment proofs, and future online payment gateway integration (PayFast).

The platform has completed its core migration from a legacy Node.js/SQLite/Railway monolith to a modern serverless architecture on **Vercel + Supabase**. This PRD defines the complete product scope, user personas, functional requirements, feature triage rules, and launch criteria required to take FikarNot from its current mid-migration state to a hardened, production-grade release.

---

## 2. Product Objectives & Success Criteria

### Primary Objectives

1. **Zero-Vulnerability Production Cutover:** Eliminate exposed database tables (RLS enforcement across all 21 Postgres tables), remove legacy Railway/SQLite dependencies, and secure all customer and payment artifacts.
2. **End-to-End Transactional Reliability:** Deliver dependable auth flows (email verification, password reset, TOTP 2FA) and order lifecycle notifications powered by **Gmail with 2FA (Google App Password over SMTP)** across both Supabase Auth and Edge Functions.
3. **Frictionless Storefront UX:** Remove all dead buttons and `501 Not Ported` error paths by either completing or cleanly feature-flagging unported capabilities (Invoicing, AI Chat, Hero Video Upload, PayFast).
4. **Operational Efficiency for Staff:** Equip Admins and Editors with fast inventory management, coupon control, manual payment proof verification, return/refund handling, review moderation, support ticket resolution, and Recharts-powered revenue analytics.

### Key Performance Indicators (KPIs)

| Metric                             | Target                          | Measurement Method                                                           |
| ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Checkout Completion Rate           | >= 65% of initiated checkouts   | Order creation events vs. checkout page visits                               |
| Payment Proof Verification SLA     | < 12 hours median review time   | Timestamp delta between `payment_proofs.created_at` and payment confirmation |
| Transactional Email Delivery Rate  | >= 98% successful SMTP handoffs | Edge Function & Supabase Auth SMTP logs                                      |
| Storefront Core Web Vitals (LCP)   | < 2.0s on 4G mobile             | Vercel Speed Insights / Lighthouse CI                                        |
| Security Audit Score               | 0 Critical / 0 High findings    | Supabase Security Advisor + automated RLS tests                              |
| Unhandled `501` / `500` Error Rate | 0% on user-visible flows        | Frontend error boundary & Edge Function logs                                 |

---

## 3. User Personas & Roles

FikarNot enforces three hierarchical roles stored in `public.profiles.role`:

| Role                        | Primary Goals                                                                  | Key Capabilities                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest (Unauthenticated)** | Browse catalog, compare items, inspect specs, get help                         | View categories/products, search & filter, view published reviews, view store info & help center, submit guest support tickets, manage local cart/wishlist/compare before sign-in                                                                                                                                 |
| **Customer (`customer`)**   | Purchase securely, upload transfer proofs, track orders, request returns       | Account profile & saved addresses, synced cart/wishlist/recently viewed/compare (`customer_state`), checkout with coupon validation, upload manual payment proof, download/print invoice, cancel eligible orders, submit verified-purchase reviews, open support tickets & return requests, receive notifications |
| **Editor (`editor`)**       | Manage merchandising, catalog, and day-to-day customer operations              | Manage products, categories, stock adjustments (`inventory_logs`), media library, coupons, order fulfillment/tracking, payment proof review, review moderation, support tickets, return requests, and analytics dashboard                                                                                         |
| **Admin (`admin`)**         | Full platform governance, user/role management, financial & security oversight | All Editor permissions plus: create/delete users, promote/demote roles, issue refunds (`refunds`), configure global `site_settings`, inspect `audit_logs`, enroll & enforce TOTP 2FA                                                                                                                              |

---

## 4. Functional Requirements

### 4.1 Storefront & Merchandising

- **Catalog & Search:** Browse products by category, keyword search, price range, availability, and featured status; rich Product Detail Pages with multi-image galleries, stock indicators, and verified buyer reviews.
- **Customer Engagement Tools:** Persistent Wishlist, Recently Viewed history, and side-by-side Product Comparison synced to `customer_state` for logged-in users.
- **SEO & Discoverability:** Dynamic `<title>` and Open Graph metadata (`useDocumentMeta`), JSON-LD `StructuredData`, automated `sitemap.xml` generation, and post-build SEO prerendering.
- **Theme Support:** Light and Dark mode with persisted user preference.

### 4.2 Cart, Coupons & Checkout

- **Cart Management:** Real-time quantity controls, stock validation, and automatic subtotal/shipping/tax calculation in `PKR`.
- **Server-Side Coupon Engine:** Support `percent`, `fixed`, and `free_shipping` coupon types with minimum subtotal checks, usage limits (`max_uses` vs `used_count`), active flags, and expiration dates (`expires_at`), strictly validated on the server (`POST /coupons/validate`).
- **Payment Methods:**
  - **Cash on Delivery (COD):** Enabled for launch.
  - **Manual Bank / Wallet Transfer:** Generates order in pending payment state; customer uploads payment screenshot/receipt into the private `payment-proofs` bucket; staff reviews via 5-minute signed URL and confirms payment.
  - **PayFast Online Payments:** Gated behind `VITE_ENABLE_PAYFAST=false` until Edge Function checkout session + ITN webhook verification are ported.
- **Invoicing:** Customers and staff must be able to view and print/download a formatted order invoice directly from verified Supabase order data (replacing the legacy Railway `/api/orders/:id/invoice` URL).

### 4.3 Authentication, Accounts & Security

- **Auth Flows:** Email/password registration, mandatory email verification, login, forgot password, password reset, and self-service account deletion — all powered by **Supabase Auth** configured with **Gmail 2FA App Password Custom SMTP**.
- **Multi-Factor Authentication (TOTP 2FA):** Already implemented for staff inside `AdminPage` (`TwoFactorSection`) via `supabase.auth.mfa`; extend optional 2FA enrollment to `AccountPage` for customers in a follow-up phase.
- **Address Book:** Customers can create, edit, delete, and set a default shipping address (`customer_addresses`).

### 4.4 Post-Purchase, Support & Notifications

- **Order Tracking:** Status transitions (`paid`, `processing`, `shipped`, `delivered`, `cancelled`, `return_approved`, `returned`) with courier name, tracking number, and tracking URL.
- **Returns & Refunds:** Customers submit one return request per order (`return_requests`); staff approve/reject/complete returns and record manual or gateway refunds (`refunds`).
- **Verified-Buyer Reviews:** Only users who purchased a product may leave a review (`reviews`, unique per `product_id` + `user_id`); staff can hide/publish reviews.
- **Notifications & Email:** In-app notifications (`notifications` table) paired with **Gmail 2FA SMTP** transactional emails for:
  - Account verification & password reset (Supabase Auth Custom SMTP)
  - Order confirmation & invoice link
  - Manual payment proof received / approved / rejected
  - Order shipped (with courier + tracking link)
  - Return request & refund status updates
  - Support ticket confirmations & resolutions

### 4.5 Admin & Operations Dashboard

- **Modular Tabbed Workspace:** Products & Inventory, Categories, Orders & Payment Proofs, Coupons, Returns & Refunds, Reviews Moderation, Support Tickets, Users & Roles, Media Library, Site Settings, Audit Logs, and Recharts Analytics.
- **Media Management:** Image uploads validated by MIME type and binary magic bytes (`jpeg`, `png`, `webp`, `gif`) with SHA-256 deduplication.

---

## 5. Feature Triage & Launch Scope (v2.0 Release)

| Feature                                                                      | Current State              | Launch Decision                                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Core Catalog, Cart, Coupons, Orders, Manual Proof, Reviews, Returns, Tickets | Implemented on Supabase    | **Ship (Hardened with full RLS & tests)**                                                                         |
| Transactional & Auth Email                                                   | Legacy Node only           | **Ship via Gmail 2FA App Password SMTP**                                                                          |
| Order Invoices                                                               | Broken (points to Railway) | **Port in Phase 1 (Edge Function JSON + printable React/HTML invoice)**                                           |
| PayFast Online Checkout                                                      | `501` unported             | **Hide behind `VITE_ENABLE_PAYFAST=false` for v2.0; port in v2.1**                                                |
| AI Storefront Chat (`ChatWidget`)                                            | `501` unported             | **Hide behind `VITE_ENABLE_AI_CHAT=false` until Gemini Edge Function lands**                                      |
| Hero Video Upload                                                            | `501` unported             | **Use hosted video URLs / hide upload via `VITE_ENABLE_VIDEO_UPLOAD=false` until Storage video validation lands** |

---

## 6. Out of Scope for v2.0 Launch

- Multi-vendor marketplace onboarding or seller payouts.
- Native iOS/Android mobile apps (responsive PWA web experience is primary).
- Real-time automated courier API booking (manual courier + tracking URL entry is sufficient for v2.0).
- Multi-currency dynamic FX checkout (`PKR` remains the primary settlement currency).
