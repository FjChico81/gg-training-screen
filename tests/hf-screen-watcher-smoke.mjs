import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFScreenWatcher} from '../src/hf-screen-watcher.mjs';
import {createHFRuntime,commandHFRuntime} from '../src/hf-class-runtime.mjs';

const plan={guided:[{name:'Burpees',target:'12 rep',seconds:0}]};
const date='2026-11-21T14:00:00.000Z';
const screen={user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},access_token:'SCREEN_FAKE'};
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const first={id,revision:0,public_plan:plan,runtime:createHFRuntime('guided',plan)};
const row=(revision=0)=>({...first,revision});
function fixture(client,extra={}) {
  const scheduled=new Map();let sequence=0;
  const states=[],events=[];
  const observer=createHFScreenWatcher({
    client,session:screen,id,
    periodMs:500,staleAfter:2,
    clock:()=>new Date(date),
    schedule:(fn)=>{const key=++sequence;scheduled.set(key,fn);return key;},
    cancel:id=>scheduled.delete(id),
    onSnapshot:x=>states.push(x),
    onStale:()=>events.push('stale'),
    onRecovered:()=>events.push('recovered'),
    onDisconnected:reason=>events.push(reason),
    onError:()=>events.push('error'),
    ...extra
  });
  async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
  async function pulse(){
    const current=[...scheduled.entries()][0];
    assert.ok(current,'expected a scheduled retry');
    scheduled.delete(current[0]);current[1]();await settle();
  }
  return {observer,states,events,scheduled,settle,pulse};
}
test('a screen polls read-only and does not repeat unchanged revisions',async()=>{
  const calls=[];
  const f=fixture({getSession:async(s,sid)=>{calls.push([s,sid]);return row();}});
  assert.equal(f.observer.start(),true);
  await f.settle();
  assert.equal(f.states.length,1);
  assert.equal(f.states[0].revision,0);
  await f.pulse();
  assert.equal(f.states.length,1);
  assert.equal(calls.length,2);
  assert.equal(calls[0][0].access_token,'SCREEN_FAKE');
  assert.equal(calls[0][1],id);
  f.observer.stop();
  assert.equal(f.scheduled.size,0);
});
test('a remote revision change updates the screen and catches up from UTC',async()=>{
  let result=row();
  const f=fixture({getSession:async()=>result});
  f.observer.start();await f.settle();
  const updated=commandHFRuntime(result.runtime,plan,'start',date);
  result={...result,revision:1,runtime:updated};
  await f.pulse();
  assert.equal(f.states.length,2);
  assert.equal(f.states.at(-1).revision,1);
  assert.equal(f.states.at(-1).presentation.phase,'work');
  f.observer.stop();
});
test('temporary network faults mark stale, then recovery emits even same revision',async()=>{
  let bad=false;
  const f=fixture({getSession:async()=>{if(bad)throw Error('offline');return row();}});
  f.observer.start();await f.settle();
  bad=true;
  await f.pulse();await f.pulse();
  assert.equal(f.observer.status.stale,true);
  assert.deepEqual(f.events.filter(x=>x==='stale'),['stale']);
  bad=false;
  await f.pulse();
  assert.equal(f.observer.status.stale,false);
  assert.deepEqual(f.events.filter(x=>x==='recovered'),['recovered']);
  assert.equal(f.states.length,2,'recovery refreshes unchanged revision');
  f.observer.stop();
});
test('revoked or expired server access disconnects the screen',async()=>{
  let allowed=true;
  const f=fixture({getSession:async()=>allowed?row():null});
  f.observer.start();await f.settle();
  allowed=false;await f.pulse();
  assert.equal(f.observer.status.running,false);
  assert.equal(f.scheduled.size,0);
  assert.ok(f.events.includes('revoked_expired_or_unavailable'));
});
test('old in-flight responses cannot overwrite new session state after restart',async()=>{
  let release;
  let delayed=false;
  const fetcher=async()=>{
    if(delayed)return await new Promise(resolve=>{release=resolve;});
    return row();
  };
  const f=fixture({getSession:fetcher});
  f.observer.start();await f.settle();
  delayed=true;
  await f.pulse(); // request now in flight, unresolved
  assert.equal(f.observer.status.busy,true);
  f.observer.stop();
  delayed=false;
  assert.equal(f.observer.start(),true);
  await f.settle();
  assert.equal(f.states.length,2,'restart emits current snapshot again');
  release(row(999));
  await f.settle();
  assert.equal(f.observer.status.revision,0,'old epoch cannot replace revision');
  f.observer.stop();
});
test('observer never exposes write actions',()=>{
  const watcher=createHFScreenWatcher({
    client:{getSession:async()=>row()},session:screen,id,
    onSnapshot:()=>{},onDisconnected:()=>{}
  });
  for(const action of ['write','create','save','updateRuntime','next','pause','resume','advance'])
    assert.equal(action in watcher,false);
});
