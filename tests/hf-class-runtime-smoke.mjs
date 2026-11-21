import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createHFRuntime, commandHFRuntime, materializeHFRuntime,
  presentHFRuntime, validateHFClassPlan, validateHFRuntime
} from '../src/hf-class-runtime.mjs';

const at=ms=>new Date(Date.parse('2026-11-21T12:00:00.000Z')+ms).toISOString();
const guided={guided:[
  {name:'Movilidad',target:'90 segundos',seconds:90},
  {name:'Carrera',target:'400 m',seconds:0},
  {name:'DESCANSO',target:'30 segundos',seconds:30},
  {name:'Burpees',target:'12 repeticiones',seconds:0}
]};
const stations={stations:[
  {name:'SkiErg',target:'250 m'},
  {name:'Sentadilla goblet',target:'12 rep'},
  {name:'Burpees',target:'10 rep'},
  {name:'Carrera',target:'150 m'}
],rounds:3,work:60,change:20};

test('prepared guide starts and auto-advances, but manual distance never advances itself',()=>{
  let s=createHFRuntime('guided',guided);
  assert.deepEqual([s.phase,s.step,s.deadlineUtc],['ready',0,null]);
  s=commandHFRuntime(s,guided,'start',at(0));
  assert.equal(s.deadlineUtc,at(90000));
  s=materializeHFRuntime(s,guided,at(500000));
  assert.equal(s.step,1);
  assert.equal(s.deadlineUtc,null);
  const view=presentHFRuntime(s,guided,at(500000));
  assert.equal(view.elapsedMs,500000);
  s=commandHFRuntime(s,guided,'next',at(500000));
  assert.equal(s.step,2);
  assert.equal(s.deadlineUtc,at(530000));
  s=materializeHFRuntime(s,guided,at(530001));
  assert.equal(s.step,3);
  assert.equal(s.deadlineUtc,null);
});

test('pause and resume restore remaining time after long offline gap',()=>{
  let s=commandHFRuntime(createHFRuntime('guided',guided),guided,'start',at(0));
  s=commandHFRuntime(s,guided,'pause',at(12000));
  assert.equal(s.remainingMs,78000);
  assert.equal(s.deadlineUtc,null);
  assert.equal(s.runningSinceUtc,null);
  s=materializeHFRuntime(s,guided,at(950000));
  assert.equal(s.step,0);
  s=commandHFRuntime(s,guided,'resume',at(950000));
  assert.equal(s.deadlineUtc,at(1028000));
  assert.equal(materializeHFRuntime(s,guided,at(1027999)).step,0);
  assert.equal(materializeHFRuntime(s,guided,at(1028000)).step,1);
});

test('3 station laps and 4 stations = 12 intervals and 11 transitions, correct total after reopening TV',()=>{
  let s=commandHFRuntime(createHFRuntime('stations',stations),stations,'start',at(0));
  const t=12*60000+11*20000;
  const justBefore=materializeHFRuntime(s,stations,at(t-1));
  assert.equal(justBefore.phase,'work');
  assert.equal(justBefore.turn,11);
  s=materializeHFRuntime(s,stations,at(t));
  assert.equal(s.phase,'finished');
  assert.equal(s.turn,11);
  assert.equal(s.elapsedMs,t);
  assert.equal(s.deadlineUtc,null);
  const replay=materializeHFRuntime(s,stations,at(t+86400000));
  assert.deepEqual(replay,s);
});

test('a zero-second transition never invents a break',()=>{
  const noChange={...stations,change:0};
  const s=commandHFRuntime(createHFRuntime('stations',noChange),noChange,'start',at(0));
  const next=materializeHFRuntime(s,noChange,at(60000));
  assert.equal(next.phase,'work');
  assert.equal(next.turn,1);
  assert.equal(next.deadlineUtc,at(120000));
});

test('manual skip respects phase and station rotation',()=>{
  let s=commandHFRuntime(createHFRuntime('stations',stations),stations,'start',at(0));
  s=commandHFRuntime(s,stations,'next',at(15000));
  assert.equal(s.phase,'change');
  s=commandHFRuntime(s,stations,'next',at(17000));
  assert.equal(s.phase,'work');
  assert.equal(s.turn,1);
  assert.equal(s.elapsedMs,17000);
});

test('reset stops everything and returns a reusable draft',()=>{
  let s=commandHFRuntime(createHFRuntime('guided',guided),guided,'start',at(0));
  s=commandHFRuntime(s,guided,'reset',at(60000));
  assert.deepEqual(s,createHFRuntime('guided',guided));
});

test('rejects invalid actions, private fields, and unprogrammed rest',()=>{
  assert.throws(()=>validateHFClassPlan('guided',{guided:[{name:'DESCANSO',target:'hidratación',seconds:0}]}));
  assert.throws(()=>validateHFClassPlan('stations',{...stations,secret:'do-not-show'}));
  assert.throws(()=>validateHFClassPlan('guided',{guided:[{name:'Carrera',target:'400m',seconds:0,email:'x'}]}));
  assert.throws(()=>commandHFRuntime(createHFRuntime('guided',guided),guided,'DELETE',at(0)));
  assert.throws(()=>validateHFRuntime({...createHFRuntime('guided',guided),token:'secret'},guided));
});

test('does not mutate input state, plan or trigger network side effects',()=>{
  const plan=JSON.parse(JSON.stringify(guided));
  const first=createHFRuntime('guided',plan);
  const original={...first};
  const second=commandHFRuntime(first,plan,'start',at(0));
  assert.deepEqual(first,original);
  assert.deepEqual(plan,guided);
  assert.notEqual(first,second);
});
