import { apiRequest } from "./apiClient";
const request = (path, options) => apiRequest(path, options, "Payment request failed");
export const paymentsApi = {
  commerceSettings: () => request("/api/commerce-settings"),
  createPayFastSession: (orderId) => request("/api/payments/payfast/session", { method: "POST", body: JSON.stringify({ orderId }) }),
};
