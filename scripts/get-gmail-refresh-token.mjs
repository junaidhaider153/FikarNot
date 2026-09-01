// One-time interactive helper: obtains a long-lived Gmail OAuth2 refresh
// token for the account that will send FikarNot's transactional email via
// the Gmail REST API (https://www.googleapis.com/auth/gmail.send).
//
// Run this once, locally, logged in as the Gmail account you want to send
// from (not as whoever runs the server). The refresh token it prints goes
// into GMAIL_OAUTH_REFRESH_TOKEN on your hosting provider (e.g. Railway) —
// after that, the running server never needs this script again; it uses the
// refresh token to silently mint new access tokens forever (until revoked).
//
// Prerequisites (Google Cloud Console, one-time project setup):
//   1. Create/select a project, enable the "Gmail API" (APIs & Services > Library).
//   2. APIs & Services > OAuth consent screen: configure it (External is fine
//      for a single sending mailbox). While in "Testing" publishing status,
//      add the sending Gmail address under "Test users" or auth will be blocked.
//   3. APIs & Services > Credentials > Create Credentials > OAuth client ID,
//      Application type: "Desktop app". Copy the Client ID and Client secret.
//
// Usage:
//   GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... \
//     node scripts/get-gmail-refresh-token.mjs
//
// The script starts a temporary local server, prints a URL to open in your
// browser, and waits for Google's redirect back with the authorization code.

import http from "node:http";
import { google } from "googleapis";

const clientId = String(process.env.GMAIL_OAUTH_CLIENT_ID || "").trim();
const clientSecret = String(process.env.GMAIL_OAUTH_CLIENT_SECRET || "").trim();

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET (from a Google Cloud 'Desktop app' OAuth client) before running this script.");
  process.exit(1);
}

const PORT = 51782; // Arbitrary local loopback port; must be reachable at http://127.0.0.1:PORT/oauth2callback
const redirectUri = `http://127.0.0.1:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to receive a refresh token
  prompt: "consent", // forces Google to re-issue a refresh token even if this app was already authorized before
  scope: ["https://www.googleapis.com/auth/gmail.send"],
});

console.log("\n1. Open this URL in a browser, signed in as the Gmail account that should send FikarNot's emails:\n");
console.log(authUrl);
console.log("\n2. Approve access. You'll be redirected back here automatically.\n");
console.log(`Waiting for the redirect on ${redirectUri} ...`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error}. You can close this tab.`);
      console.error(`\nAuthorization failed: ${error}`);
      server.close(() => process.exit(1));
      return;
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing authorization code. You can close this tab.");
      return;
    }
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" }).end("FikarNot: Gmail authorization complete. You can close this tab and return to the terminal.");
    if (!tokens.refresh_token) {
      console.error("\nNo refresh token was returned. This usually means the account already granted access before without revoking it.");
      console.error("Revoke prior access at https://myaccount.google.com/permissions and re-run this script.");
      server.close(() => process.exit(1));
      return;
    }
    console.log("\nSuccess. Set this on your hosting provider (e.g. Railway) as GMAIL_OAUTH_REFRESH_TOKEN:\n");
    console.log(tokens.refresh_token);
    console.log("\nAlso set GMAIL_SENDER_EMAIL to the Gmail address you just authorized.\n");
    server.close(() => process.exit(0));
  } catch (err) {
    console.error("\nToken exchange failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed. Check the terminal.");
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, "127.0.0.1");
