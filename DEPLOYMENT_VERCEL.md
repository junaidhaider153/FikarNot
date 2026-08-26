# FikarNot — Vercel deployment architecture

The supplied live URL (`https://fikarnot-live.vercel.app/`) is currently treated as the Vercel-hosted frontend URL. Use your eventual custom domain instead wherever that domain becomes canonical.

FikarNot's backend is a stateful Node.js service using SQLite and filesystem-backed uploads. It should **not** be treated as a serverless Vercel filesystem/database deployment.

## Recommended production layout

```text
Browser
  │
  ├── https://fikarnot-live.vercel.app/  → Vercel static frontend
  │
  └── VITE_API_URL → https://api.example.com → Node.js API
                                                   ├── persistent SQLite volume
                                                   └── persistent uploads volume
```

Set the following Vercel environment variable for the frontend:

```text
VITE_API_URL=https://<your-api-domain>
```

Do not put private backend secrets such as `RESEND_API_KEY` in Vercel's client-side environment variables.

For the API service, configure:

```text
NODE_ENV=production
FIKARNOT_FRONTEND_ORIGIN=https://fikarnot-live.vercel.app
FIKARNOT_APP_URL=https://fikarnot-live.vercel.app
SITE_URL=https://fikarnot-live.vercel.app
FIKARNOT_SEED_DEMO_DATA=0
FIKARNOT_ENABLE_MOCK_PAYMENTS=0
FIKARNOT_EXPOSE_RESET_LINKS=0
```

Use a durable filesystem/volume for `FIKARNOT_DATA_DIR` and its `uploads` directory. Run `npm run db:backup` before migrations or risky maintenance.

## SEO files

The build now refuses to silently generate production SEO output from seed/demo data when `SITEMAP_API_URL` is missing. In production builds, set:

```text
SITEMAP_API_URL=https://<your-api-domain>
```

The API also exposes a live `/sitemap.xml` route from the current database catalogue.

If the canonical public domain is later changed from the Vercel URL to a custom domain, update `SITE_URL`, `FIKARNOT_APP_URL`, Vercel `VITE_API_URL` as appropriate, and `public/robots.txt`/site metadata during the same deployment.
