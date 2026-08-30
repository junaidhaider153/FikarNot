export const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};

export const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const fmt = (n, currency = "PKR", locale = "en-PK") =>
  new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n) || 0);

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
