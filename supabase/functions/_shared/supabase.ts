// Single service-role client shared by every Edge Function.
// The service-role key bypasses RLS: NEVER import this from client code and
// ALWAYS authorise the caller (see auth.ts) before touching data with it.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
if (!SUPABASE_URL) {
  throw new Error("Missing required environment variable: SUPABASE_URL");
}

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
}

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
