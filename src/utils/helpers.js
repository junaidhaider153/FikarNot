export const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};

export const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const fmt = (n) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format(n);

export const loadLS = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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
