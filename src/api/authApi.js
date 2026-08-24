const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed");
    error.code = payload.error || "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const authApi = {
  me: () => request("/api/auth/me"),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name, email, password) => request("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST", body: "{}" }),
  updateProfile: (name, email) => request("/api/auth/profile", { method: "POST", body: JSON.stringify({ name, email }) }),
  changePassword: (currentPassword, newPassword) =>
    request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  deleteAccount: (currentPassword, confirmationText) =>
    request("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ currentPassword, confirmationText }) }),
  forgotPassword: (email) => request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  verifyResetToken: (token) => request(`/api/auth/reset-password?token=${encodeURIComponent(token)}`),
  resetPassword: (token, newPassword) =>
    request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
};
