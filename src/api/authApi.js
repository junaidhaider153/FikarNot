import { supabase } from "../lib/supabaseClient";
import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Request failed");

function mapAuthError(error) {
  const err = new Error(error?.message || "Request failed");
  err.code = error?.code || "AUTH_ERROR";
  err.status = error?.status || 400;
  return err;
}

// Fetches { id, name, email, role, createdAt } for the signed-in user by
// combining the Supabase session with our `profiles` table (via the
// `account` Edge Function's GET /, reached through apiRequest("/api/auth/me")).
async function fetchProfile() {
  const result = await request("/api/auth/me");
  return result.user;
}

export const authApi = {
  // ---- Session -------------------------------------------------------------
  async me() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return { authenticated: false, user: null };
    try {
      const user = await fetchProfile();
      return { authenticated: true, user };
    } catch {
      // Session token is stale/invalid server-side.
      return { authenticated: false, user: null };
    }
  },

  async login(email, password, totp = "") {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase returns a generic AMR/factor error when the account has a
      // TOTP factor enrolled and no `totp` code was supplied yet.
      if (error.message?.toLowerCase().includes("factor") || error.status === 401) throw mapAuthError(error);
      throw mapAuthError(error);
    }
    // If the account has an enrolled TOTP factor, Supabase issues an AAL1
    // session that isn't fully authenticated until MFA is verified.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      if (!totp) {
        const err = new Error("Enter your 6-digit authenticator code to finish signing in.");
        err.code = "TOTP_REQUIRED";
        throw err;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (!factor) throw Object.assign(new Error("No authenticator app is enrolled."), { code: "TOTP_REQUIRED" });
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw mapAuthError(challengeError);
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp });
      if (verifyError) throw Object.assign(new Error("That code didn't match. Try again."), { code: "INVALID_TOTP" });
    }
    const user = await fetchProfile();
    return { user };
  },

  async register(name, email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw mapAuthError(error);
    if (!data.session) {
      // Email confirmation is required before a session exists.
      return { requiresVerification: true };
    }
    const user = await fetchProfile();
    return { user };
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw mapAuthError(error);
  },

  // ---- Profile ---------------------------------------------------------------
  async updateProfile(name, email) {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentEmail = sessionData?.session?.user?.email;
    if (email && email !== currentEmail) {
      // Changing email goes through Supabase's own confirmation flow (a
      // confirmation link is emailed to the new address); it does not take
      // effect immediately, so the `email` on the returned user below may
      // still show the OLD address until that link is clicked.
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw mapAuthError(error);
    }
    return request("/api/account/profile", { method: "PATCH", body: JSON.stringify({ name }) });
  },

  async changePassword(_currentPassword, newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw mapAuthError(error);
  },

  async deleteAccount(_currentPassword, confirmationText) {
    return request("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ confirmationText }) });
  },

  // ---- Forgot / reset password ------------------------------------------------
  // NOTE: Supabase's flow differs from the old one. The email link now sends
  // people straight back to your site already signed in (handled by
  // `detectSessionInUrl` in supabaseClient.js) — there's no separate
  // "verify this token" step. `resetPassword` below just sets the new
  // password on the now-active session.
  async forgotPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw mapAuthError(error);
    return { ok: true };
  },

  async resetPassword(_token, newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw mapAuthError(error);
    try {
      const user = await fetchProfile();
      return { ok: true, user };
    } catch {
      return { ok: true, user: null };
    }
  },

  // ---- Email verification -----------------------------------------------------
  // Also link-based now (Supabase emails a confirmation link that signs the
  // user in directly) — these two are kept only so old callers don't crash;
  // they just check whether a session already exists.
  async verifyEmail() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) throw Object.assign(new Error("Verification link unavailable."), { code: "INVALID_TOKEN" });
    return { ok: true };
  },
  async confirmEmail() {
    const user = await fetchProfile();
    return { user };
  },
  async resendVerification(email) {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw mapAuthError(error);
    return { ok: true };
  },

  // ---- Two-factor (Supabase's built-in TOTP MFA) -------------------------------
  async twoFactorStatus() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw mapAuthError(error);
    return { enabled: (data?.totp || []).length > 0, required: false };
  },

  async twoFactorSetup() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) throw mapAuthError(error);
    return { secret: data.totp.secret, otpauthUrl: data.totp.uri, factorId: data.id };
  },

  async twoFactorEnable(_currentPassword, factorIdOrSecret, code) {
    // AdminPage passes the value returned as `secret` from twoFactorSetup —
    // that call now also returns `factorId`, which is what MFA verify needs.
    const factorId = factorIdOrSecret;
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw mapAuthError(challengeError);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) throw Object.assign(new Error("That code didn't match. Try again."), { code: "INVALID_TOTP" });
    return { enabled: true };
  },

  async twoFactorDisable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (factor) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw mapAuthError(error);
    }
    return { enabled: false };
  },
};
