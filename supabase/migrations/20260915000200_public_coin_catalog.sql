-- Coin packs are a public product catalog. Private user data remains protected.
begin;
grant select on public.coin_packs to anon;
create policy public_active_coin_packs on public.coin_packs
for select to anon using (active);
commit;
