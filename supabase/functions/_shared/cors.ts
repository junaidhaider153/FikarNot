// Strict CORS allow-list.
// Env: ALLOWED_ORIGINS (preferred) or FIKARNOT_FRONTEND_ORIGIN (legacy name),
// comma separated, e.g. "https://fikarnot-live.vercel.app,https://www.fikarnot.shop".
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("FIKARNOT_FRONTEND_ORIGIN") || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders(req) }) : null;
}
