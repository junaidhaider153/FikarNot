import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Request failed");

export const authApi = {
  me: () => request("/api/auth/me"),
  login: (email, password, totp = "") => request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, totp }) }),
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
  verifyEmail: (token) => request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
  confirmEmail: (token) => request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email) => request("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
  twoFactorStatus: () => request("/api/auth/2fa/status"),
  twoFactorSetup: (currentPassword) => request("/api/auth/2fa/setup", { method: "POST", body: JSON.stringify({ currentPassword }) }),
  twoFactorEnable: (currentPassword, secret, code) => request("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ currentPassword, secret, code }) }),
  twoFactorDisable: (currentPassword, code) => request("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ currentPassword, code }) }),
};
