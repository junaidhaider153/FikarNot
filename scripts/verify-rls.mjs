#!/usr/bin/env node
// Proves the public anon key cannot touch your data directly.
//
//   VITE_SUPABASE_URL=https://<ref>.supabase.co \
//   VITE_SUPABASE_ANON_KEY=<publishable key> \
//   npm run verify:rls
//
// Run it against the LIVE project after applying migration 0004. Exit code 1
// means something is still exposed. It only sends harmless requests (a
// 1-row SELECT, and an INSERT that must be refused).
const url = String(process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = String(process.env.VITE_SUPABASE_ANON_KEY || "");
if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  process.exit(2);
}

const TABLES = [
  "profiles",
  "customer_state",
  "customer_addresses",
  "categories",
  "products",
  "inventory_logs",
  "catalog_meta",
  "coupons",
  "orders",
  "order_items",
  "return_requests",
  "payments",
  "payment_proofs",
  "refunds",
  "reviews",
  "support_tickets",
  "notifications",
  "engagement_meta",
  "site_settings",
  "media_assets",
  "audit_logs",
  "rate_limits",
];
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
let failures = 0;
const report = (ok, label, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await res.text();
  let rows = null;
  try {
    rows = JSON.parse(body);
  } catch {
    /* not JSON */
  }
  if (res.ok && Array.isArray(rows) && rows.length > 0) report(false, `read ${table}`, "anon key returned DATA");
  else if (res.ok) report(false, `read ${table}`, "anon still has table privileges (empty result) — apply migration 0004");
  else report(true, `read ${table}`, `HTTP ${res.status}`);
}

const write = await fetch(`${url}/rest/v1/coupons`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({ id: "rls-probe", code: "RLSPROBE", type: "percent", value: 1 }),
});
report(!write.ok, "anon INSERT into coupons is refused", `HTTP ${write.status}`);

for (const fn of ["create_order", "cancel_order", "rate_limit_hit", "next_ticket_id"]) {
  const rpc = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: "{}" });
  report(!rpc.ok, `anon cannot call rpc/${fn}`, `HTTP ${rpc.status}`);
}

console.log(
  failures
    ? `\n${failures} check(s) FAILED — your data is exposed.`
    : "\nAll checks passed: the anon key cannot read or write your tables.",
);
process.exit(failures ? 1 : 0);
