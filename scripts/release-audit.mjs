import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

const requiredFiles = [
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".env.example",
  "DEPLOYMENT.md",
  "Dockerfile",
  "Dockerfile.web",
  "docker-compose.yml",
  "deploy/nginx.conf",
  "server/index.js",
  "src/App.jsx",
  "src/main.jsx",
  "src/styles.css",
  "tests/helpers.js",
  ".github/workflows/ci.yml",
];

for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`Missing required file: ${rel}`);
}

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

try {
  const pkg = JSON.parse(read("package.json"));
  if (!pkg.scripts?.verify?.includes("release:audit")) {
    failures.push("package.json verify script does not include release:audit");
  }
  if (pkg.scripts?.test?.includes("--test-concurrency=1") === false) {
    failures.push("package.json test script must run with --test-concurrency=1");
  }
  if (pkg.engines?.node && !/^>=22/.test(pkg.engines.node)) {
    warnings.push(`Node engine is ${pkg.engines.node}; FikarNot is validated against Node 22+.`);
  }
} catch (error) {
  failures.push(`Unable to parse package.json: ${error.message}`);
}

const envExample = read(".env.example");
const forbiddenEnvPatterns = [
  /^RESEND_API_KEY=.+/m,
  /^DATABASE_URL=.+/m,
  /^SESSION_SECRET=.+/m,
];
for (const re of forbiddenEnvPatterns) {
  if (re.test(envExample)) warnings.push(`.env.example contains a populated sensitive setting: ${re}`);
}

const gitignore = read(".gitignore");
for (const required of ["node_modules/", "dist/", ".env", "server/data/*.sqlite"]) {
  if (!gitignore.includes(required)) failures.push(`.gitignore is missing: ${required}`);
}

const ci = read(".github/workflows/ci.yml");
if (!ci.includes("npm ci")) failures.push("CI workflow does not run npm ci");
if (!ci.includes("npm run verify")) failures.push("CI workflow does not run npm verify");

const server = read("server/index.js");
const html = read("index.html");
const nginx = read("deploy/nginx.conf");
for (const required of ["/api/", "/uploads/", "try_files"]) {
  if (!nginx.includes(required)) failures.push(`deploy/nginx.conf is missing expected SPA/API behavior: ${required}`);
}
for (const required of ["/api/health", "X-Content-Type-Options", "SIGTERM", "server.close"]) {
  if (!server.includes(required)) failures.push(`Server audit could not confirm required behavior: ${required}`);
}
if (!html.includes("Content-Security-Policy")) failures.push("index.html is missing the Content-Security-Policy meta tag.");

// Flag accidental build output or dependency directories in the source tree.
if (fs.existsSync(path.join(root, "node_modules"))) warnings.push("node_modules exists in the release workspace; do not commit/package it.");

if (failures.length) {
  console.error("RELEASE AUDIT FAILED");
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error("Warnings:");
    for (const item of warnings) console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("RELEASE AUDIT PASSED");
console.log(`Checked ${requiredFiles.length} required release files and deployment/CI invariants.`);
if (warnings.length) {
  console.log("Warnings:");
  for (const item of warnings) console.log(`- ${item}`);
}
