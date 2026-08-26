# FikarNot Production Deployment Notes

## Required environment

Set these on the server, never in the frontend bundle:

- `NODE_ENV=production`
- `FIKARNOT_API_PORT`
- `FIKARNOT_FRONTEND_ORIGIN`
- `FIKARNOT_APP_URL`
- `SITE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `FIKARNOT_DATA_DIR`
- `FIKARNOT_SEED_DEMO_DATA=0`
- `FIKARNOT_ENABLE_MOCK_PAYMENTS=0`
- `FIKARNOT_EXPOSE_RESET_LINKS=0`

Run `npm run check:production` before starting a production deployment.

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
