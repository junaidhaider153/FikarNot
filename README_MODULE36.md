# FikarNot Module 36/1.6.5 — Media Storage, SEO & Production Hardening

This module hardens the existing local persistent media storage used by FikarNot.

- Uploaded product/storefront images are stored as files under the backend uploads directory, with metadata in SQLite.
- Duplicate uploaded files are de-duplicated by SHA-256.
- Existing legacy upload files are discovered at startup and registered in the media library when safe.
- Admin-only media library: `/admin/media`.
- Images currently referenced by products or site settings cannot be deleted.
- Admin can clean unused uploaded media from the media library.
- Store settings support uploading the hero image from a device as well as entering a URL.
- Uploads use MIME allowlisting, magic-byte validation, size limits, safe filenames, and long-lived immutable cache headers.
- Local persistent disk storage is suitable for a single-instance deployment; object storage (S3/Supabase Storage/Cloudinary) remains the scale-out option.


Production deployment guidance is documented in `DEPLOYMENT_VERCEL.md`. Production SEO builds now fail loudly when a live catalogue API is not configured instead of silently using demo data.
