import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Site settings request failed");

export const siteApi = {
  get: () => request("/api/site-settings"),
  update: (settings) => request("/api/site-settings", { method: "PATCH", body: JSON.stringify({ settings }) }),
};
