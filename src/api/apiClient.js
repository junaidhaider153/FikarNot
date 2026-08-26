const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const SAFE_METHODS = new Set(["GET", "HEAD"]);

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Shared request helper for every API module.
 * - Always sends credentials (the HttpOnly session cookie rides along automatically).
 * - Attaches the CSRF double-submit token (read from the non-HttpOnly fn_csrf cookie
 *   the server sets) as a header on any request that isn't a plain GET/HEAD, so the
 *   server can confirm the request didn't originate from a forged cross-site form/fetch.
 * - Normalizes error responses into an Error with .code and .status.
 */
export async function apiRequest(path, options = {}, defaultErrorMessage = "Request failed") {
  const method = (options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie("fn_csrf");
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    credentials: "include",
    headers,
  });

  let payload = {};
  try {
    payload = await response.json();
    // eslint-disable-next-line no-empty -- response may have no JSON body (e.g. 204)
  } catch {}

  if (!response.ok) {
    const error = new Error(payload.message || defaultErrorMessage);
    error.code = payload.error || "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}
