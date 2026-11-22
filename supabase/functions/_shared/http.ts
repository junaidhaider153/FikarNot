import { corsHeaders } from "./cors.ts";

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

/** Log the real error server-side; never leak DB/internal messages to clients. */
export function serverError(req: Request, error: unknown): Response {
  console.error("[edge] unhandled error:", error);
  return json(req, { error: "SERVER_ERROR", message: "Something went wrong. Please try again." }, 500);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}

/** Clamp a free-text field. */
export function text(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
