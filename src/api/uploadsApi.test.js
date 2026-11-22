import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, uploadsApi } from "./uploadsApi";

vi.mock("./apiClient", () => ({
  apiRequest: vi.fn(),
}));

const { apiRequest } = await import("./apiClient");

describe("uploadsApi.uploadVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "",
      })),
    );
  });

  it("exports allowed video types and maximum byte limit", () => {
    expect(ALLOWED_VIDEO_TYPES).toEqual(["video/mp4", "video/webm"]);
    expect(MAX_VIDEO_BYTES).toBe(32 * 1024 * 1024);
  });

  it("rejects when no file is provided", async () => {
    await expect(uploadsApi.uploadVideo(null)).rejects.toThrow("Choose a video file first.");
  });

  it("rejects unsupported video MIME types", async () => {
    const fakeFile = new File(["dummy content"], "test.avi", { type: "video/avi" });
    await expect(uploadsApi.uploadVideo(fakeFile)).rejects.toThrow("Only MP4 or WebM videos are supported.");
  });

  it("rejects video files exceeding 32MB", async () => {
    const oversizedFile = {
      name: "big.mp4",
      type: "video/mp4",
      size: 33 * 1024 * 1024,
      slice: () => ({ arrayBuffer: async () => new ArrayBuffer(16) }),
      arrayBuffer: async () => new ArrayBuffer(100),
    };
    await expect(uploadsApi.uploadVideo(oversizedFile)).rejects.toThrow("Video must be 32 MB or smaller.");
  });

  it("completes upload via signed upload URL and records asset", async () => {
    // 16 bytes: 4 bytes len, "ftyp", 8 extra bytes
    const headerBytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0, 0, 0, 0]);
    const mockFile = {
      name: "hero.mp4",
      type: "video/mp4",
      size: 5000,
      slice: () => ({ arrayBuffer: async () => headerBytes.buffer }),
      arrayBuffer: async () => headerBytes.buffer,
    };

    apiRequest
      .mockResolvedValueOnce({
        alreadyExists: false,
        signedUrl: "https://test.supabase.co/storage/v1/upload/sign/media/vid-1.mp4",
        filename: "vid-1.mp4",
        publicUrl: "https://test.supabase.co/storage/v1/object/public/media/vid-1.mp4",
      })
      .mockResolvedValueOnce({
        url: "https://test.supabase.co/storage/v1/object/public/media/vid-1.mp4",
        asset: { id: "media-1", filename: "vid-1.mp4" },
      });

    const result = await uploadsApi.uploadVideo(mockFile);

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/uploads/video/signed-url",
      expect.objectContaining({ method: "POST" }),
      "Upload failed",
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.supabase.co/storage/v1/upload/sign/media/vid-1.mp4",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/uploads/video/complete",
      expect.objectContaining({ method: "POST" }),
      "Upload failed",
    );
    expect(result.url).toBe("https://test.supabase.co/storage/v1/object/public/media/vid-1.mp4");
  });

  it("returns existing asset immediately when alreadyExists is true (deduplication)", async () => {
    const headerBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    const mockFile = {
      name: "existing.webm",
      type: "video/webm",
      size: 12000,
      slice: () => ({ arrayBuffer: async () => headerBytes.buffer }),
      arrayBuffer: async () => headerBytes.buffer,
    };

    apiRequest.mockResolvedValueOnce({
      alreadyExists: true,
      url: "https://test.supabase.co/storage/v1/object/public/media/existing.webm",
      asset: { id: "media-existing", filename: "existing.webm" },
    });

    const result = await uploadsApi.uploadVideo(mockFile);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.url).toBe("https://test.supabase.co/storage/v1/object/public/media/existing.webm");
  });
});
