import { Route, Routes } from "react-router-dom";
import HomePage from "../pages/HomePage";
import ProductsPage from "../pages/ProductsPage";
import ProductDetailPage from "../pages/ProductDetailPage";
import CartPage from "../pages/CartPage";
import CheckoutPage from "../pages/CheckoutPage";
import LoginPage from "../pages/LoginPage";
import AccountPage from "../pages/AccountPage";
import WishlistPage from "../pages/WishlistPage";
import AdminPage from "../pages/AdminPage";
import NotFoundPage from "../pages/NotFoundPage";
import { STAFF_ROLES, ADMIN_ROLES } from "../config/appConfig";
import { ProtectedRoute } from "./ProtectedRoute";

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
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
      <Route path="/wishlist" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="dashboard" /></ProtectedRoute>} />
      <Route path="/admin/products" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="products" /></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="inventory" /></ProtectedRoute>} />
      <Route path="/admin/categories" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="categories" /></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="orders" /></ProtectedRoute>} />
      <Route path="/admin/reviews" element={<ProtectedRoute roles={STAFF_ROLES}><AdminPage tab="reviews" /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute roles={ADMIN_ROLES}><AdminPage tab="users" /></ProtectedRoute>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
