const toTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const isCancelled = (order) => order?.status === "cancelled";

export function getAnalyticsRangeStart(range, now = Date.now()) {
  if (range === "all") return 0;
  const days = Number(range) || 30;
  return now - days * 86400000;
}

export function getAnalyticsData(state, range = "30", now = Date.now()) {
  const start = getAnalyticsRangeStart(range, now);
  const orders = (state.orders || []).filter((order) => toTime(order.createdAt) >= start);
  const validOrders = orders.filter((order) => !isCancelled(order));
  const revenue = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const unitsSold = validOrders.reduce(
    (sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0),
    0,
  );
  const averageOrderValue = validOrders.length ? revenue / validOrders.length : 0;
  const customers = new Map();
  validOrders.forEach((order) => {
    const userId = order.customer?.userId || order.customer?.email || order.customer?.name || order.id;
    const current = customers.get(userId) || {
      name: order.customer?.name || "Guest",
      email: order.customer?.email || "",
      orders: 0,
      spend: 0,
    };
    current.orders += 1;
    current.spend += Number(order.total || 0);
    customers.set(userId, current);
  });

  const productMap = new Map();
  validOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const current = productMap.get(item.productId) || { productId: item.productId, name: item.name, units: 0, revenue: 0 };
      current.units += Number(item.qty || 0);
      current.revenue += Number(item.price || 0) * Number(item.qty || 0);
      productMap.set(item.productId, current);
    });
  });

  const daily = new Map();
  validOrders.forEach((order) => {
    const date = new Date(order.createdAt).toISOString().slice(0, 10);
    const current = daily.get(date) || { date, revenue: 0, orders: 0, units: 0 };
    current.revenue += Number(order.total || 0);
    current.orders += 1;
    current.units += (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    daily.set(date, current);
  });

  const statusCounts = orders.reduce((acc, order) => {
    const key = order.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const couponMap = new Map();
  validOrders.forEach((order) => {
    if (!order.coupon?.code) return;
    const current = couponMap.get(order.coupon.code) || { code: order.coupon.code, uses: 0, savings: 0, revenue: 0 };
    current.uses += 1;
    current.savings += Number(order.coupon.discount || 0);
    current.revenue += Number(order.total || 0);
    couponMap.set(order.coupon.code, current);
  });

  const topCustomers = [...customers.values()].sort((a, b) => b.spend - a.spend).slice(0, 6);
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const couponPerformance = [...couponMap.values()].sort((a, b) => b.uses - a.uses).slice(0, 6);
  const trend = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  const lowStockCount = (state.products || []).filter(
    (product) => Number(product.stock || 0) <= Number(product.stockThreshold ?? 10),
  ).length;
  const outOfStockCount = (state.products || []).filter((product) => Number(product.stock || 0) <= 0).length;
  const repeatCustomerCount = [...customers.values()].filter((customer) => customer.orders > 1).length;

  return {
    start,
    orders,
    validOrders,
    revenue,
    unitsSold,
    averageOrderValue,
    customerCount: customers.size,
    repeatCustomerCount,
    lowStockCount,
    outOfStockCount,
    statusCounts,
    trend,
    topProducts,
    topCustomers,
    couponPerformance,
  };
}

export function analyticsCsv(data) {
  const rows = [
    ["Metric", "Value"],
    ["Revenue", data.revenue.toFixed(2)],
    ["Orders", data.validOrders.length],
    ["Units sold", data.unitsSold],
    ["Average order value", data.averageOrderValue.toFixed(2)],
    ["Customers", data.customerCount],
    ["Repeat customers", data.repeatCustomerCount],
    ["Low-stock products", data.lowStockCount],
    ["Out-of-stock products", data.outOfStockCount],
    [],
    ["Top products"],
    ["Product", "Units", "Revenue"],
    ...data.topProducts.map((item) => [item.name, item.units, item.revenue.toFixed(2)]),
    [],
    ["Coupon performance"],
    ["Code", "Uses", "Savings", "Revenue"],
    ...data.couponPerformance.map((item) => [item.code, item.uses, item.savings.toFixed(2), item.revenue.toFixed(2)]),
  ];
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
