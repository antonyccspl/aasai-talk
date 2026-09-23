begin;
-- Sample rates requested for development. Existing configured rows are preserved.
-- Current catalog: 100 coins costs INR 200, hence 0.50 coins per rupee.
insert into public.receiver_coin_diamond_slabs
  (call_type, diamonds_per_minute, coins_per_diamond, coins_per_rupee)
values ('AUDIO', 2.00, 10.00, 0.50), ('VIDEO', 5.00, 10.00, 0.50)
on conflict (call_type) do nothing;
commit;
