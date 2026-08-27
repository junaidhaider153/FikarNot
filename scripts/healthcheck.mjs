const base = process.env.FIKARNOT_HEALTHCHECK_URL || process.argv[2] || "http://localhost:4000/healthz";
const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`Health check failed: HTTP ${response.status}`);
const body = await response.json();
if (body.status !== "ok") throw new Error("Health check returned a non-ok status");
console.log(`FikarNot health check passed: ${base}`);
