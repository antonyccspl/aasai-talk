import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let context, pendingResume, block=false;
const sources=[], listeners={}, timers=new Map();let timerId=0;
class AudioContext {
 state='suspended'; sampleRate=8000; currentTime=0; destination={};
 constructor(){context=this;}
 resume(){ if(block)return new Promise(resolve=>{pendingResume=()=>{this.state='running';resolve()}});this.state='running';return Promise.resolve(); }
 createBuffer(_,length){const data=new Float32Array(length);return {getChannelData:()=>data};}
 createBufferSource(){const source={loop:false,buffer:null,start(){this.started=true},stop(){this.stopped=true},connect(){},disconnect(){this.disconnected=true}};sources.push(source);return source;}
}
const runtime=vm.createContext({exports:{},Platform:{OS:'web'},NativeModules:{},AudioContext,console,document:{addEventListener:(event,fn)=>{listeners[event]=fn}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)});
vm.runInContext(ts.transpile(fs.readFileSync('src/data/call-sounds.ts','utf8').replace(/^import .*;\r?\n/,''),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),runtime);
const api=runtime.exports;
await api.startCallSound('incoming',true,true);
assert.equal(sources[0].loop,true);assert.equal(sources[0].started,true);
assert.ok(sources[0].buffer.getChannelData(0).some(value=>Math.abs(value)>0.2));
assert.equal(timers.size,0,'loop does not depend on JS timers');
await api.stopAllCallSounds();assert.equal(sources[0].stopped,true);
block=true;const blocked=api.startCallSound('blocked',true,true);
for(const fn of [...timers.values()])fn();
await assert.rejects(blocked,/Enable ringtone/);
block=false;listeners.click();await api.startCallSound('retry',true,true);
assert.equal(sources.at(-1).started,true);
await api.stopAllCallSounds();
block=true;const cancelled=api.startCallSound('cancelled',true,true);await api.stopCallSound('cancelled');pendingResume();assert.equal(await cancelled,false);
assert.ok(sources.every(source=>source.stopped),'no ringtone survives cancellation');
console.log('PASS: audible looping ringtone, no repeat timer, autoplay timeout, gesture retry, cancellation and stop-all');
