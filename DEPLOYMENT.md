# FikarNot Production Deployment Notes

## Required environment

Set these on the server, never in the frontend bundle:

- `NODE_ENV=production`
- `FIKARNOT_API_PORT`
- `FIKARNOT_FRONTEND_ORIGIN`
- `FIKARNOT_APP_URL`
- `SITE_URL`
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`
- `FIKARNOT_DATA_DIR`
- `FIKARNOT_SEED_DEMO_DATA=0`
- `FIKARNOT_ENABLE_MOCK_PAYMENTS=0`
- `FIKARNOT_EXPOSE_RESET_LINKS=0`

Run `npm run check:production` before starting a production deployment.

## Email

Transactional email (verification, password reset, order confirmation/status, return status) is sent via the **Gmail REST API over HTTPS (port 443)**, not SMTP — this avoids relying on outbound SMTP ports, which some hosts (including Railway) restrict or don't guarantee. See `.env.example` for the one-time Google Cloud setup, and run `node scripts/get-gmail-refresh-token.mjs` once to obtain `GMAIL_OAUTH_REFRESH_TOKEN`. If the four `GMAIL_OAUTH_*`/`GMAIL_SENDER_EMAIL` variables are not set, the API logs email content instead of sending (non-production only) — sending is required in production.

## Database

Persist `server/data` on a durable volume. Before migrations or risky maintenance, run:

```powershell
npm run db:backup
```

A backup is written to `FIKARNOT_BACKUP_DIR` when set, otherwise to `server/data/backups`.

## Images

Uploaded product images are stored under the configured data directory. The uploads directory must be on persistent storage in production.

## Reverse proxy

Terminate TLS at the reverse proxy/load balancer and forward API traffic to the Node process. Configure the frontend origin explicitly and preserve `X-Forwarded-For` only when the proxy is trusted; set `FIKARNOT_TRUST_PROXY=1` only when the deployment is behind a trusted proxy.

## Health check

Use `GET /api/health` for service health checks. A non-200 response should be treated as unhealthy.

## Docker Compose

For a single-host deployment, copy `deploy/.env.production.example` to `.env`, replace the placeholder secrets, and run:

```bash
docker compose up -d --build
```

The web container is exposed on port `8080` and proxies `/api` and `/uploads` to the API container. The SPA history fallback is handled by Nginx, so direct routes such as `/product/p6` continue to work after refresh.

The SQLite database and uploads are stored in the named `fikarnot_data` volume. Back up that volume/database before upgrades or risky maintenance.


## Operations hardening

Before launch, enable TOTP 2FA for every admin/editor account from **Admin -> Settings -> Staff security**.

Configure `FIKARNOT_ERROR_WEBHOOK_URL` to an internal/approved error intake endpoint if centralized error alerts are required. The API sends only operational error metadata and omits stack traces in production.

Run `npm run db:backup` on the persistent API host and upload the generated SQLite file to durable off-box storage. `FIKARNOT_BACKUP_UPLOAD_URL` can be used with a private authenticated storage gateway that accepts a PUT upload; do not expose that endpoint publicly.

Run `npm run db:restore /path/to/backup.sqlite` as a documented restore drill on a maintenance instance before launch.

Run `npm run ops:healthcheck https://api.example.com/healthz` from an external scheduler/monitor every 5 minutes.


## Monitoring and scheduled backups

The Docker Compose stack now includes a persistent `backup` service that runs `npm run db:backup:schedule` every 24 hours. Configure `FIKARNOT_BACKUP_UPLOAD_URL` and its token to copy each backup to private off-box storage. Keep the upload endpoint private and rotate its token.

GitHub Actions can also check `/healthz` every five minutes. Add the public API health URL as the repository secret `FIKARNOT_HEALTHCHECK_URL`.

Before launch, perform one restore drill with `npm run db:restore /path/to/backup.sqlite` on a maintenance instance. Do not restore over a live production database without a maintenance plan.
