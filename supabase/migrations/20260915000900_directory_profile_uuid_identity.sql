-- A directory profile uses an opaque UUID. Display names are deliberately not unique.
begin;

alter table public.directory_profiles rename column id to legacy_directory_key;
alter table public.directory_profiles add column id uuid;
update public.directory_profiles set id = gen_random_uuid() where id is null;
alter table public.directory_profiles alter column id set not null;
alter table public.directory_profiles drop constraint directory_profiles_pkey;
alter table public.directory_profiles add primary key (id);

-- Reserved for the Firebase UID when real OTP login is introduced. It is an identity,
-- not a display name, and can be attached only once to a directory profile.
alter table public.directory_profiles add column firebase_uid text unique
  check (firebase_uid is null or length(firebase_uid) between 1 and 128);

-- Existing isolated app state referenced the old temporary keys. Preserve those links
-- while changing all profile references to their new opaque UUIDs.
do $$
declare record_row record;
begin
  for record_row in select legacy_directory_key, id from public.directory_profiles loop
    update demo_private.templates
      set payload = replace(payload::text, to_jsonb(record_row.legacy_directory_key)::text, to_jsonb(record_row.id::text)::text)::jsonb
      where id = 'default';
    update demo_private.workspaces
      set state = replace(state::text, to_jsonb(record_row.legacy_directory_key)::text, to_jsonb(record_row.id::text)::text)::jsonb;
  end loop;
end;
$$;

alter table public.directory_profiles drop column legacy_directory_key;

comment on column public.directory_profiles.id is 'Opaque stable directory profile UUID. Never derive this from a name.';
comment on column public.directory_profiles.firebase_uid is 'Future Firebase Auth UID ownership reference; display_name is intentionally non-unique.';
commit;
