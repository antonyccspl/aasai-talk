begin;

alter table public.phone_content_moderation_items
  add column if not exists content_sha256 text,
  add column if not exists media_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phone_content_moderation_content_sha256_format'
      and conrelid = 'public.phone_content_moderation_items'::regclass
  ) then
    alter table public.phone_content_moderation_items
      add constraint phone_content_moderation_content_sha256_format
      check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'phone_content_moderation_media_type'
      and conrelid = 'public.phone_content_moderation_items'::regclass
  ) then
    alter table public.phone_content_moderation_items
      add constraint phone_content_moderation_media_type
      check (media_type is null or media_type in ('image/jpeg', 'image/png', 'image/webp'));
  end if;
end
$$;

create unique index if not exists phone_content_moderation_owner_sha256_idx
  on public.phone_content_moderation_items(owner_phone, content_type, content_sha256)
  where content_sha256 is not null and status = 'needs_review';

commit;
