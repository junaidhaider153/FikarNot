// One-time helper: obtains a long-lived Gmail OAuth refresh token for the
// mailbox that sends FikarNot's transactional email (scope gmail.send only).
// Plain fetch — no dependencies.
//
//   GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... node scripts/get-gmail-refresh-token.mjs
//
// Sign in as fikarnotofficial.shop@gmail.com when the browser opens.
// Full walkthrough (incl. the "Testing = 7-day token" trap): docs/EMAIL_SETUP.md
import http from "node:http";

const clientId = String(process.env.GMAIL_OAUTH_CLIENT_ID || "").trim();
const clientSecret = String(process.env.GMAIL_OAUTH_CLIENT_SECRET || "").trim();
if (!clientId || !clientSecret) {
  console.error("Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET (Google Cloud 'Desktop app' OAuth client).");
  process.exit(1);
}

const PORT = 51782;
const redirectUri = `http://127.0.0.1:${PORT}/oauth2callback`;
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline", // required to receive a refresh token
    prompt: "consent", // re-issue a refresh token even if previously authorised
    scope: "https://www.googleapis.com/auth/gmail.send",
  });

console.log("\n1. Open this URL, signed in as the Gmail account that should send FikarNot's email:\n");
console.log(authUrl);
console.log(`\n2. Approve access. Waiting for the redirect on ${redirectUri} ...`);

const finish = (server, code) => server.close(() => process.exit(code));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/oauth2callback") return void res.writeHead(404).end();
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error}. You can close this tab.`);
      console.error(`\nAuthorization failed: ${error}`);
      return finish(server, 1);
    }
    const code = url.searchParams.get("code");
    if (!code) return void res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing authorization code.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokens.error_description || tokens.error || `HTTP ${tokenResponse.status}`);

    res
      .writeHead(200, { "Content-Type": "text/plain" })
      .end("FikarNot: Gmail authorization complete. Close this tab and return to the terminal.");
    if (!tokens.refresh_token) {
      console.error("\nNo refresh token returned. Revoke prior access at https://myaccount.google.com/permissions and re-run.");
      return finish(server, 1);
    }
    console.log("\nSuccess. Store it as an Edge Function secret (never in git):\n");
    console.log(`  supabase secrets set GMAIL_OAUTH_REFRESH_TOKEN='${tokens.refresh_token}'`);
    console.log("  supabase secrets set GMAIL_SENDER_EMAIL='fikarnotofficial.shop@gmail.com'\n");
    finish(server, 0);
  } catch (err) {
    console.error("\nToken exchange failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed. Check the terminal.");
    finish(server, 1);
  }
});
server.listen(PORT, "127.0.0.1");
