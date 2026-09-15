import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Account request failed");

export const accountApi = {
  getState: () => request("/api/account/state"),
  saveState: (payload) => request("/api/account/state", { method: "PUT", body: JSON.stringify(payload) }),
  saveAddress: (address) => request("/api/account/addresses", { method: "PUT", body: JSON.stringify({ address }) }),
  deleteAddress: (id) => request(`/api/account/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
