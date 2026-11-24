import { beforeEach, describe, expect, it, vi } from "vitest";

const REAL_ORDER = {
  id: "FN-0042",
  userId: "u-cust",
  status: "processing",
  total: 999,
  items: [],
  customer: { name: "Real", email: "r@x.com", address: "x" },
  createdAt: new Date().toISOString(),
};
const REAL_PRODUCT = {
  id: "p1",
  name: "DB Product",
  price: 123,
  stock: 5,
  category: "c1",
  sku: "SKU1",
  stockThreshold: 3,
  images: [],
  image: "",
  description: "d",
  tags: [],
  rating: 4,
  featured: false,
};
let sessionUser;
const notYet = () =>
  Promise.reject(Object.assign(new Error("One-time data migration tool — no longer needed"), { status: 501, code: "NOT_YET_MIGRATED" }));

vi.mock("../api/authApi", () => ({ authApi: { me: async () => ({ authenticated: true, user: sessionUser }) } }));
vi.mock("../api/siteApi", () => ({ siteApi: { get: async () => ({ settings: {} }) } }));
vi.mock("../api/usersApi", () => ({ usersApi: { list: async () => ({ users: [sessionUser] }) } }));
vi.mock("../api/catalogApi", () => ({
  catalogApi: {
    list: async () => ({
      categories: [{ id: "c1", name: "Real Cat" }],
      products: [REAL_PRODUCT],
      inventoryLog: [],
      migrated: false,
      total: 1,
    }),
    migrate: notYet,
  },
}));
vi.mock("../api/ordersApi", () => ({
  ordersApi: { list: async () => ({ orders: [REAL_ORDER], total: 1, limit: 100, offset: 0 }), migrate: notYet },
}));
vi.mock("../api/engagementApi", () => ({
  engagementApi: {
    listReviews: async () => ({ reviews: [] }),
    listCoupons: async () => ({ coupons: [] }),
    list: async () => ({ reviews: [], coupons: [], supportTickets: [], returnRequests: [], notifications: [] }),
    migrate: notYet,
  },
}));
vi.mock("../api/accountApi", () => ({ accountApi: { getState: async () => ({ addresses: [], cart: [], wishlist: [] }) } }));

describe("bootstrap() adopts server-authoritative data", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  for (const role of ["customer", "admin"]) {
    it(`role=${role}: real order and DB catalogue reach the store, demo seed orders do not`, async () => {
      sessionUser = { id: role === "admin" ? "u-admin" : "u-cust", name: "T", email: "t@x.com", role };
      const { appActions, getState } = await import("./appStore");
      await appActions.bootstrap();
      const s = getState();
      expect(s.orders.some((o) => o.id === "FN-0042")).toBe(true);
      expect(s.orders).toHaveLength(1);
      expect(s.products.some((p) => p.name === "DB Product")).toBe(true);
    });
  }
});
