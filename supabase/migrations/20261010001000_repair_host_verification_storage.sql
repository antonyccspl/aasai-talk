begin;

-- A test-data reset can remove Storage metadata while the schema migration
-- history remains. Restore this private bucket idempotently for Host document uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'host-verification',
  'host-verification',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
