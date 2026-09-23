-- Public pricing catalog, including the app's current pre-authentication flow.
-- Client writes remain revoked; inactive configurations remain hidden.
begin;
grant select on public.receiver_coin_diamond_slabs to anon;
create policy public_read_active_slabs on public.receiver_coin_diamond_slabs
for select to anon using (is_active = true);
commit;
