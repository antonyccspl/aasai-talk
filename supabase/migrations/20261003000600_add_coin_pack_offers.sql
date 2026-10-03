begin;

-- ₹1 purchases 3 coins. Add entry and premium offers without changing the
-- existing six products or their stable sort order.
insert into public.coin_packs (coins, price_paise, active, sort_order)
select offer.coins, offer.price_paise, true, offer.sort_order
from (values
  (300, 10000, 50),
  (6000, 200000, 2000)
) as offer(coins, price_paise, sort_order)
where not exists (
  select 1 from public.coin_packs existing
  where existing.sort_order = offer.sort_order
);

commit;
