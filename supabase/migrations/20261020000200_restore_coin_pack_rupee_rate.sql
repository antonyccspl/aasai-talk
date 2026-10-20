  begin;

  -- Restore the configured base rate to 1.5 coins per rupee. Special-offer
  -- bonuses remain separate from the base coin value.
  update public.coin_packs as pack
  set
    coins = desired.coins,
    bonus_coins = 0,
    price_paise = desired.price_paise,
    active = true,
    is_special = false,
    special_label = null
  from (
    values
      (50, 75.0::numeric, 5000),
      (100, 150.0::numeric, 10000),
      (250, 300.0::numeric, 20000),
      (300, 450.0::numeric, 30000),
      (750, 1125.0::numeric, 75000),
      (500, 750.0::numeric, 50000),
      (1000, 1500.0::numeric, 100000),
      (2000, 3000.0::numeric, 200000)
  ) as desired(sort_order, coins, price_paise)
  where pack.is_special = false
    and pack.sort_order = desired.sort_order;

  insert into public.coin_packs (
    coins, bonus_coins, price_paise, active, sort_order, is_special, special_label
  )
  select 450.0, 0.0, 30000, true, 300, false, null
  where not exists (
    select 1 from public.coin_packs
    where is_special = false and sort_order = 300
  );

  update public.coin_packs as pack
  set
    coins = desired.coins,
    bonus_coins = desired.bonus_coins,
    price_paise = desired.price_paise,
    active = true,
    is_special = true,
    special_label = 'Special offer'
  from (
    values
      (510, 750.0::numeric, 75.0::numeric, 50000),
      (1010, 1500.0::numeric, 225.0::numeric, 100000),
      (2010, 3000.0::numeric, 600.0::numeric, 200000)
  ) as desired(sort_order, coins, bonus_coins, price_paise)
  where pack.is_special = true
    and pack.sort_order = desired.sort_order;

  update public.coin_packs
  set active = false
  where active = true
    and (
      (is_special = false and sort_order not in (50, 100, 250, 300, 500, 750, 1000, 2000))
      or (is_special = true and sort_order not in (510, 1010, 2010))
    );

  update public.app_policies_and_settings
  set content = jsonb_set(content, '{coins_per_rupee}', '1.5'::jsonb, true),
      updated_at = now()
  where key = 'app_config';

  commit;
