import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Upload failed");

export const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

export const uploadsApi = {
  // dataUrl: a "data:image/...;base64,..." string (already compressed client-side).
  // Returns { url } where url is a stable, relative /uploads/... path to store on the product.
  uploadImage: (dataUrl, originalName = "") => request("/api/uploads/image", { method: "POST", body: JSON.stringify({ dataUrl, originalName }) }),

  // Videos are sent as raw binary (no base64) so a large clip is not inflated by ~33%.
  // The file's own MIME type becomes the Content-Type; the server re-validates it
  // against the actual magic bytes before storing anything.
  uploadVideo: (file) => {
    if (!file) throw new Error("Choose a video file first.");
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) throw new Error("Only MP4 or WebM videos are supported.");
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video must be 32 MB or smaller. Try a shorter or more compressed clip.");
    return request("/api/uploads/video", {
      method: "POST",
      headers: { "Content-Type": file.type, "X-Original-Name": encodeURIComponent(file.name || "") },
      body: file,
    });
  },
};
