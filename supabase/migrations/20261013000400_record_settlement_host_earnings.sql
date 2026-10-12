begin;

alter table public.phone_host_earnings_ledger
  drop constraint if exists phone_host_earnings_ledger_source_kind_check,
  add constraint phone_host_earnings_ledger_source_kind_check
    check (source_kind in ('minute', 'video_upgrade', 'settlement'));

create or replace function public.record_settlement_host_earnings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_row public.call_sessions;
begin
  if new.earnings_delta_paise <= 0 or new.call_session_id is null then
    return new;
  end if;

  select * into call_row
  from public.call_sessions
  where id = new.call_session_id;

  if not found or new.phone <> call_row.host_phone then
    return new;
  end if;

  insert into public.phone_host_earnings_ledger(
    host_phone, call_session_id, source_id, source_kind, call_type, earnings_paise
  ) values (
    call_row.host_phone, call_row.id, new.id, 'settlement',
    call_row.call_type, new.earnings_delta_paise
  ) on conflict (source_id) do nothing;

  return new;
end;
$$;

drop trigger if exists record_settlement_host_earnings on public.phone_wallet_ledger;
create trigger record_settlement_host_earnings
after insert on public.phone_wallet_ledger
for each row execute function public.record_settlement_host_earnings();

commit;
