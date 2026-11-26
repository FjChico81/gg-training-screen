// HF class smoke checks. Run: node --test tests/hf-class-display-smoke.cjs
// No external dependencies, cloud requests, databases or production resources.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');

const html=readFileSync(resolve(__dirname,'../hf-class-display.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'Expected one inline application script');
assert.match(source,/loadForms\(\);render\(\);setInterval\(tick,160\);/);
// sessionStorage is used solely for the short-lived same-tab presentation handoff.
assert.doesNotMatch(source,/\b(WebSocket|supabase|fetch\s*\()\b/i);
assert.doesNotMatch(source,/localStorage\.(?:getItem|setItem|removeItem)\s*\(/,
  'The screen must access only the HF-scoped checkpoint module, not arbitrary app storage');
assert.match(source,/consumeHFHandoff/);

function makeNode(tagName,id=''){
  const attrs={};
  return {
    tagName,id,hidden:false,_value:'',textContent:'',disabled:false,children:[],style:{},
    get value(){return this._value;},set value(v){this._value=String(v);},
    previousElementSibling:{textContent:id},
    classList:{toggle(){},add(){},remove(){},contains(){return false}},
    setAttribute(name,val){attrs[name]=val;},
    getAttribute(name){return attrs[name];},
    addEventListener(){},append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=items;},remove(){}
  };
}

function boot(query=''){
  const nodes=new Map(),listeners=new Map();
  const document={
    visibilityState:'visible',
    getElementById(id){
      if(!nodes.has(id))nodes.set(id,makeNode('div',id));
      return nodes.get(id);
    },
    createElement(tag){return makeNode(tag);},
    addEventListener(event,listener){listeners.set(event,listener);},
    body:{classList:{toggle(){},contains(){return false},remove(){}}},
    fullscreenElement:null
  };
  let now=1_000_000;
  class VirtualDate extends Date {static now(){return now;}}
  const harness = [
    'globalThis.__test={',
    'getState:()=>({...state}),',
    'getConfig:()=>JSON.parse(JSON.stringify(config)),',
    'start:()=>startSession(true),pause:pauseSession,next:nextPhase,',
    'tick:tick,reset:resetSession,switchMode:switchMode,',
    'parseGuided:parseGuided,parseStations:parseStations,',
    'apply:()=>document.getElementById("configForm").onsubmit({preventDefault(){}})',
    '};loadForms();render();setInterval(tick,160);'
  ].join('');
  const instrumented=source.replace('loadForms();render();setInterval(tick,160);',harness);
  const sandbox={document,window:{},confirm:()=>true,location:{search:query},URLSearchParams,
    Date:VirtualDate,setInterval:()=>0,console};
  vm.runInNewContext(instrumented,sandbox,{timeout:1000,filename:'hf-class-prototype'});
  return {t:sandbox.__test,el:id=>document.getElementById(id),
    advance(ms){now+=ms; sandbox.__test.tick();},
    changeVisibility(state,after=0){now+=after;document.visibilityState=state;listeners.get('visibilitychange')();},
    now:()=>now};
}

test('opens class mode from the two HF entry URLs',()=>{
  assert.equal(boot('?mode=guided').t.getState().mode,'guided');
  assert.equal(boot('?mode=stations').t.getState().mode,'stations');
  assert.equal(boot('?mode=not-recognized').t.getState().mode,'guided');
});

test('a class starts after exactly ten seconds and preparation does not count as training',()=>{
  const a=boot();
  a.el('start').onclick();
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.el('classPrestartNumber').textContent,'10');
  a.advance(5000);
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.el('classPrestartNumber').textContent,'5');
  a.advance(5000);
  assert.equal(a.t.getState().phase,'work');
  assert.equal(a.t.getState().sessionElapsedMs,0);
  assert.equal(a.t.getState().deadline,a.now()+90_000);
});
test('returning after suspension preserves the time spent after preparation and advances the class',()=>{
  const a=boot();
  a.el('start').onclick();
  a.changeVisibility('hidden',2_000);
  a.changeVisibility('visible',103_000);
  assert.equal(a.t.getState().step,1);
  assert.equal(a.el('totalClock').textContent,'01:35');
  assert.equal(a.el('mainClock').textContent,'00:05');
});
test('Cancelar during the initial 10 s returns to zero without starting a class',()=>{
  const a=boot();
  a.el('start').onclick();
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.el('classPrestart').hidden,false);
  a.advance(3000);
  a.el('classPrestartCancel').onclick();
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.el('classPrestart').hidden,true);
  a.advance(15000);
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.t.getState().sessionElapsedMs,0);
  assert.equal(a.el('start').disabled,false);
});
test('Cancelar during a class stops it without archiving a finished result',()=>{
  const a=boot();
  a.t.start(); // bypass preparation to isolate the already-active engine
  a.advance(3000);
  assert.equal(a.t.getState().phase,'work');
  a.el('cancelClass').onclick();
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.t.getState().sessionElapsedMs,0);
  assert.equal(a.t.getState().results.length,0);
  a.advance(30000);
  assert.equal(a.t.getState().phase,'ready');
});

