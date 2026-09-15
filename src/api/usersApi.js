import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "User request failed");

export const usersApi = {
  list: () => request("/api/users"),
  save: (user) => request("/api/users", { method: "POST", body: JSON.stringify({ user }) }),
  setRole: (id, role) => request(`/api/users/${encodeURIComponent(id)}/role`, { method: "POST", body: JSON.stringify({ role }) }),
  remove: (id) => request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
