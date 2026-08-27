# FikarNot v1.8.0 — Operations & Security Hardening

This release closes the non-payment-provider operational gaps identified in the final prelaunch audit.

## Included

- Staff/editor TOTP two-factor authentication with authenticator-app setup.
- Staff login now requires the 6-digit TOTP after password verification when 2FA is enabled.
- Staff 2FA enable/disable actions are audit logged.
- `/healthz` reports service health and process uptime.
- Optional operational error webhook for centralized alerts (`FIKARNOT_ERROR_WEBHOOK_URL`).
- Scheduled Docker backup sidecar with retention and optional off-box PUT upload.
- Restore-drill command with a safety copy of the existing database.
- External health-check script and a five-minute GitHub Actions monitor.
- Deployment documentation for persistent API storage and off-box backup requirements.

## Production notes

Configure the API on persistent infrastructure. Do not rely on ephemeral frontend hosting for the SQLite database or uploads.

Enable 2FA for every admin/editor account before launch. Store the TOTP secret only through the protected settings flow; never commit it to source control.

For off-box backups, configure a private upload endpoint with `FIKARNOT_BACKUP_UPLOAD_URL` and `FIKARNOT_BACKUP_UPLOAD_TOKEN`. Test restoration with `npm run db:restore /path/to/backup.sqlite` on a maintenance instance before launch.

Set `FIKARNOT_HEALTHCHECK_URL` in GitHub repository secrets to the public API `/healthz` URL so the scheduled monitor can detect downtime.