test('guided exercise automatically advances only when a duration is specified',()=>{
  const a=boot();
  a.t.start();
  assert.equal(a.t.getState().phase,'work');
  assert.equal(a.t.getState().deadline,a.now()+90_000);
  a.advance(90_001);
  assert.equal(a.t.getState().step,1);
  assert.equal(a.t.getState().deadline,null,'400m run should need trainer confirmation');
  a.advance(300_000);
  assert.equal(a.t.getState().step,1,'un-timed exercise must not auto-advance');
  a.t.next();
  assert.equal(a.t.getState().step,2);
  a.t.next();
  assert.equal(a.t.getState().step,3);
  assert.equal(a.t.getState().deadline,a.now()+30_000);
  a.advance(30_001);
  assert.equal(a.t.getState().step,4);
});

test('pause freezes both clock and step, resume retains remaining time',()=>{
  const a=boot();
  a.t.start();
  a.advance(10_000);
  a.t.pause();
  const paused=a.t.getState();
  assert.equal(paused.paused,true);
  assert.ok(paused.remainingMs<=80_000 && paused.remainingMs>=79_000);
  a.advance(300_000);
  assert.equal(a.t.getState().step,0);
  a.t.start();
  a.advance(79_999);
  assert.equal(a.t.getState().step,0);
  a.advance(2);
  assert.equal(a.t.getState().step,1);
});

test('station circuits rotate all groups, once per interval, without a final transition',()=>{
  const a=boot('?mode=stations');
  a.t.start();
  assert.equal(a.t.getState().deadline,a.now()+60_000);
  const cards=()=>a.el('display').children[0].children;
  assert.equal(cards().length,4);
  assert.equal(cards()[1].children[1].textContent,'Vuelta 1 de 3');
  assert.equal(cards()[1].children[2].value,'0');
  assert.equal(cards()[2].children[1].children[0].children[1].textContent,'GRUPO A');
  a.advance(60_001);
  assert.equal(a.t.getState().phase,'change');
  assert.equal(a.t.getState().turn,0);
  assert.equal(cards()[1].children[3].textContent,'Rotación 2 de 12');
  assert.equal(cards()[1].children[2].value,'1');
  assert.equal(cards()[2].children[1].children[0].children[1].textContent,'LLEGA GRUPO D');
  a.advance(20_001);
  assert.equal(a.t.getState().phase,'work');
  assert.equal(a.t.getState().turn,1);
  a.advance(900_000);
  const state=a.t.getState();
  assert.equal(state.phase,'finished');
  assert.equal(cards()[1].children[1].textContent,'Circuito completado');
  assert.equal(cards()[1].children[2].value,'12');
  assert.equal(state.turn,11);
  assert.equal(state.sessionElapsedMs,12*60_000+11*20_000);
});

test('zero transition skips change phase and does not invent a rest',()=>{
  const a=boot('?mode=stations');
  a.el('changeTime').value='0';
  a.t.apply();
  assert.equal(a.t.getConfig().change,0);
  a.t.start();
  a.advance(60_001);
  assert.equal(a.t.getState().phase,'work');
  assert.equal(a.t.getState().turn,1);
});

test('validation rejects zero-second rest, oversized stations and malformed exercise lines',()=>{
  const a=boot();
  assert.throws(()=>a.t.parseGuided('DESCANSO | recuperación | 0'));
  assert.throws(()=>a.t.parseGuided('Burpees | 10 rep'));
  assert.throws(()=>a.t.parseStations('Solo una | 10 rep'));
  assert.throws(()=>a.t.parseStations(Array(9).fill('SkiErg | 100 m').join('\n')));
  assert.equal(a.t.parseStations('SkiErg | 100 m\nBike | 20 kcal').length,2);
});

test('reset and mode switch release running state',()=>{
  const a=boot();
  a.t.start();
  a.t.switchMode('stations');
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.t.getState().mode,'stations');
  a.t.start();
  a.t.reset();
  assert.equal(a.t.getState().phase,'ready');
  assert.equal(a.t.getState().turn,0);
});
