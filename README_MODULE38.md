# FikarNot Module 38 — CI/CD & Deployment

This checkpoint prepares the project for repeatable deployment without changing the storefront color scheme.

## Highlights

- CI now runs the complete `npm run verify` pipeline and builds both API and frontend containers.
- `Dockerfile` builds the backend image.
- `Dockerfile.web` builds the Vite frontend and serves it with Nginx.
- `docker-compose.yml` runs the API and web tiers together with a persistent SQLite/upload volume.
- Nginx handles SPA history fallback and proxies `/api`, `/uploads`, and `/sitemap.xml` to the API.
- `deploy/.env.production.example` documents production configuration.

## Local container smoke test

1. Copy `deploy/.env.production.example` to `.env` and replace placeholder secrets.
2. Run `docker compose up -d --build`.
3. Open `http://localhost:8080`.
4. Check `http://localhost:8080/health` and `http://localhost:8080/api/health`.
5. Stop with `docker compose down`.

The SQLite/upload data persists in the `fikarnot_data` named volume.
