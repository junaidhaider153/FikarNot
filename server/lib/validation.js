import crypto from "node:crypto";

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const validatePassword = (password) => typeof password === "string" && password.length >= 8;
const validateName = (name) => typeof name === "string" && name.trim().length >= 2;
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

// Checks a password against the Have I Been Pwned breach corpus using the
// k-anonymity range API: only the first 5 chars of the SHA-1 hash are ever sent,
// so the real password/hash never leaves the server. This is a *soft* check —
// on any network error, timeout, or non-2xx response we fail OPEN (allow the
// password through) rather than blocking registration/reset because a third
// party is unreachable.
//
// Disabled by default (opt-in) since it was blocking real customer signups
// whose passwords happened to appear in a breach corpus with no way to
// override it in the UI. Set FIKARNOT_ENABLE_BREACH_CHECK=1 in your
// environment to turn it back on.
const isPasswordPwned = async (password) => {
  if (process.env.FIKARNOT_ENABLE_BREACH_CHECK !== "1") return false;
  try {
    const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" },
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return false;
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [lineSuffix, count] = line.trim().split(":");
      return lineSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.warn("[FikarNot] Breach check unavailable, allowing password:", error.message);
    return false;
  }
};

export { normalizeEmail, validatePassword, validateName, validateEmail, isPasswordPwned };
