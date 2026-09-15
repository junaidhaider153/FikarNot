import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Media request failed");

export const mediaApi = {
  list: ({ limit = 24, offset = 0 } = {}) => request(`/api/media?limit=${limit}&offset=${offset}`),
  remove: (id) => request(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" }),
  cleanup: () => request("/api/media/cleanup", { method: "POST" }),
};
