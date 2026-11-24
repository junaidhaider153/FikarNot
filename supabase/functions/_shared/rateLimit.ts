// DB-backed fixed-window rate limiter (public.rate_limit_hit, migration 0005).
// Works across Edge Function isolates. Fails OPEN if the database call itself
// errors so an outage of the limiter never takes checkout down.
import { admin } from "./supabase.ts";
import { clientIp, json } from "./http.ts";

/** Returns a 429 Response when the rate limit for a specific arbitrary key is exceeded, otherwise null. */
// deno-lint-ignore no-explicit-any
export async function limitKey(
  req: Request,
  key: string,
  max: number,
  windowSeconds: number,
  client: any = admin,
): Promise<Response | null> {
  try {
    const { data, error } = await client.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_limit: max,
    });
    if (error) {
      console.warn("[rateLimit] check failed, allowing:", error.message);
      return null;
    }
    if (data === false) {
      return json(req, { error: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, 429);
    }
  } catch (e) {
    console.warn("[rateLimit] error, allowing:", e);
  }
  return null;
}

/** Returns a 429 Response when the limit for bucket:clientIp is exceeded, otherwise null. */
// deno-lint-ignore no-explicit-any
export async function limit(
  req: Request,
  bucket: string,
  max: number,
  windowSeconds: number,
  client: any = admin,
): Promise<Response | null> {
  return limitKey(req, `${bucket}:${clientIp(req)}`, max, windowSeconds, client);
}
