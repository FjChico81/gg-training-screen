import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toHFPresentation,HFPresentationError,createHFHandoff,consumeHFHandoff} from '../src/hf-workout-presenter.mjs';
const source=w=>({id:'x',name:'HF · Mixto',blocks:w});
const block=(name,...items)=>({name,items});
test('AMRAP native HF editor block keeps round loop and one 15 minute global cap',()=>{
  const w=source([block('Movilidad','Movilidad @90'),
    block('AMRAP 900s · Híbrido','300 m SkiErg','10 burpees','Bici @30'),
    block('Vuelta a la calma','Caminar @60')]);
  const original=structuredClone(w),r=toHFPresentation(w,'guided');
  assert.deepEqual(w,original);
  assert.equal(r.plan.guided.length,5);
  assert.deepEqual(r.plan.segments,[{type:'amrap',start:1,end:3,limitSeconds:900,label:'Híbrido'}]);
  assert.equal(r.plan.guided[1].seconds,0);
  assert.equal(r.plan.guided[3].seconds,30);
});
test('EMOM editor output preserves 45s work, 15s recovery every minute INCLUDING last',()=>{
  const data=Array.from({length:4},(_,i)=>[
    'SkiErg · Ronda '+(i+1)+'/4 @45','Recuperación · Ronda '+(i+1)+'/4 @15'
  ]).flat();
  const r=toHFPresentation(source([block('EMOM · SkiErg',...data)]),'guided');
  assert.equal(r.plan.guided.length,8);
  assert.deepEqual(r.plan.guided.map(s=>s.seconds),[45,15,45,15,45,15,45,15]);
  assert.equal(r.plan.guided[1].kind,'rest');
  assert.deepEqual(r.plan.segments[0],{type:'emom',start:0,end:7,limitSeconds:240,label:'SkiErg',rounds:4,workSeconds:45,restSeconds:15});
});
test('FOR TIME limit 0 stays unlimited; sequence preserves 2 rounds and manual movement',()=>{
  const r=toHFPresentation(source([
    block('FOR TIME 0s · Carrera · Ronda 1/2','400 m Carrera','10 Burpees'),
    block('FOR TIME 0s · Carrera · Ronda 2/2','400 m Carrera','10 Burpees'),
    block('Calma','Caminar @60')]),'guided');
  assert.deepEqual(r.plan.segments,[{type:'for-time',start:0,end:3,limitSeconds:0,label:'Carrera',rounds:2}]);
  assert.equal(r.plan.guided[0].seconds,0);
  assert.equal(r.plan.guided[4].seconds,60);
});
test('FOR TIME finite global cap is not attributed to each exercise',()=>{
  const r=toHFPresentation(source([
    block('FOR TIME 1200s · Carrera · Ronda 1/1','500 m Carrera','Burpees @30')]),'guided');
  assert.equal(r.plan.segments[0].limitSeconds,1200);
  assert.equal(r.plan.guided[0].seconds,0);
  assert.equal(r.plan.guided[1].seconds,30);
});
test('invalid AMRAP, altered EMOM and broken FOR TIME rounds fail rather than silently alter the session',()=>{
  const samples=[
    [block('AMRAP mal escrito','Burpees')],
    [block('EMOM · SkiErg','SkiErg · Ronda 1/2 @45','Recuperación · Ronda 1/2 @15','SkiErg · Ronda 2/2 @44','Recuperación · Ronda 2/2 @16')],
    [block('FOR TIME 600s · A · Ronda 1/2','Burpees'),block('FOR TIME 600s · A · Ronda 3/2','Burpees')],
    [block('AMRAP 900s · X','Sentadilla | 3x10 | descanso 90s')]
  ];
  for(const b of samples)assert.throws(()=>toHFPresentation(source(b),'guided'),HFPresentationError);
});
test('station adaptation never silently converts advanced sequential formats',()=>{
 for(const name of ['AMRAP 300s · HIIT','EMOM · SkiErg','FOR TIME 600s · Circuito · Ronda 1/1']){
  assert.throws(()=>toHFPresentation(source([block(name,'SkiErg','Burpees')]),'stations'),HFPresentationError);
 }
});

test('tampered ephemeral AMRAP caps and EMOM intervals are rejected before rendering',()=>{
 const kv=new Map();
 const store={getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v)};
 const uuid='11111111-2222-4333-8444-555555555555',now=1795270000000;
 const w=source([block('AMRAP 300s · Híbrido','Carrera 300 m','10 burpees')]);
 createHFHandoff(w,'guided',{store,uuid:()=>uuid,now:()=>now});
 const key=[...kv.keys()][0];
 const altered=JSON.parse(kv.get(key));
 altered.plan.segments[0].limitSeconds=9999999;
 kv.set(key,JSON.stringify(altered));
 assert.throws(()=>consumeHFHandoff(uuid,{store,now:()=>now+1}),HFPresentationError);
});
