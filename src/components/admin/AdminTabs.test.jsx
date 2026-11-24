import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DashboardTab } from "./DashboardTab";
import { ProductsTab } from "./ProductsTab";
import { CategoriesTab } from "./CategoriesTab";
import { InventoryTab } from "./InventoryTab";
import { CouponsTab } from "./CouponsTab";
import { OrdersTab } from "./OrdersTab";
import { useApp } from "../../store/appStore";

vi.mock("../../store/appStore", () => ({
  useApp: vi.fn(),
  appActions: {
    toast: vi.fn(),
    toggleFeatured: vi.fn(),
    deleteProduct: vi.fn(),
    deleteCategory: vi.fn(),
    deleteCoupon: vi.fn(),
    toggleCoupon: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const mockAppState = {
  products: [
    {
      id: "p-101",
      name: "Cotton Linen Kurta",
      sku: "FKN-KRT-01",
      categoryId: "cat-1",
      price: 3500,
      stock: 12,
      stockThreshold: 5,
      featured: true,
      tags: ["kurta", "linen"],
      image: "kurta.jpg",
    },
    {
      id: "p-102",
      name: "Leather Peshawari Chappal",
      sku: "FKN-CHP-02",
      categoryId: "cat-2",
      price: 4500,
      stock: 2,
      stockThreshold: 5,
      featured: false,
      tags: ["chappal", "leather"],
      image: "chappal.jpg",
    },
  ],
  categories: [
    { id: "cat-1", name: "Apparel", description: "Men and women apparel", color: "#111" },
    { id: "cat-2", name: "Footwear", description: "Traditional footwear", color: "#555" },
  ],
  orders: [
    {
      id: "FN-9001",
      customer: { name: "Ahmed Khan", email: "ahmed@example.com", phone: "0300 1234567" },
      items: [{ productId: "p-101", name: "Cotton Linen Kurta", qty: 1, price: 3500 }],
      total: 3500,
      createdAt: "2026-11-24T00:00:00.000Z",
      status: "processing",
      paymentStatus: "paid",
      paymentMethod: "cod",
      courier: "PostEx",
      trackingNumber: "PEX-123",
      shipmentStatus: "shipped",
    },
  ],
  coupons: [
    {
      id: "cp-1",
      code: "LAUNCH20",
      type: "percent",
      value: 20,
      minSubtotal: 2000,
      maxUses: 100,
      usedCount: 15,
      active: true,
      description: "20% off launch celebration",
    },
  ],
  reviews: [],
  supportTickets: [],
  returnRequests: [],
  users: [],
  inventoryLog: [],
  session: { role: "admin", id: "admin-1" },
};

describe("Modular Admin Tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useApp.mockReturnValue(mockAppState);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders DashboardTab with stat cards and recent orders", () => {
    render(<DashboardTab />);
    expect(screen.getByText("Products live")).toBeTruthy();
    expect(screen.getByText("Revenue by category")).toBeTruthy();
    expect(screen.getByText("Catalogue mix")).toBeTruthy();
    expect(screen.getByText("FN-9001")).toBeTruthy();
  });

  it("renders ProductsTab with search bar and product rows", () => {
    render(<ProductsTab />);
    expect(screen.getByPlaceholderText(/filter products…/i)).toBeTruthy();
    expect(screen.getByText("Cotton Linen Kurta")).toBeTruthy();
    expect(screen.getByText("FKN-KRT-01")).toBeTruthy();
    expect(screen.getByText("Leather Peshawari Chappal")).toBeTruthy();
  });

  it("renders CategoriesTab with category list", () => {
    render(<CategoriesTab />);
    expect(screen.getByText("Apparel")).toBeTruthy();
    expect(screen.getByText("Footwear")).toBeTruthy();
    expect(screen.getByRole("button", { name: /new category/i })).toBeTruthy();
  });

  it("renders InventoryTab with stock health indicators", () => {
    render(<InventoryTab />);
    expect(screen.getByText("Units on hand")).toBeTruthy();
    expect(screen.getAllByText(/low stock/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/out of stock/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Stock value")).toBeTruthy();
  });

  it("renders CouponsTab with active promotion details", () => {
    render(<CouponsTab />);
    expect(screen.getByText("LAUNCH20")).toBeTruthy();
    expect(screen.getByText("20% off")).toBeTruthy();
  });

  it("renders OrdersTab with order list and packing slip action link", () => {
    render(<OrdersTab />);
    expect(screen.getByText("FN-9001")).toBeTruthy();
    expect(screen.getByText("Ahmed Khan")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Slip ↗" })).toBeTruthy();
  });
});
