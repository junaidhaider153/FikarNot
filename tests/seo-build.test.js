import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression coverage for a real incident: an earlier revision of this project
// (Module 32 -> 33) silently dropped server-side SEO snapshots entirely, and a
// later fix (Module 34) reintroduced them but would silently prerender the 8
// seed/demo products instead of the live catalogue whenever SITEMAP_API_URL was
// left unset in a production build — no error, no failed build. These tests lock
// in the fail-loud behavior that closes that gap so it can't regress silently again.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");
const MINIMAL_DIST_INDEX = "<!doctype html><html><head><title>FikarNot</title></head><body></body></html>";

// Both scripts resolve dist/ relative to their own file location (import.meta.url),
// not the process cwd, so a fixture has to live at the real project's dist/
// rather than in an isolated temp cwd. If dist/ doesn't already exist, we create
// it for the duration of the test and remove exactly what we added afterward;
// if it already exists (e.g. a real `npm run build` ran first), we leave it alone
// entirely to avoid clobbering real output.
const withDistIndexFixture = (fn) => {
  const distDirPreexisted = existsSync(DIST_DIR);
  const distIndexPreexisted = existsSync(DIST_INDEX);
  mkdirSync(DIST_DIR, { recursive: true });
  if (!distIndexPreexisted) writeFileSync(DIST_INDEX, MINIMAL_DIST_INDEX);
  try {
    return fn();
  } finally {
    if (!distIndexPreexisted) rmSync(DIST_INDEX, { force: true });
    if (!distDirPreexisted) rmSync(DIST_DIR, { recursive: true, force: true });
  }
};

const runScript = (relativeScriptPath, env) =>
  spawnSync(process.execPath, [path.join(ROOT, relativeScriptPath)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

test("prerender-seo.js fails the build in production when SITEMAP_API_URL is unset (does not silently prerender demo data)", () => {
  const result = withDistIndexFixture(() => runScript("scripts/prerender-seo.js", { NODE_ENV: "production", SITEMAP_API_URL: "" }));
  assert.notEqual(result.status, 0, "script should exit non-zero when SITEMAP_API_URL is missing in production");
  assert.match(result.stderr, /SITEMAP_API_URL/);
});

test("prerender-seo.js falls back to seed data outside production (local/dev convenience)", () => {
  const result = withDistIndexFixture(() => runScript("scripts/prerender-seo.js", { NODE_ENV: "development", SITEMAP_API_URL: "" }));
  assert.equal(result.status, 0, "dev builds should still succeed with a seed-data fallback");
  // Clean up the product pages this successful dev run writes into dist/product/.
  rmSync(path.join(DIST_DIR, "product"), { recursive: true, force: true });
});

test("generate-sitemap.js fails the build in production when SITEMAP_API_URL is unset (does not silently write a demo-data sitemap)", () => {
  const sitemapPreexisted = existsSync(path.join(DIST_DIR, "sitemap.xml"));
  const result = runScript("scripts/generate-sitemap.js", { NODE_ENV: "production", SITEMAP_API_URL: "" });
  assert.notEqual(result.status, 0, "script should exit non-zero when SITEMAP_API_URL is missing in production");
  assert.match(result.stderr, /SITEMAP_API_URL/);
  if (!sitemapPreexisted) rmSync(path.join(DIST_DIR, "sitemap.xml"), { force: true });
});

test("generate-sitemap.js falls back to seed data outside production (local/dev convenience)", () => {
  const sitemapPreexisted = existsSync(path.join(DIST_DIR, "sitemap.xml"));
  const result = runScript("scripts/generate-sitemap.js", { NODE_ENV: "development", SITEMAP_API_URL: "" });
  assert.equal(result.status, 0, "dev builds should still succeed with a seed-data fallback");
  if (!sitemapPreexisted) rmSync(path.join(DIST_DIR, "sitemap.xml"), { force: true });
});
