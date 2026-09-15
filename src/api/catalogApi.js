import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Catalog request failed");

export const catalogApi = {
  list: (params = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    }
    const query = search.toString();
    return request(`/api/catalog${query ? `?${query}` : ""}`);
  },
  migrate: (categories, products, inventoryLog) =>
    request("/api/catalog/migrate", { method: "POST", body: JSON.stringify({ categories, products, inventoryLog }) }),
  saveProduct: (product) => request("/api/catalog/products", { method: "POST", body: JSON.stringify({ product }) }),
  deleteProduct: (id) => request(`/api/catalog/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  saveCategory: (category) => request("/api/catalog/categories", { method: "POST", body: JSON.stringify({ category }) }),
  deleteCategory: (id) => request(`/api/catalog/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adjustInventory: (productId, nextStock, reason) =>
    request("/api/catalog/inventory/adjust", { method: "POST", body: JSON.stringify({ productId, nextStock, reason }) }),
};
