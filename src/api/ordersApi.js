import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Order request failed");

export const ordersApi = {
  list: () => request("/api/orders"),
  migrate: (orders, coupons) => request("/api/orders/migrate", {
    method: "POST",
    body: JSON.stringify({ orders, coupons }),
  }),
  create: (payload) => request("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  cancel: (id) => request(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  setStatus: (id, status) => request(`/api/orders/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  }),
};
