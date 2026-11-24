export const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};

export const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const fmt = (n, currency = "PKR", locale = "en-PK") =>
  new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n) || 0);

/** Inline SVG placeholder used when a product or store image is missing or fails to load. */
export const FALLBACK_PRODUCT_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
      '<rect width="400" height="400" fill="#F1EDE2"/>' +
      '<rect x="130" y="130" width="140" height="140" rx="18" fill="none" stroke="#8A8577" stroke-width="6"/>' +
      '<path d="M150 245l45-52 38 40 24-26 33 38" fill="none" stroke="#8A8577" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="176" cy="172" r="14" fill="#8A8577"/>' +
      "</svg>",
  );

/** Swaps failed <img> sources to a bundled placeholder SVG without risking loops. */
export const onImageError = (event) => {
  const img = event?.currentTarget;
  if (!img || img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = FALLBACK_PRODUCT_IMAGE;
};

/** Validates external/relative URLs to block javascript: and data: link injections. */
export function safeHttpUrl(value, { allowRelative = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//")) return "";
  if (allowRelative && raw.startsWith("/")) return raw;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://www.fikarnot.shop";
    const parsed = new URL(raw, base);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && /^https?:\/\//i.test(raw)) {
      return raw;
    }
    return "";
  } catch {
    return "";
  }
}

export const loadLS = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

// Same as loadLS, but guarantees an array is returned even if the stored
// value is corrupted/malformed (e.g. an old bug wrote a non-array value).
// Prevents "X.filter is not a function" style crashes on pages that read
// these keys expecting an array.
export const loadLSArray = (key) => {
  const value = loadLS(key, []);
  return Array.isArray(value) ? value : [];
};

export const saveLS = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
};

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
