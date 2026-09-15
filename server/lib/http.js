import crypto from "node:crypto";
import { ALLOWED_ORIGINS, FRONTEND_ORIGIN, CSRF_COOKIE_NAME, SESSION_TTL_MS, isProduction, TRUST_PROXY } from "../config/env.js";

const clientIp = (req) => TRUST_PROXY
  ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim()
  : String(req.socket.remoteAddress || "unknown").trim();

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const corsHeaders = (req, res) => {
  const requestOrigin = String(req?.headers?.origin || "").replace(/\/$/, "");
  // Checks your dynamic environment variables list directly
  const allowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) 
    ? requestOrigin 
    : FRONTEND_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Authorization, Accept, X-Requested-With");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Vary", "Origin");
};

const send = (req, res, status, payload) => {
  corsHeaders(req, res);
  json(res, status, payload);
};

const sendHtml = (req, res, status, body, { cacheControl = "no-store" } = {}) => {
  corsHeaders(req, res);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
  });
  res.end(body);
};


const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );

const appendSetCookie = (res, cookieStr) => {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) return res.setHeader("Set-Cookie", cookieStr);
  res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
};

// --- CSRF protection (double-submit cookie) --------------------------------
// The session cookie is HttpOnly (JS can't read it), so a malicious site can
// still trigger authenticated cross-origin requests using the browser's
// auto-attached cookie. To block that, every response also carries a second,
// JS-readable token in a separate cookie. The frontend echoes that value back
// as an X-CSRF-Token header on every state-changing request; since a
// cross-origin attacker page cannot read our cookie (browsers enforce
// same-origin on document.cookie) or set a custom header on a simple
// cross-origin form/fetch without triggering CORS, it cannot forge a match.
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ensureCsrfCookie = (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  let value = cookies[CSRF_COOKIE_NAME];
  if (!value) {
    value = crypto.randomBytes(24).toString("base64url");
    const secure = isProduction ? "; Secure" : "";
    const sameSite = isProduction ? "None" : "Lax";
    appendSetCookie(res, `${CSRF_COOKIE_NAME}=${value}; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
  }
  return value;
};

const verifyCsrf = (req, res, cookieValue) => {
  if (CSRF_SAFE_METHODS.has(req.method)) return true;
  const header = req.headers["x-csrf-token"];
  if (!cookieValue || !header || header !== cookieValue) {
    send(req, res, 403, { error: "CSRF_VALIDATION_FAILED", message: "Your session could not be verified. Please refresh the page and try again." });
    return false;
  }
  return true;
};

export {
  clientIp, json, corsHeaders, send, sendHtml, parseCookies, appendSetCookie,
  CSRF_SAFE_METHODS, ensureCsrfCookie, verifyCsrf,
};
