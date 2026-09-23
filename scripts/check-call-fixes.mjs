import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Validate Token04 encoding against a known local test secret, never live credentials.
const source = readFileSync(new URL('../supabase/functions/zego-token/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').split('Deno.serve(')[0];
const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder, btoa, Uint8Array });
vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022 }), context);
const secret = '12345678901234567890123456789012';
assert.equal(vm.runInContext(`decodeServerSecret('${'a'.repeat(64)}')`, context), null, 'AppSign must not be accepted as ServerSecret');
const token = await vm.runInContext(`generateToken04(12345, 'u_test', decodeServerSecret('${secret}'), 'room-test')`, context);
assert.equal(token.slice(0, 2), '04');
const binary = Buffer.from(token.slice(2), 'base64');
const expiry = Number(binary.readBigInt64BE(0));
const ivLength = binary.readUInt16BE(8);
assert.equal(ivLength, 16);
const encryptedLength = binary.readUInt16BE(10 + ivLength);
const encrypted = binary.subarray(12 + ivLength);
assert.equal(encrypted.length, encryptedLength);
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'AES-CBC', false, ['decrypt']);
const decoded = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-CBC', iv: binary.subarray(10, 10 + ivLength)}, key, encrypted)));
assert.equal(decoded.app_id, 12345);
assert.equal(decoded.user_id, 'u_test');
assert.equal(decoded.expire, expiry);
assert.equal(JSON.parse(decoded.payload).room_id, 'room-test');
assert.deepEqual(JSON.parse(decoded.payload).privilege, {'1':1, '2':1});
await assert.rejects(vm.runInContext(`generateToken04(12345, 'u_test', 'invalid', 'room-test')`, context));
console.log('PASS: Token04 encryption, envelope, room privileges and invalid-secret rejection');

if (process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const headers = {apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json'};
  const response = await fetch(`${base}/rest/v1/rpc/get_phone_call_status`, {
    method:'POST', headers, body:JSON.stringify({input_session_id:'00000000-0000-0000-0000-000000000000',input_phone:'+910000000000'})
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.message, 'Call session not found');
  const denied = await fetch(`${base}/rest/v1/call_sessions?select=id&limit=1`, {headers});
  assert.ok([401,403].includes(denied.status), 'Call table must stay private');
  console.log('PASS: deployed participant status RPC and private call table');
}
