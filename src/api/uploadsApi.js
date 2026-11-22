import { apiRequest } from "./apiClient";

const request = (path, options) => apiRequest(path, options, "Upload failed");

export const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

export const uploadsApi = {
  // dataUrl: a "data:image/...;base64,..." string (already compressed client-side).
  // Returns { url } where url is a stable, relative /uploads/... path to store on the product.
  uploadImage: (dataUrl, originalName = "") =>
    request("/api/uploads/image", { method: "POST", body: JSON.stringify({ dataUrl, originalName }) }),

  // Videos are uploaded via Supabase Storage signed upload URLs to handle large files
  // without proxying multi-megabyte payloads through Edge Functions.
  // The file's MIME type, size, and magic bytes are verified before storage.
  uploadVideo: async (file) => {
    if (!file) throw new Error("Choose a video file first.");
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      throw new Error("Only MP4 or WebM videos are supported.");
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error("Video must be 32 MB or smaller. Try a shorter or more compressed clip.");
    }

    // Read leading bytes for magic byte verification
    const headerBuffer = await file.slice(0, 16).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuffer);
    const headerHex = Array.from(headerBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Calculate SHA-256 for asset deduplication and registration
    const fullBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", fullBuffer);
    const sha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Step 1: Request signed upload URL from Edge Function
    const initRes = await request("/api/uploads/video/signed-url", {
      method: "POST",
      body: JSON.stringify({
        originalName: file.name || "",
        mimeType: file.type,
        byteSize: file.size,
        sha256,
        headerHex,
      }),
    });

    if (initRes.alreadyExists) {
      return { url: initRes.url, asset: initRes.asset };
    }

    // Step 2: Upload raw file directly to Supabase Storage signed URL
    const uploadRes = await fetch(initRes.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!uploadRes.ok) {
      const errDetail = await uploadRes.text().catch(() => "");
      throw new Error(`Storage upload failed (${uploadRes.status}): ${errDetail || "Could not write video file."}`);
    }

    // Step 3: Complete registration in media_assets & audit_logs
    const completeRes = await request("/api/uploads/video/complete", {
      method: "POST",
      body: JSON.stringify({
        filename: initRes.filename,
        originalName: file.name || "",
        mimeType: file.type,
        byteSize: file.size,
        sha256,
      }),
    });

    return completeRes;
  },
};
