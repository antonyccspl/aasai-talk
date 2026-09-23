import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Minimal hook harness exercises the real component without a native device.
let cursor = 0;
const slots = [];
const effects = [];
const React = {
  createElement: () => null,
  useRef: initial => { const i=cursor++; return slots[i] ??= {current:initial}; },
  useState: initial => { const i=cursor++; slots[i] ??= {value:initial}; return [slots[i].value, value => {slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;}]; },
  useEffect: (fn, deps) => {
    const i=cursor++;
    const old=slots[i];
    if (!old || deps.some((value,n) => !Object.is(value,old.deps[n]))) {
      effects.push(() => {old?.cleanup?.(); slots[i]={deps,cleanup:fn()};});
    }
  },
};
let creates=0, destroys=0;
const actions=[];
const handlers={};
const engine = new Proxy({}, {get: (_target,name) => {
  if(name==='then') return undefined;
  if(name==='on') return (event,fn) => {handlers[event]=fn;};
  return async (...args) => {actions.push([name,...args]); return name==='loginRoom' ? {errorCode:0} : name==='setAudioSource' ? 0 : undefined;};
}});
const zego = {
  default:{createEngineWithProfile:async()=>{creates++; return engine;},destroyEngine:async()=>{destroys++;}},
  ZegoEngineProfile:class {}, ZegoUser:class {}, ZegoRoomConfig:class {},
  ZegoScenario:{StandardVideoCall:1,StandardVoiceCall:2},
  ZegoAudioSourceType:{Microphone:4}, ZegoUpdateType:{Add:0},
  ZegoPublisherState:{Publishing:2,NoPublish:0}, ZegoPlayerState:{Playing:2,NoPlay:0},
};
const context=vm.createContext({exports:{},console,__DEV__:false,require:name=>{
  if(name==='react')return {...React,default:React};
  if(name==='react-native')return {Platform:{OS:'ios'},StyleSheet:{create:x=>x,absoluteFill:{}},findNodeHandle:()=>null};
  if(name==='@/data/zego')return {fetchZegoCallToken:async()=>({appId:1,userId:'test',roomId:'room',token:'test'})};
  if(name==='zego-express-engine-reactnative')return zego;
  throw new Error(name);
}});
vm.runInContext(ts.transpile(readFileSync(new URL('../src/ui/zego-media.tsx',import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}),context);
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
let statuses=[];
const props={sessionId:'session',phone:'+910000000000',video:false,muted:false,camera:false,front:true,speaker:true,onStatus:value=>statuses.push(value),onError:()=>{}};
function render(value){cursor=0;context.exports.ZegoMedia(value);while(effects.length)effects.shift()();}
render(props);await flush();
assert.equal(creates,1);
for(let i=0;i<5;i++){render({...props,onError:()=>{},onStatus:value=>statuses.push(value)});await flush();}
assert.equal(creates,1,'Timer/callback rerenders must not recreate the engine');
assert.equal(destroys,0);
assert.ok(actions.some(([name,value])=>name==='setAudioSource'&&value===4));
assert.ok(actions.some(([name,value])=>name==='muteSpeaker'&&value===false));
assert.ok(!statuses.includes('Connected'),'Command completion is not proof of two-way media');
handlers.publisherStateUpdate('local',2,0);
handlers.playerStateUpdate('remote',2,0);
assert.equal(statuses.at(-1),'Connected');
render({...props,muted:true});await flush();
assert.equal(creates,1);
assert.ok(actions.some(([name,value])=>name==='muteMicrophone'&&value===true));
for(const slot of slots)slot?.cleanup?.();await flush();
assert.equal(destroys,1);
console.log('PASS: stable RTC across timer/callback rerenders, audio source, mute controls, real connection state and cleanup');
