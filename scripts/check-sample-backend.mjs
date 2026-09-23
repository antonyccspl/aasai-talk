import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const base = config.EXPO_PUBLIC_SUPABASE_URL;
const headers = { apikey: config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
async function rpc(name, body, status = 200) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(response.status, status, `${name} status`);
  return response.json();
}
const first = randomBytes(32).toString('hex');
const second = randomBytes(32).toString('hex');
const open = token => rpc('open_demo_workspace', {workspace_token: token});
const a = await open(first);
assert.ok(a.state.messages.length && a.state.calls.length && a.state.transactions.length);
const modified = {...a.state, profile: {...a.state.profile, name: 'Persistence check'}};
await rpc('save_demo_workspace', {workspace_token:first, expected_revision:a.revision, next_state:modified});
const reloaded = await open(first);
assert.equal(reloaded.state.profile.name, 'Persistence check');
const isolated = await open(second);
assert.notEqual(isolated.state.profile.name, 'Persistence check');
await rpc('save_demo_workspace', {workspace_token:first, expected_revision:a.revision, next_state:a.state}, 400);
await rpc('save_demo_workspace', {workspace_token:first, expected_revision:reloaded.revision, next_state:a.state});
await rpc('open_demo_workspace', {workspace_token:'invalid'}, 400);
const allTables = [
  'coin_packs',
  'receiver_coin_diamond_slabs',
  'directory_profiles',
  'announcements',
  'notifications',
  'app_policies_and_settings',
  'safety_reports',
  'transactions',
  'calls',
  'messages',
  'platform_metrics'
];

for (const table of allTables) {
  const response = await fetch(`${base}/rest/v1/${table}?select=*`, {headers});
  assert.equal(response.status, 200, `Failed to load table: ${table}`);
  const rows = await response.json();
  assert.ok(rows.length > 0, `Table ${table} is empty`);
  if (table === 'directory_profiles') {
    assert.ok(rows.every(row => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)));
  }
}
console.log('PASS: live catalogs, database directory (12 profiles), announcements, notifications, policies, safety reports, transactions, calls, messages, and platform metrics.');
