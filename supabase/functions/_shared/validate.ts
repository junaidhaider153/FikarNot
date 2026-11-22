import { z, type ZodType } from "npm:zod@^3.24.1";
import { json } from "./http.ts";

export { z };

export type ValidationResult<T> = { success: true; data: T } | { success: false; response: Response };

const DEFAULT_MAX_BYTES = 64 * 1024; // 64 KB default limit

/**
 * Validates an incoming JSON request body against a Zod schema.
 * Enforces body size caps and returns { error: "VALIDATION_ERROR", message, fields } with HTTP 400
 * on invalid inputs or malformed JSON, and HTTP 413 on size limit exceeded.
 */
// deno-lint-ignore no-explicit-any
export async function validateJson<T>(
  req: Request,
  // deno-lint-ignore no-explicit-any
  schema: ZodType<T, any, any>,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<ValidationResult<T>> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      success: false,
      response: json(
        req,
        {
          error: "PAYLOAD_TOO_LARGE",
          message: `Request body exceeds maximum size of ${maxBytes} bytes.`,
        },
        413,
      ),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      success: false,
      response: json(
        req,
        {
          error: "VALIDATION_ERROR",
          message: "Failed to read request body.",
          fields: { _root: ["Failed to read request body."] },
        },
        400,
      ),
    };
  }

  if (raw.length > maxBytes) {
    return {
      success: false,
      response: json(
        req,
        {
          error: "PAYLOAD_TOO_LARGE",
          message: `Request body exceeds maximum size of ${maxBytes} bytes.`,
        },
        413,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return {
      success: false,
      response: json(
        req,
        {
          error: "VALIDATION_ERROR",
          message: "Malformed JSON body.",
          fields: { _root: ["Malformed JSON body."] },
        },
        400,
      ),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fields[path]) fields[path] = [];
      fields[path].push(issue.message);
    }
    const message = result.error.issues[0]?.message || "Validation failed.";
    return {
      success: false,
      response: json(
        req,
        {
          error: "VALIDATION_ERROR",
          message,
          fields,
        },
        400,
      ),
    };
  }

  return { success: true, data: result.data };
}
