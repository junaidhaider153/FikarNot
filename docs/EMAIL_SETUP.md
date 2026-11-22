# Email setup (fikarnotofficial.shop@gmail.com)

FikarNot sends two kinds of email through two different mechanisms.

| Kind                                            | Sent by                             | Transport                                                        |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Signup confirmation, password reset             | Supabase Auth                       | Custom SMTP → `smtp.gmail.com:465` with a Gmail **App Password** |
| Order confirmation, payment confirmed, tracking | Edge Functions (`_shared/email.ts`) | Gmail **REST API over HTTPS** (OAuth refresh token)              |

Edge Functions cannot use SMTP: Supabase blocks outbound ports 25 and 587, and raw-socket SMTP on Deno is unproven.

## A. Auth emails (Supabase dashboard)

1. Google Account → Security → turn on 2-Step Verification → **App passwords** → create one named "FikarNot".
2. Supabase → Authentication → **SMTP Settings** → enable custom SMTP:
   host `smtp.gmail.com`, port `465`, user `fikarnotofficial.shop@gmail.com`, password = the app password, sender = the same address.
3. Authentication → Providers → Email: keep **Confirm email** ON.
4. Authentication → Rate Limits: raise the email limit only as needed (custom SMTP starts low).
5. Authentication → URL Configuration: set Site URL to your production URL and add it (and previews) to Redirect URLs.

## B. Commerce emails (Gmail API)

1. Google Cloud Console → new project → **enable "Gmail API"**.
2. OAuth consent screen → External → add yourself as a test user, then **Publish app ("In production")**.
   ⚠️ While the app is in _Testing_, refresh tokens expire after ~7 days and emails silently stop.
3. Credentials → Create OAuth client ID → **Desktop app**. Copy the client ID and secret.
4. On your computer:
   ```bash
   GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... node scripts/get-gmail-refresh-token.mjs
   ```
   Open the printed URL signed in as `fikarnotofficial.shop@gmail.com`, approve, and copy the printed `supabase secrets set` lines.
5. Set the remaining secrets (see `supabase/functions/.env.example`):
   ```bash
   supabase secrets set GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... \
     GMAIL_OAUTH_REFRESH_TOKEN=... GMAIL_SENDER_EMAIL=fikarnotofficial.shop@gmail.com \
     APP_PUBLIC_URL=https://www.fikarnot.shop
   ```
6. Place a COD test order with your own address and watch `supabase functions logs orders`. A missing secret logs `[email] Gmail OAuth secrets missing; skipped` — the order still succeeds (email is fire-and-forget by design).

Gmail consumer limits: ~500 messages/day. Messages come from your Gmail address; for a branded sender later, move to a transactional provider (this module is the only place to change).
