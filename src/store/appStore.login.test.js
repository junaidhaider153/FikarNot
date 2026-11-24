import { beforeEach, describe, expect, it, vi } from "vitest";

const REAL_ORDER = {
  id: "FN-0099",
  userId: "u-cust",
  status: "delivered",
  total: 2500,
  items: [{ productId: "p1", name: "DB Product", qty: 1, price: 2500 }],
  customer: { userId: "u-cust", name: "Customer", email: "c@x.com", address: "Islamabad" },
  createdAt: "2026-11-20T10:00:00.000Z",
};

const REAL_RETURN = {
  id: "ret-1",
  order_id: "FN-0099",
  reason: "Wrong size",
  note: "Swap requested",
  status: "requested",
  created_at: "2026-11-22T08:00:00.000Z",
};

const sessionUser = { id: "u-cust", name: "Sara Ali", email: "c@x.com", role: "customer" };

vi.mock("../api/authApi", () => ({
  authApi: {
    me: async () => ({ authenticated: false, user: null }),
    login: async () => ({ user: sessionUser }),
  },
}));
vi.mock("../api/siteApi", () => ({ siteApi: { get: async () => ({ settings: {} }) } }));
vi.mock("../api/usersApi", () => ({ usersApi: { list: async () => ({ users: [] }) } }));
vi.mock("../api/catalogApi", () => ({
  catalogApi: {
    list: async () => ({
      categories: [{ id: "c1", name: "Apparel" }],
      products: [{ id: "p1", name: "DB Product", price: 2500, stock: 5, categoryId: "c1", sku: "SKU1" }],
      inventoryLog: [],
    }),
  },
}));
vi.mock("../api/ordersApi", () => ({
  ordersApi: { list: async () => ({ orders: [REAL_ORDER], total: 1 }) },
}));
vi.mock("../api/engagementApi", () => ({
  engagementApi: {
    listReviews: async () => ({ reviews: [] }),
    listCoupons: async () => ({ coupons: [] }),
    list: async () => ({
      reviews: [],
      coupons: [],
      supportTickets: [{ id: "sup-1", subject: "Help", status: "open" }],
      returnRequests: [REAL_RETURN],
      notifications: [{ id: "not-1", title: "Order delivered", read: false }],
    }),
  },
}));
vi.mock("../api/accountApi", () => ({ accountApi: { getState: async () => ({ addresses: [], cart: [], wishlist: [] }) } }));

describe("login() hydrates authenticated domain data without page reload", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("loads orders, normalized returnRequests, notifications, and links returnRequest onto matching orders", async () => {
    const { appActions, getState } = await import("./appStore");
    await appActions.bootstrap();
    expect(getState().orders).toEqual([]);

    const user = await appActions.login("c@x.com", "StrongPass123!");
    expect(user?.id).toBe("u-cust");

    const s = getState();
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0].returnRequest).toBe("ret-1");
    expect(s.returnRequests).toHaveLength(1);
    expect(s.returnRequests[0].createdAt).toBe(Date.parse("2026-11-22T08:00:00.000Z"));
    expect(s.supportTickets).toHaveLength(1);
    expect(s.notifications).toHaveLength(1);
  });
});
