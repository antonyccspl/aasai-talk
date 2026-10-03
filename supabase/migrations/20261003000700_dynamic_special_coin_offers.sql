begin;

-- Promotions remain ordinary catalog rows so future admin tools can activate,
-- schedule, relabel, or retire them without changing the app.
alter table public.coin_packs
  add column if not exists bonus_coins integer not null default 0 check (bonus_coins >= 0),
  add column if not exists is_special boolean not null default false,
  add column if not exists special_label text,
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz,
  add constraint coin_packs_offer_window_check
    check (available_until is null or available_from is null or available_until > available_from);

insert into public.coin_packs (
  coins, price_paise, active, sort_order, bonus_coins, is_special, special_label
)
select offer.coins, offer.price_paise, true, offer.sort_order,
  offer.bonus_coins, true, 'Special offer'
from (values
  (1650, 50000, 150, 510),
  (3450, 100000, 450, 1010),
  (7200, 200000, 1200, 2010)
) as offer(coins, price_paise, bonus_coins, sort_order)
where not exists (
  select 1 from public.coin_packs existing
  where existing.is_special and existing.sort_order = offer.sort_order
);

commit;
