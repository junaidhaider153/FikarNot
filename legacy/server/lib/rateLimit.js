import { db } from "../db/schema.js";

// Rate-limit counters live in SQLite rather than an in-memory Map. A Map resets
// on every server restart/redeploy (defeating the point of throttling brute-force
// attempts) and can't be shared if this app is ever run as more than one Node
// process — the DB, which is already the single source of truth for everything
// else here, doesn't have either problem.
const checkRateLimit = (scope, bucketKey, { windowMs, max }) => {
  const now = Date.now();
  const row = db.prepare("SELECT * FROM rate_limits WHERE scope=? AND bucket_key=?").get(scope, bucketKey);
  if (!row || now > row.reset_at) {
    db.prepare("INSERT INTO rate_limits (scope,bucket_key,count,reset_at) VALUES (?,?,1,?) ON CONFLICT(scope,bucket_key) DO UPDATE SET count=1,reset_at=excluded.reset_at")
      .run(scope, bucketKey, now + windowMs);
    return { allowed: true };
  }
  if (row.count >= max) return { allowed: false, retryAfterMs: row.reset_at - now };
  db.prepare("UPDATE rate_limits SET count=count+1 WHERE scope=? AND bucket_key=?").run(scope, bucketKey);
  return { allowed: true };
};
// On a successful login, clear that IP's counter so a legitimate user isn't stuck
// half-throttled after a few earlier typos.
const clearRateLimit = (scope, bucketKey) => db.prepare("DELETE FROM rate_limits WHERE scope=? AND bucket_key=?").run(scope, bucketKey);
// Occasionally sweep expired rows so this table doesn't grow forever on a
// long-running server. Cheap: only runs when a limiter is actually consulted.
let lastRateLimitSweep = 0;
const sweepExpiredRateLimits = () => {
  const now = Date.now();
  if (now - lastRateLimitSweep < 60_000) return;
  lastRateLimitSweep = now;
  db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now - 60_000);
};

export { checkRateLimit, clearRateLimit, sweepExpiredRateLimits };
