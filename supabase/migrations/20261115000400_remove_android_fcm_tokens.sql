begin;

delete from public.phone_push_tokens
where platform = 'android';

commit;
