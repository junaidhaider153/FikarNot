# FikarNot Module 35 vs Module 36 — QA Review

## Baseline
Module 36 is the stronger baseline. Its added media-library, media metadata, deduplication, test-port allocation, backup script, Docker support and production configuration checks are retained.

## Regressions corrected in 1.6.5
- Restored Module 35's production fail-loud behavior for `generate-sitemap.js`.
- Restored Module 35's production fail-loud behavior for `prerender-seo.js`.
- Restored the four SEO build regression tests.
- Added `SITE_URL` as a required HTTPS production setting.
- Added explicit Vercel architecture guidance: Vercel is suitable for the frontend, while the stateful Node/SQLite/upload backend needs a separate persistent service.
- Bumped the project version to 1.6.5.

## Verified
- Backend/API/media/order/catalogue/sitemap test suite: 40/40 passing.
- Node syntax checks: passing for all operational `.js`/`.mjs` scripts checked.
- Production configuration checker: passes with valid HTTPS configuration and rejects an HTTP `SITE_URL`.

## Remaining deployment requirement
The repository does not contain a serverless Vercel implementation for the Node/SQLite backend. A Vercel frontend deployment therefore needs `VITE_API_URL` pointing at the separately deployed API service. Persistent SQLite and uploaded files must remain on durable backend storage.

## Submission assessment
For an academic/software-project submission: strong and suitable once the local `npm run verify` build completes successfully.

For a public commercial launch: not yet complete until the frontend/API deployment topology, persistent backend storage, real payment provider, transactional email, backups and monitoring are configured.
