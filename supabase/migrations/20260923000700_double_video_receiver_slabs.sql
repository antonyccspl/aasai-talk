begin;

update public.receiver_coin_diamond_slabs
set diamonds_per_minute = case min_minutes
  when 0 then 4.00
  when 15 then 6.00
  when 45 then 8.00
  else diamonds_per_minute
end,
updated_at = now()
where call_type = 'VIDEO'
  and min_minutes in (0, 15, 45);

commit;
