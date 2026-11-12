import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const handlers = {}, shown = [], navigated = [];
let existing = [];
const context = vm.createContext({ console, URL, Date, self: {
  location: { origin: 'https://example.test' },
  addEventListener: (name, handler) => { handlers[name] = handler; },
  clients: { matchAll: async () => existing, openWindow: async url => navigated.push(url), claim: async () => {} },
  registration: { showNotification: async (title, options) => shown.push({ title, options }) },
  skipWaiting: async () => {},
} });
vm.runInContext(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), context);
const push = async payload => {
  let work;
  handlers.push({ data: { json: () => payload }, waitUntil: promise => { work = promise; } });
  await work;
};
const payload = { type: 'incoming_call', callId: 'call-1', title: 'Incoming call', body: 'Caller is calling', route: '/calls/incoming/phone_123?session=call-1&type=audio', expiresAt: new Date(Date.now()+60000).toISOString() };
await push(payload);
assert.equal(shown.length,1);
assert.equal(shown[0].options.actions.length,2);
assert.equal(shown[0].options.silent,false);
await push({ ...payload, expiresAt: new Date(Date.now()-1).toISOString() });
assert.equal(shown.length,1,'expired push is ignored');
const click = async (action, expiresAt=payload.expiresAt) => {
  let work;
  handlers.notificationclick({ action, notification: { close(){}, data: {route:payload.route,expiresAt} }, waitUntil: promise => { work=promise; } });
  await work;
};
await click('accept'); assert.equal(new URL(navigated.at(-1)).searchParams.get('autoAnswer'),'true');
await click('reject'); assert.equal(new URL(navigated.at(-1)).searchParams.get('autoReject'),'true');
existing=[{url:'https://example.test/explore',navigate:async url=>navigated.push(url),focus:async()=>{}}];
await click(''); assert.equal(new URL(navigated.at(-1)).pathname,'/calls/incoming/phone_123');
await click('accept',new Date(0).toISOString()); assert.equal(navigated.at(-1),'https://example.test/calls');
console.log('PASS: service-worker alerts, caller route, Accept/Reject actions, reuse/open window, expired notification');

let result={sent:0};
const client=vm.createContext({exports:{},console,AbortSignal,Platform:{OS:'web'},supabaseUrl:'https://example.test',supabasePublishableKey:'public',fetch:async()=>({ok:true,json:async()=>result})});
const source=readFileSync(new URL('../src/data/push-notifications.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),client);
await assert.rejects(client.exports.sendPushEvent('token','incoming_call','call-1'),/unreachable/);
result={sent:1}; await client.exports.sendPushEvent('token','incoming_call','call-1');
result={sent:0}; await client.exports.sendPushEvent('token','message','message-1');
console.log('PASS: unavailable call push fails; successful push and existing message behavior preserved');

let beats=0, timer, cleanup;
const layout=readFileSync(new URL('../src/app/_layout.tsx',import.meta.url),'utf8');
const lifecycle=layout.slice(layout.indexOf('function PresenceLifecycle()'),layout.indexOf('function AppNavigator()'));
const lifecycleContext=vm.createContext({console,Platform:{OS:'web'},AppState:{currentState:'background',addEventListener:()=>({remove(){}})},document:{visibilityState:'hidden',addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},useAuth:()=>({demoPhone:'+919000000001',getIdentityToken:async()=>'token',authenticated:true,loading:false}),useEffect:fn=>{cleanup=fn()},sendPresenceHeartbeat:async()=>{beats++},setInterval:fn=>{timer=fn;return 1},clearInterval(){}});
vm.runInContext(ts.transpile(lifecycle+'\nPresenceLifecycle();',{target:ts.ScriptTarget.ES2022}),lifecycleContext);
await new Promise(r=>setImmediate(r)); assert.equal(beats,1,'hidden web still heartbeats');
timer(); await new Promise(r=>setImmediate(r)); assert.equal(beats,2);
cleanup(); timer(); await new Promise(r=>setImmediate(r)); assert.equal(beats,2,'unmounted lifecycle stops heartbeats');
console.log('PASS: minimized/hidden browser heartbeat and lifecycle cleanup');

// Execute the actual Edge Function handler with isolated providers and database adapters.
let serve, sentWeb = 0, onlineHost = true, pushFails = false, nativeFails = false;
let subscriptions = [{endpoint:'https://fcm.googleapis.com/test',auth:'a',p256dh:'b'}];
let devices = [], mutations = [];
const fakeAdmin = {
  rpc: async () => ({data:onlineHost,error:null}),
  from(table) {
    let operation='select', update;
    const query = {
      select(){return query}, eq(){return query}, maybeSingle(){return query},
      insert(value){operation='insert';update=value;return query},
      update(value){operation='update';update=value;return query},
      delete(){operation='delete';return query},
      then(resolve,reject){
        if(operation!=='select') mutations.push({table,operation,update});
        let data=null;
        if(operation==='select') {
          if(table==='call_sessions') data={id:'call-1',caller_phone:'+919000000002',host_phone:'+919000000001',call_type:'audio',status:'ringing',created_at:new Date().toISOString()};
          if(table==='phone_host_presence') data={accepting_calls:true};
          if(table==='phone_profiles') data={display_name:'Caller'};
          if(table==='phone_push_tokens') data=devices;
          if(table==='phone_web_push_subscriptions') data=subscriptions;
        }
        return Promise.resolve({data,error:null}).then(resolve,reject);
      },
    };
    return query;
  },
};
const edge = vm.createContext({Response,URL,Date,console:{error(){}},createClient:()=>fakeAdmin,verifyFirebasePhoneToken:async()=>({phone:'+919000000002'}),webpush:{sendNotification:async()=>{if(pushFails)throw {statusCode:410}; sentWeb++}},fetch:async()=>{if(nativeFails)throw new Error('native unavailable');return {ok:true,json:async()=>({data:{status:'ok'}})}},Deno:{serve:fn=>{serve=fn},env:{get:key=>key==='WEB_PUSH_VAPID_PUBLIC_KEY'?'a'.repeat(87):key==='WEB_PUSH_VAPID_PRIVATE_KEY'?'b'.repeat(43):'test'}}});
const edgeSource=readFileSync(new URL('../supabase/functions/push-notifications/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(ts.transpile(edgeSource,{target:ts.ScriptTarget.ES2022}),edge);
const dispatch=()=>serve(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'send',event:'incoming_call',event_id:'call-1'})}));
let response=await dispatch();assert.equal(response.status,200);assert.equal((await response.json()).sent,1);
assert.equal(sentWeb,1);
subscriptions=[];mutations=[];response=await dispatch();assert.equal((await response.json()).sent,0);assert.ok(mutations.some(m=>m.table==='call_sessions'&&m.update?.status==='missed'));
subscriptions=[{endpoint:'https://fcm.googleapis.com/test',auth:'a',p256dh:'b'}];
pushFails=true;mutations=[];response=await dispatch();assert.equal(response.status,500);assert.ok(mutations.some(m=>m.table==='phone_web_push_subscriptions'&&m.operation==='delete'));assert.ok(mutations.some(m=>m.table==='call_sessions'&&m.update?.status==='missed'));
pushFails=false;nativeFails=true;devices=[{platform:'android',expo_push_token:'test'}];response=await dispatch();assert.equal(response.status,200);assert.equal((await response.json()).sent,1);
onlineHost=false;response=await dispatch();assert.equal(response.status,409);
console.log('PASS: Edge Function success, missing subscriptions, expired endpoint cleanup, failed dispatch, mixed-provider success, expired host');
