// Video validation utilities for FikarNot (hero videos, site clips).
export const MAX_VIDEO_BYTES = 32 * 1024 * 1024; // 32MB

export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * Checks magic bytes in the leading file header:
 * - MP4 (ISO BMFF): bytes 4-8 are ASCII "ftyp"
 * - WebM (EBML): bytes 0-4 are [0x1a, 0x45, 0xdf, 0xa3]
 */
export function videoMatchesMagicBytes(mimeType: string, buf: Uint8Array): boolean {
  const normMime = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (normMime === "video/mp4") {
    if (buf.length < 12) return false;
    const brand = new TextDecoder().decode(buf.subarray(4, 8));
    return brand === "ftyp";
  }
  if (normMime === "video/webm") {
    if (buf.length < 4) return false;
    return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  }
  return false;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    const val = parseInt(cleanHex.substring(i, i + 2), 16);
    if (Number.isNaN(val)) return new Uint8Array(0);
    bytes[i / 2] = val;
  }
  return bytes;
}

export interface VideoValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
  status?: number;
  ext?: string;
}

export function validateVideoMetadata(mimeType: string, byteSize: number, headerBytes?: Uint8Array | null): VideoValidationResult {
  const normMime = String(mimeType || "")
    .trim()
    .toLowerCase();
  const ext = ALLOWED_VIDEO_TYPES[normMime];
  if (!ext) {
    return {
      valid: false,
      code: "INVALID_VIDEO_TYPE",
      message: "Only MP4 (video/mp4) or WebM (video/webm) videos are accepted.",
      status: 400,
    };
  }

  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return {
      valid: false,
      code: "INVALID_VIDEO_SIZE",
      message: "Video file must be non-empty.",
      status: 400,
    };
  }

  if (byteSize > MAX_VIDEO_BYTES) {
    return {
      valid: false,
      code: "VIDEO_TOO_LARGE",
      message: `Video is too large. Maximum size is ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB.`,
      status: 413,
    };
  }

  if (headerBytes && headerBytes.length > 0) {
    if (!videoMatchesMagicBytes(normMime, headerBytes)) {
      return {
        valid: false,
        code: "INVALID_VIDEO_CONTENT",
        message: "The uploaded file does not match its declared video format.",
        status: 400,
      };
    }
  }

  return { valid: true, ext };
}
