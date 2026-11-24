import { beforeEach, describe, expect, it, vi } from "vitest";

let mockAuth = { authenticated: false, user: null };
let catalogImpl = async () => ({ categories: [], products: [], inventoryLog: [], total: 0 });
let ordersImpl = async () => ({ orders: [], total: 0, limit: 100, offset: 0 });

vi.mock("../api/authApi", () => ({ authApi: { me: async () => mockAuth } }));
vi.mock("../api/siteApi", () => ({ siteApi: { get: async () => ({ settings: {} }) } }));
vi.mock("../api/usersApi", () => ({ usersApi: { list: async () => ({ users: [] }) } }));
vi.mock("../api/catalogApi", () => ({ catalogApi: { list: () => catalogImpl() } }));
vi.mock("../api/ordersApi", () => ({ ordersApi: { list: () => ordersImpl() } }));
vi.mock("../api/engagementApi", () => ({
  engagementApi: {
    listReviews: async () => ({ reviews: [] }),
    listCoupons: async () => ({ coupons: [] }),
    list: async () => ({ reviews: [], coupons: [], supportTickets: [], returnRequests: [], notifications: [] }),
  },
}));
vi.mock("../api/accountApi", () => ({ accountApi: { getState: async () => ({ addresses: [], cart: [], wishlist: [] }) } }));

describe("bootstrap() surfaces server errors instead of falling back to demo data", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    mockAuth = { authenticated: false, user: null };
    catalogImpl = async () => ({ categories: [], products: [], inventoryLog: [], total: 0 });
    ordersImpl = async () => ({ orders: [], total: 0, limit: 100, offset: 0 });
  });

  it("sets bootError and avoids seeding demo data when catalogApi.list fails", async () => {
    catalogImpl = async () => {
      throw new Error("Network error: catalog unreachable");
    };
    const { appActions, getState } = await import("./appStore");
    await appActions.bootstrap();
    const s = getState();
    expect(s.ready).toBe(false);
    expect(s.bootError).toBe("Network error: catalog unreachable");
    expect(s.products).toHaveLength(0);
    expect(s.orders).toHaveLength(0);
    expect(localStorage.getItem("fn_orders")).toBeNull();
    expect(localStorage.getItem("fn_users")).toBeNull();
  });

  it("sets bootError when ordersApi.list fails for an authenticated customer", async () => {
    mockAuth = { authenticated: true, user: { id: "u-1", name: "Ali", email: "ali@example.com", role: "customer" } };
    ordersImpl = async () => {
      throw new Error("Orders service unavailable");
    };
    const { appActions, getState } = await import("./appStore");
    await appActions.bootstrap();
    const s = getState();
    expect(s.ready).toBe(false);
    expect(s.bootError).toBe("Orders service unavailable");
    expect(s.orders).toHaveLength(0);
  });
});
