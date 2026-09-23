import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const timers = new Set();
let rpc;
const channel = {on() { return this; }, subscribe() { return this; }};
const context = vm.createContext({
  exports: {}, console,
  supabase: {rpc: (...args) => rpc(...args), channel: () => channel, removeChannel: async () => {}},
  setInterval: fn => { timers.add(fn); return fn; },
  clearInterval: fn => timers.delete(fn),
});
const source = readFileSync(new URL('../src/data/call-sessions.ts', import.meta.url), 'utf8')
  .replace('import { supabase } from "./supabase";', '');
vm.runInContext(ts.transpile(source, {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}), context);
const api = context.exports;
const flush = () => new Promise(resolve => setImmediate(resolve));

rpc = async name => ({error: null, data: name === 'get_phone_call_status' ? 'cancelled' : null});
await assert.rejects(api.updatePhoneCall('session', '+910000000000', 'connected'), /already ended/);
rpc = async name => ({error: null, data: name === 'get_phone_call_status' ? 'connected' : null});
await api.updatePhoneCall('session', '+910000000000', 'connected');
console.log('PASS: accepted calls proceed; cancelled calls cannot be accepted');

let resolvePoll;
let requests = 0;
rpc = () => { requests++; return new Promise(resolve => { resolvePoll = resolve; }); };
const invitations = [];
const stop = api.subscribeToIncomingCalls('+910000000000', call => invitations.push(call));
for (const tick of timers) { tick(); tick(); }
assert.equal(requests, 1, 'Incoming requests must not overlap');
stop();
resolvePoll({error:null, data:{id:'late',caller_phone:'+910000000001',call_type:'audio',room_id:'room'}});
await flush();
assert.equal(invitations.length, 0, 'Ignore late responses after unsubscribe');
assert.equal(timers.size, 0);
console.log('PASS: overlapping poll prevention and late-response cleanup');

const statuses = [];
let current = 'ringing';
rpc = async () => ({error:null, data:current});
const stopStatus = api.subscribeToPhoneCall('session', '+910000000000', value => statuses.push(value));
await flush();
for (const tick of timers) tick();
await flush();
current = 'cancelled';
for (const tick of timers) tick();
await flush();
assert.deepEqual(statuses, ['ringing', 'cancelled']);
stopStatus();
assert.equal(timers.size, 0);
console.log('PASS: caller cancellation delivered without duplicate status notifications');
