import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "server", "index.js");

/**
 * Boots a fresh instance of the real server (as a child process) against an
 * isolated temp SQLite database, so tests never touch the developer's actual
 * data. Returns a `client` object plus a `close()` to tear everything down.
 *
 * We spawn a real child process rather than importing server/index.js directly
 * because that module runs its setup (DB init, seeding, server.listen) as
 * top-level side effects the moment it's imported — a child process gives each
 * test file a clean, fully isolated instance without needing to refactor the
 * server into an importable factory function.
 */
export async function startTestServer({ seedDemoUsers = true, env = {} } = {}) {
  const port = await getFreePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "fikarnot-test-"));
  const baseUrl = `http://localhost:${port}`;

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      FIKARNOT_API_PORT: String(port),
      FIKARNOT_DATA_DIR: dataDir,
      NODE_ENV: "test",
      FIKARNOT_SEED_DEMO_DATA: seedDemoUsers ? "1" : "0",
      FIKARNOT_DISABLE_BREACH_CHECK: "1", // tests shouldn't depend on outbound internet access
      FIKARNOT_EXPOSE_RESET_LINKS: "1",
      PAYFAST_MERCHANT_ID: "merchant-test",
      PAYFAST_SECURED_KEY: "secured-test",
      PAYFAST_TOKEN_URL: "https://example.invalid/token",
      PAYFAST_CHECKOUT_URL: "https://example.invalid/checkout",
      FIKARNOT_API_PUBLIC_URL: "https://api.example.invalid",
      FIKARNOT_TRUST_PROXY: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupOutput = "";
  child.stdout.on("data", (chunk) => { startupOutput += chunk; });
  child.stderr.on("data", (chunk) => { startupOutput += chunk; });

  await waitForServerReady(baseUrl, child, () => startupOutput);

  const jar = new Map(); // simple cookie jar: name -> value

  const applySetCookies = (response) => {
    const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const cookieStr of raw) {
      const [pair] = cookieStr.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };

  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  /** Minimal fetch wrapper: carries cookies across requests and attaches the CSRF header automatically. */
  const request = async (requestPath, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (!["GET", "HEAD"].includes(method) && jar.has("fn_csrf")) {
      headers["X-CSRF-Token"] = jar.get("fn_csrf");
    }
    if (jar.size) headers.Cookie = cookieHeader();
    const response = await fetch(`${baseUrl}${requestPath}`, { ...options, method, headers, redirect: "manual" });
    applySetCookies(response);
    let body = null;
    const text = await response.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body, headers: response.headers };
  };

  /** Ensures a CSRF cookie exists (mirrors what the real app does via a GET on boot). */
  const primeCsrf = async () => { await request("/api/auth/me"); };

  const login = async (email, password, totp = "") => {
    await primeCsrf();
    return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, totp }) });
  };

  const close = async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    rmSync(dataDir, { recursive: true, force: true });
  };

  return { baseUrl, request, primeCsrf, login, jar, close, dataDir };
}


async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((closeError) => {
        if (closeError) reject(closeError);
        else if (!port) reject(new Error("Could not allocate a test port."));
        else resolve(port);
      });
    });
  });
}

function waitForServerReady(baseUrl, child, getOutput, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;

    const onExit = (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Server process exited early (code ${code}) before becoming ready.\nOutput:\n${getOutput()}`));
    };
    child.once("exit", onExit);

    const poll = async () => {
      if (settled) return;
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.ok) {
          settled = true;
          child.off("exit", onExit);
          resolve();
          return;
        }
      } catch {
        // server not accepting connections yet; keep polling
      }
      if (Date.now() - start > timeoutMs) {
        settled = true;
        child.off("exit", onExit);
        reject(new Error(`Server did not become ready within ${timeoutMs}ms.\nOutput so far:\n${getOutput()}`));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}
