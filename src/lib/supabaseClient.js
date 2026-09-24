import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// createClient() throws synchronously (new URL(supabaseUrl) internally) if
// the URL is missing or malformed. Since this module is imported at the top
// of apiClient.js — which almost every page imports, directly or indirectly
// — an uncaught throw here takes down the ENTIRE app before React ever
// mounts, producing a blank white page with no visible error. A clearly
// invalid-but-well-formed placeholder URL lets the app render normally (API
// calls will just fail with a clear network error) instead of crashing outright.
const MISSING_ENV = !SUPABASE_URL || !SUPABASE_ANON_KEY;
if (MISSING_ENV) {
  // eslint-disable-next-line no-console
  console.error(
    "[FikarNot] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n" +
      "Create a .env file in the project root (see .env.example) with both values, " +
      "then restart `npm run dev` — Vite only reads .env files at startup.",
  );
}

export const supabase = createClient(
  MISSING_ENV ? "https://missing-env-vars.supabase.co" : SUPABASE_URL,
  MISSING_ENV ? "missing-anon-key" : SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
