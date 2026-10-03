begin;

-- ₹1 purchases 3 coins. The catalog is loaded dynamically by the wallet.
with offers(sort_order, coins, price_paise) as (
  values
    (100, 450, 15000),
    (250, 750, 25000),
    (500, 1500, 50000),
    (750, 2250, 75000),
    (1000, 3000, 100000),
    (1500, 4500, 150000)
)
update public.coin_packs packs
set coins = offers.coins,
    price_paise = offers.price_paise
from offers
where packs.sort_order = offers.sort_order;

commit;
