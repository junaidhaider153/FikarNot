-- 0009_media_bucket_security.sql
-- Sets file_size_limit and allowed_mime_types on the media storage bucket (and payment-proofs bucket)
-- to enforce upload constraints at the database storage level.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
