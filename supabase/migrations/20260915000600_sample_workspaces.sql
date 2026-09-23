begin;
create schema if not exists demo_private;
revoke all on schema demo_private from public, anon, authenticated;
create table demo_private.templates (id text primary key, payload jsonb not null);
create table demo_private.workspaces (
  token_hash text primary key,
  state jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
revoke all on all tables in schema demo_private from public, anon, authenticated;
insert into demo_private.templates values ('default', $fixture${"people":[{"id":"priya","name":"Priya Patel","age":23,"gender":"Woman","city":"Delhi","languages":["Hindi","English"],"interests":["Late night talks","Poetry"],"bio":"A little poetry, a little indie music, and conversations that make you forget to check the time.","status":"Available","color":"#285647","photo":"https://lh3.googleusercontent.com/aida-public/AB6AXuCLMpZmgpUETRuSeQ4sWwRhI6hzr5B31dmEwX6nSmhKsZ85HZxgU7hGTiQjZFLAHQCGEkON6nSG6ZZcUx4wgpGNzs76rw_Z03myqZb8wKvr21mBzbNyqlsq0CTQ0XVlwx5J4OZXZjfahqCrSAWRq1GWxIEeW4cF2ZvCVaHe8pUpmXdK0b4CI3JM7KS1ogfpKeLifp0x0mEWs0H1QunejokNqpRvvQusiDAKtQE4_zPqKrr2XAA9lL8lIw"},{"id":"rohan","name":"Rohan Verma","age":24,"gender":"Man","city":"Mumbai","languages":["Hindi","English"],"interests":["Indie music","Travel"],"bio":"Collecting stories, photographs, and recommendations for my next adventure. What is yours?","status":"Available","color":"#42483b","photo":"https://lh3.googleusercontent.com/aida-public/AB6AXuDYGfY1XjtMQyNB8YGQj_UA75_D-QEO3sPJihznj8KYBwbcfYVMFiYkZDbnkaqx08wVGrpV-p6yqORKFLkV5BwdB9Gx_KbSKC83ZGwwZORxgvFktV-tDTri1ID5PDXfsfz35PSA0HUuzuoW-6RYmAeq3wuWTm9NWB9Rvq0CVM18__aXiuQh2AOJJuNZzFMWLOM6yuJyRy6Xo00mSKvDQraeoOfFhMy1xAl0QpUS4dQo9YWwKut-Lsx8Cw"},{"id":"ananya","name":"Ananya Rao","age":25,"gender":"Woman","city":"Bengaluru","languages":["English","Kannada"],"interests":["Books","Coffee"],"bio":"Currently reading three books at once. Always up for a thoughtful conversation.","status":"Busy","color":"#564858"},{"id":"arjun","name":"Arjun Mehta","age":26,"gender":"Man","city":"Pune","languages":["Hindi","English"],"interests":["Music","Movies"],"bio":"Tell me about the last film that stayed with you.","status":"Offline","color":"#554739"}],"state":{"signedIn":false,"photo":"","hostDraft":{"name":"","bio":"","languages":[],"interests":[],"audio":true,"video":true,"audioRate":"2","videoRate":"5","aadhaarDocument":"","panDocument":""},"hostStatus":"none","hostEarnings":850,"withdrawals":[{"id":"sample-withdrawal-1","amount":300,"method":"UPI","status":"Completed","date":"12 Sep"},{"id":"sample-withdrawal-2","amount":150,"method":"Bank account","status":"Processing","date":"10 Sep"}],"favorites":["priya"],"blocked":[],"profile":{"name":"Mahir","username":"mahir","bio":"Here for good conversations.","languages":["Hindi","English"],"interests":["Music","Travel"],"dob":"2000-06-15","gender":"Female","city":"Delhi"},"available":true,"paid":true,"later":false,"theme":"dark","balance":1250,"transactions":[{"id":"TX-2401","title":"Wallet recharge","amount":500,"date":"Today, 2:40 PM","kind":"Recharges","status":"Success"},{"id":"TX-2400","title":"Call with Priya","amount":-240,"date":"Yesterday · 12 mins","kind":"Calls","status":"Completed"},{"id":"TX-2399","title":"Call with Arjun","amount":-360,"date":"12 Sep · 18 mins","kind":"Calls","status":"Completed"}],"pack":500,"creditedOrders":[],"messages":[{"id":"1","user":"priya","mine":false,"text":"Hey! Loved chatting about indie music earlier. Have you heard that new acoustic track? 🎶","time":"04:18 PM"},{"id":"2","user":"priya","mine":true,"text":"Listening right now, the vocals are incredible! 🎧","time":"04:20 PM"},{"id":"3","user":"rohan","mine":false,"text":"Any travel plans for the weekend?","time":"Yesterday"}],"calls":[{"id":"call-1","person":"priya","type":"audio","status":"Ended","seconds":720},{"id":"call-2","person":"rohan","type":"video","status":"Missed","seconds":0,"incoming":true},{"id":"call-3","person":"arjun","type":"audio","status":"Ended","seconds":1080}],"read":[],"drafts":{},"prefs":{"Show online status":true,"Show last seen":true,"Allow messages":true,"Allow calls":true,"Message alerts":true,"Call alerts":true,"Payment updates":true,"Announcements":false},"filter":"All","facets":{"availability":"All","language":"All","gender":"All","interest":"All","minAge":"","maxAge":"","maxPrice":""},"search":"","reports":["Spam concern · Priya Patel","Profile concern · Arjun Mehta","Abusive behavior · Rohan Verma"],"notifications":[{"id":"n1","title":"A new conversation awaits","body":"Priya sent you a message.","path":"/chat/priya","icon":"message-circle"},{"id":"n2","title":"Missed video call","body":"Rohan tried to reach you.","path":"/calls/detail/call-2","icon":"video"},{"id":"n3","title":"Wallet recharged","body":"500 coins added.","path":"/wallet/transactions/TX-2401","icon":"credit-card"},{"id":"n4","title":"Welcome to Aasai Talk","body":"Find your people. Start with a hello.","path":"/explore","icon":"radio"}],"adminEdits":{},"audit":[],"chart":[65,100,85,135,115,155,143]}}$fixture$::jsonb);

create function public.open_demo_workspace(workspace_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare template jsonb; result jsonb; token_key text;
begin
  if workspace_token is null or workspace_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid workspace token'; end if;
  token_key := encode(extensions.digest(workspace_token, 'sha256'), 'hex');
  select payload into template from demo_private.templates where id = 'default';
  insert into demo_private.workspaces(token_hash, state) values (token_key, template->'state')
    on conflict do nothing;
  select jsonb_build_object('state',state,'revision',revision,'people',template->'people')
    into result from demo_private.workspaces where token_hash = token_key;
  return result;
end;
$$;
create function public.save_demo_workspace(workspace_token text, expected_revision bigint, next_state jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if workspace_token is null or workspace_token !~ '^[a-f0-9]{64}$'
     or next_state is null or jsonb_typeof(next_state) <> 'object'
     or octet_length(next_state::text) > 1048576 then raise exception 'Invalid workspace data'; end if;
  update demo_private.workspaces set state=next_state, revision=revision+1, updated_at=now()
    where token_hash=encode(extensions.digest(workspace_token,'sha256'),'hex') and revision=expected_revision
    returning revision into next_revision;
  if next_revision is null then raise exception 'Workspace changed. Reload before saving.'; end if;
  return next_revision;
end;
$$;
revoke all on function public.open_demo_workspace(text), public.save_demo_workspace(text,bigint,jsonb) from public;
grant execute on function public.open_demo_workspace(text), public.save_demo_workspace(text,bigint,jsonb) to anon, authenticated;
comment on schema demo_private is 'Isolated sample application data only. No production authentication or financial authority.';
commit;
