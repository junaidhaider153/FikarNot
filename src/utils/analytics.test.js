import { describe, expect, it } from "vitest";
import { getAnalyticsData } from "./analytics";

describe("analytics: getAnalyticsData revenue and metric calculations", () => {
  it("strictly includes only orders where payment_status is 'paid', excluding unpaid, pending, and cancelled", () => {
    const now = Date.now();
    const state = {
      orders: [
        // 1. Paid order (should be included in revenue)
        {
          id: "ord-paid-1",
          status: "processing",
          paymentStatus: "paid",
          total: 1500,
          items: [{ productId: "p1", name: "Shirt", price: 1500, qty: 1 }],
          createdAt: new Date(now - 1000).toISOString(),
          customer: { userId: "u1", name: "Alice", email: "alice@example.com" },
        },
        // 2. Paid order with snake_case payment_status (should be included in revenue)
        {
          id: "ord-paid-2",
          status: "delivered",
          payment_status: "paid",
          total: 2500,
          items: [{ productId: "p2", name: "Pants", price: 2500, qty: 1 }],
          createdAt: new Date(now - 2000).toISOString(),
          customer: { userId: "u2", name: "Bob", email: "bob@example.com" },
        },
        // 3. Unpaid COD order (should NOT be included in revenue)
        {
          id: "ord-unpaid-cod",
          status: "processing",
          paymentStatus: "unpaid",
          total: 3000,
          items: [{ productId: "p1", name: "Shirt", price: 1500, qty: 2 }],
          createdAt: new Date(now - 3000).toISOString(),
          customer: { userId: "u3", name: "Charlie", email: "charlie@example.com" },
        },
        // 4. Pending manual payment order (should NOT be included in revenue)
        {
          id: "ord-pending-manual",
          status: "pending_payment",
          paymentStatus: "pending",
          total: 5000,
          items: [{ productId: "p2", name: "Pants", price: 2500, qty: 2 }],
          createdAt: new Date(now - 4000).toISOString(),
          customer: { userId: "u4", name: "Dave", email: "dave@example.com" },
        },
        // 5. Cancelled order (should NOT be included in revenue even if payment was paid)
        {
          id: "ord-cancelled",
          status: "cancelled",
          paymentStatus: "paid",
          total: 4000,
          items: [{ productId: "p3", name: "Cap", price: 4000, qty: 1 }],
          createdAt: new Date(now - 5000).toISOString(),
          customer: { userId: "u5", name: "Eve", email: "eve@example.com" },
        },
      ],
      products: [],
      categories: [],
    };

    const data = getAnalyticsData(state, "30", now);

    // Only orders 1 and 2 are valid paid orders (1500 + 2500 = 4000)
    expect(data.validOrders.length).toBe(2);
    expect(data.revenue).toBe(4000);
    expect(data.unitsSold).toBe(2);
    expect(data.averageOrderValue).toBe(2000);
    expect(data.customerCount).toBe(2);
  });
});
