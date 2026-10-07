begin;

-- User media is held privately until a server-side moderation decision is made.
-- KYC documents deliberately remain outside this workflow.
create table if not exists public.phone_content_moderation_items (
  id uuid primary key default gen_random_uuid(),
  owner_phone text not null references public.phone_identities(phone) on delete cascade,
  content_type text not null check (content_type in ('profile_photo', 'chat_image', 'video_upload', 'live_call_incident')),
  storage_bucket text,
  storage_path text,
  public_url text,
  scan_provider text not null default 'manual',
  adult_likelihood text,
  racy_likelihood text,
  provider_result jsonb,
  status text not null default 'pending_scan' check (status in ('pending_scan', 'approved', 'needs_review', 'rejected', 'removed')),
  decision_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);
create index if not exists phone_content_moderation_owner_created_idx
  on public.phone_content_moderation_items(owner_phone, created_at desc);
create index if not exists phone_content_moderation_queue_idx
  on public.phone_content_moderation_items(status, created_at asc);

alter table public.phone_content_moderation_items enable row level security;
revoke all on public.phone_content_moderation_items from public, anon, authenticated;
grant all on public.phone_content_moderation_items to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moderation-media', 'moderation-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Public reads are retained only for approved profile photos. Uploads now go
-- through the content-moderation Edge Function using the service role.
drop policy if exists host_photos_public_upload on storage.objects;
drop policy if exists host_photos_public_update on storage.objects;

commit;
