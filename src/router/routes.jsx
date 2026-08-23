import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import HomePage from "../pages/HomePage";
import ProductsPage from "../pages/ProductsPage";
import ProductDetailPage from "../pages/ProductDetailPage";
import CartPage from "../pages/CartPage";
import CheckoutPage from "../pages/CheckoutPage";
import LoginPage from "../pages/LoginPage";
import AccountPage from "../pages/AccountPage";
import WishlistPage from "../pages/WishlistPage";
import NotFoundPage from "../pages/NotFoundPage";
import { STAFF_ROLES, ADMIN_ROLES } from "../config/appConfig";
import { ProtectedRoute } from "./ProtectedRoute";

// Lazy-loaded: pulls the admin UI *and* recharts out of the main bundle so
// anonymous shoppers never download Studio-only code.
const AdminPage = lazy(() => import("../pages/AdminPage"));

function AdminRoute({ tab, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <Suspense fallback={<Boot />}>
        <AdminPage tab={tab} />
      </Suspense>
    </ProtectedRoute>
  );
}

export function Boot() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="logo-mark display">F</span>
      <p style={{ color: "var(--ink2)", fontWeight: 600 }}>Loading the shop…</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/product/:id" element={<ProductDetailPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wishlist"
        element={
          <ProtectedRoute>
            <WishlistPage />
          </ProtectedRoute>
        }
      />

      <Route path="/admin" element={<AdminRoute tab="dashboard" roles={STAFF_ROLES} />} />
      <Route path="/admin/products" element={<AdminRoute tab="products" roles={STAFF_ROLES} />} />
      <Route path="/admin/inventory" element={<AdminRoute tab="inventory" roles={STAFF_ROLES} />} />
      <Route path="/admin/categories" element={<AdminRoute tab="categories" roles={STAFF_ROLES} />} />
      <Route path="/admin/orders" element={<AdminRoute tab="orders" roles={STAFF_ROLES} />} />
      <Route path="/admin/reviews" element={<AdminRoute tab="reviews" roles={STAFF_ROLES} />} />
      <Route path="/admin/users" element={<AdminRoute tab="users" roles={ADMIN_ROLES} />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
