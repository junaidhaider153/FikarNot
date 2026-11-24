import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../store/appStore";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { TwoFactorSection } from "../components/TwoFactorSection";

// Re-export subcomponents for full backward compatibility
export { ProductEditor, ProductsTab } from "../components/admin/ProductsTab";
export { CategoryEditor, CategoriesTab } from "../components/admin/CategoriesTab";
export { UserEditor, UsersTab } from "../components/admin/UsersTab";
export { CouponEditor, CouponsTab } from "../components/admin/CouponsTab";
export { DashboardTab } from "../components/admin/DashboardTab";
export { InventoryTab, StockAdjuster } from "../components/admin/InventoryTab";
export { OrdersTab, ShipmentManager, copyText } from "../components/admin/OrdersTab";
export { ReviewsTab } from "../components/admin/ReviewsTab";
export { ReturnsTab } from "../components/admin/ReturnsTab";
export { SupportTab } from "../components/admin/SupportTab";
export { MediaTab } from "../components/admin/MediaTab";
export { SettingsTab } from "../components/admin/SettingsTab";
export { AnalyticsTab } from "../components/admin/AnalyticsTab";

// Internal tab imports
import { DashboardTab } from "../components/admin/DashboardTab";
import { AnalyticsTab } from "../components/admin/AnalyticsTab";
import { ProductsTab } from "../components/admin/ProductsTab";
import { InventoryTab } from "../components/admin/InventoryTab";
import { CategoriesTab } from "../components/admin/CategoriesTab";
import { OrdersTab } from "../components/admin/OrdersTab";
import { CouponsTab } from "../components/admin/CouponsTab";
import { ReviewsTab } from "../components/admin/ReviewsTab";
import { SupportTab } from "../components/admin/SupportTab";
import { ReturnsTab } from "../components/admin/ReturnsTab";
import { MediaTab } from "../components/admin/MediaTab";
import { UsersTab } from "../components/admin/UsersTab";
import { SettingsTab } from "../components/admin/SettingsTab";

export default function AdminPage({ tab }) {
  const s = useApp();
  useDocumentMeta({ title: "Studio", noindex: true });
  const [now] = useState(() => Date.now());
  const tabs = [
    { id: "dashboard", path: "/admin", label: "Dashboard", icon: "chart" },
    { id: "analytics", path: "/admin/analytics", label: "Analytics", icon: "chart" },
    { id: "products", path: "/admin/products", label: "Products", icon: "box", n: s.products.length },
    {
      id: "inventory",
      path: "/admin/inventory",
      label: "Inventory",
      icon: "box",
      n: s.products.filter((p) => p.stock <= (p.stockThreshold ?? 10)).length,
    },
    { id: "categories", path: "/admin/categories", label: "Categories", icon: "tag", n: s.categories.length },
    { id: "orders", path: "/admin/orders", label: "Orders", icon: "cart", n: s.orders.length },
    {
      id: "returns",
      path: "/admin/returns",
      label: "Returns",
      icon: "refresh",
      n: s.returnRequests?.filter((item) => item.status === "requested").length || 0,
    },
    {
      id: "coupons",
      path: "/admin/coupons",
      label: "Coupons",
      icon: "tag",
      n: s.coupons?.filter((coupon) => coupon.active && (!coupon.expiresAt || coupon.expiresAt > now)).length || 0,
    },
    {
      id: "reviews",
      path: "/admin/reviews",
      label: "Reviews",
      icon: "star",
      n: s.reviews?.filter((review) => review.status === "published").length || 0,
    },
    {
      id: "support",
      path: "/admin/support",
      label: "Support",
      icon: "mail",
      n: s.supportTickets?.filter((ticket) => ticket.status === "open").length || 0,
    },
    // Security is staff-wide (not admin-only): two-factor auth protects the
    // signed-in account itself, and editors have write access worth protecting too.
    { id: "security", path: "/admin/security", label: "Security", icon: "shield" },
    ...(s.session.role === "admin"
      ? [
          { id: "media", path: "/admin/media", label: "Media", icon: "box" },
          { id: "users", path: "/admin/users", label: "Users", icon: "users", n: s.users.length },
          { id: "settings", path: "/admin/settings", label: "Settings", icon: "tag" },
        ]
      : []),
  ];
  const activeTab = tabs.find((t) => t.id === tab);
  return (
    <div className="container admin">
      <aside className="admin-side" aria-label="Studio navigation">
        {tabs.map((t) => (
          <NavLink key={t.id} to={t.path} className="side-btn">
            <Ic n={t.icon} s={16} /> {t.label}
            {t.n != null && <span className="n">{t.n}</span>}
          </NavLink>
        ))}
      </aside>
      <main>
        <div className="sec-hd">
          <h1 className="sec-title display">{activeTab ? activeTab.label : "Dashboard"}</h1>
        </div>
        {tab === "dashboard" && <DashboardTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "inventory" && <InventoryTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "coupons" && <CouponsTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "support" && <SupportTab />}
        {tab === "returns" && <ReturnsTab />}
        {tab === "security" && (
          <div className="panel">
            <TwoFactorSection isStaff={true} />
          </div>
        )}
        {tab === "media" && s.session.role === "admin" && <MediaTab />}
        {tab === "users" && s.session.role === "admin" && <UsersTab />}
        {tab === "settings" && s.session.role === "admin" && <SettingsTab />}
      </main>
    </div>
  );
}
