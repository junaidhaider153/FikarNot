import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Request failed");

export const engagementApi = {
  listReviews: () => request("/api/reviews"),
  listCoupons: () => request("/api/coupons"),
  list: () => request("/api/engagement"),
  migrate: (payload) => request("/api/engagement/migrate", { method: "POST", body: JSON.stringify(payload) }),
  saveReview: (payload) => request("/api/reviews", { method: "POST", body: JSON.stringify(payload) }),
  deleteReview: (id) => request(`/api/reviews/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setReviewStatus: (id, status) => request(`/api/reviews/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  saveCoupon: (coupon) => request("/api/coupons", { method: "POST", body: JSON.stringify({ coupon }) }),
  deleteCoupon: (id) => request(`/api/coupons/${encodeURIComponent(id)}`, { method: "DELETE" }),
  toggleCoupon: (id) => request(`/api/coupons/${encodeURIComponent(id)}/toggle`, { method: "POST", body: "{}" }),
  validateCoupon: (code, subtotal) => request("/api/coupons/validate", { method: "POST", body: JSON.stringify({ code, subtotal }) }),
  createSupport: (payload) => request("/api/support", { method: "POST", body: JSON.stringify(payload) }),
  setSupportStatus: (id, status) => request(`/api/support/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  deleteSupport: (id) => request(`/api/support/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createReturn: (payload) => request("/api/returns", { method: "POST", body: JSON.stringify(payload) }),
  setReturnStatus: (id, status) => request(`/api/returns/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  listNotifications: () => request("/api/notifications"),
  markNotificationRead: (id) => request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" }),
  markAllNotificationsRead: () => request("/api/notifications/read-all", { method: "POST", body: "{}" }),
  clearNotifications: () => request("/api/notifications", { method: "DELETE" }),
};
