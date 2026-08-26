import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Upload failed");

export const uploadsApi = {
  // dataUrl: a "data:image/...;base64,..." string (already compressed client-side).
  // Returns { url } where url is a stable, relative /uploads/... path to store on the product.
  uploadImage: (dataUrl, originalName = "") => request("/api/uploads/image", { method: "POST", body: JSON.stringify({ dataUrl, originalName }) }),
};
