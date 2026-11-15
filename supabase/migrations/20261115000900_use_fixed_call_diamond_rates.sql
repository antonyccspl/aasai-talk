begin;

update public.receiver_coin_diamond_slabs
set is_active = false,
    updated_at = now()
where min_minutes > 0;

update public.receiver_coin_diamond_slabs
set diamonds_per_minute = case call_type
      when 'AUDIO' then 2.00
      when 'VIDEO' then 4.00
    end,
    max_minutes = null,
    is_active = true,
    updated_at = now()
where min_minutes = 0
  and call_type in ('AUDIO', 'VIDEO');

do $$
begin
  if (
    select count(*)
    from public.receiver_coin_diamond_slabs
    where is_active
  ) <> 2 then
    raise exception 'Expected exactly two active fixed call-rate rows';
  end if;

  if exists (
    select 1
    from public.receiver_coin_diamond_slabs
    where is_active
      and (
        (call_type = 'AUDIO' and diamonds_per_minute <> 2.00)
        or (call_type = 'VIDEO' and diamonds_per_minute <> 4.00)
        or min_minutes <> 0
        or max_minutes is not null
      )
  ) then
    raise exception 'Active call rates must remain fixed at 2/4 hearts per minute';
  end if;
end;
$$;

commit;
