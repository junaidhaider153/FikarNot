import { assertEquals } from "@std/assert";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, hexToBytes, validateVideoMetadata, videoMatchesMagicBytes } from "../_shared/video.ts";

Deno.test("video: ALLOWED_VIDEO_TYPES maps mp4 and webm", () => {
  assertEquals(ALLOWED_VIDEO_TYPES["video/mp4"], "mp4");
  assertEquals(ALLOWED_VIDEO_TYPES["video/webm"], "webm");
  assertEquals(ALLOWED_VIDEO_TYPES["video/avi"], undefined);
  assertEquals(MAX_VIDEO_BYTES, 32 * 1024 * 1024);
});

Deno.test("video: videoMatchesMagicBytes identifies MP4 ftyp box", () => {
  // ISO BMFF MP4 header: 4 bytes length, then 'ftyp'
  const validMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assertEquals(videoMatchesMagicBytes("video/mp4", validMp4), true);

  const invalidMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x6e, 0x6f, 0x74, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assertEquals(videoMatchesMagicBytes("video/mp4", invalidMp4), false);

  const shortMp4 = new Uint8Array([0x00, 0x00, 0x00]);
  assertEquals(videoMatchesMagicBytes("video/mp4", shortMp4), false);
});

Deno.test("video: videoMatchesMagicBytes identifies WebM EBML header", () => {
  // Matroska / WebM EBML header: 0x1A 0x45 0xDF 0xA3
  const validWebm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88]);
  assertEquals(videoMatchesMagicBytes("video/webm", validWebm), true);

  const invalidWebm = new Uint8Array([0x1a, 0x45, 0x00, 0x00]);
  assertEquals(videoMatchesMagicBytes("video/webm", invalidWebm), false);

  const shortWebm = new Uint8Array([0x1a, 0x45]);
  assertEquals(videoMatchesMagicBytes("video/webm", shortWebm), false);
});

Deno.test("video: validateVideoMetadata rejects unsupported MIME types", () => {
  const res1 = validateVideoMetadata("video/avi", 5000);
  assertEquals(res1.valid, false);
  assertEquals(res1.code, "INVALID_VIDEO_TYPE");
  assertEquals(res1.status, 400);

  const res2 = validateVideoMetadata("application/pdf", 5000);
  assertEquals(res2.valid, false);
  assertEquals(res2.code, "INVALID_VIDEO_TYPE");
});

Deno.test("video: validateVideoMetadata rejects empty or oversized videos", () => {
  const emptyRes = validateVideoMetadata("video/mp4", 0);
  assertEquals(emptyRes.valid, false);
  assertEquals(emptyRes.code, "INVALID_VIDEO_SIZE");
  assertEquals(emptyRes.status, 400);

  const negativeRes = validateVideoMetadata("video/mp4", -10);
  assertEquals(negativeRes.valid, false);
  assertEquals(negativeRes.code, "INVALID_VIDEO_SIZE");

  const oversizedRes = validateVideoMetadata("video/mp4", 33 * 1024 * 1024);
  assertEquals(oversizedRes.valid, false);
  assertEquals(oversizedRes.code, "VIDEO_TOO_LARGE");
  assertEquals(oversizedRes.status, 413);
});

Deno.test("video: validateVideoMetadata verifies header magic bytes when provided", () => {
  const validMp4Header = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const corruptHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]); // Zip header

  const validRes = validateVideoMetadata("video/mp4", 1024 * 1024, validMp4Header);
  assertEquals(validRes.valid, true);
  assertEquals(validRes.ext, "mp4");

  const mismatchRes = validateVideoMetadata("video/mp4", 1024 * 1024, corruptHeader);
  assertEquals(mismatchRes.valid, false);
  assertEquals(mismatchRes.code, "INVALID_VIDEO_CONTENT");
  assertEquals(mismatchRes.status, 400);
});

Deno.test("video: hexToBytes parses valid hex and safely rejects invalid input", () => {
  const bytes = hexToBytes("0000002066747970");
  assertEquals(bytes.length, 8);
  assertEquals(bytes[0], 0x00);
  assertEquals(bytes[3], 0x20);
  assertEquals(bytes[4], 0x66);

  // Odd length
  assertEquals(hexToBytes("123").length, 0);
  // Non-hex characters
  assertEquals(hexToBytes("zz").length, 0);
  // Empty
  assertEquals(hexToBytes("").length, 0);
});
