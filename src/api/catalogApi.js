const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let payload = {};
  try {
    payload = await response.json();
    // eslint-disable-next-line no-empty -- response may have no JSON body (e.g. 204); payload already defaults to {}
  } catch {}
  if (!response.ok) {
    const error = new Error(payload.message || "Catalog request failed");
    error.code = payload.error || "CATALOG_REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}
export const catalogApi = {
  list: () => request("/api/catalog"),
  migrate: (categories, products, inventoryLog) =>
    request("/api/catalog/migrate", { method: "POST", body: JSON.stringify({ categories, products, inventoryLog }) }),
  saveProduct: (product) => request("/api/catalog/products", { method: "POST", body: JSON.stringify({ product }) }),
  deleteProduct: (id) => request(`/api/catalog/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  saveCategory: (category) => request("/api/catalog/categories", { method: "POST", body: JSON.stringify({ category }) }),
  deleteCategory: (id) => request(`/api/catalog/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adjustInventory: (productId, nextStock, reason) =>
    request("/api/catalog/inventory/adjust", { method: "POST", body: JSON.stringify({ productId, nextStock, reason }) }),
};
