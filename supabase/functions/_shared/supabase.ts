// Single service-role client shared by every Edge Function.
// The service-role key bypasses RLS: NEVER import this from client code and
// ALWAYS authorise the caller (see auth.ts) before touching data with it.
import { createClient } from "jsr:@supabase/supabase-js@2";

function getEnv(key: string, fallback = ""): string {
  try {
    return Deno.env.get(key) ?? fallback;
  } catch {
    return fallback;
  }
}

const SUPABASE_URL = getEnv("SUPABASE_URL", "http://localhost:54321");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY", "dummy-service-role-key");

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
