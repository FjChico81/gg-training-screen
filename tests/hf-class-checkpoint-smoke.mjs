import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  HF_CHECKPOINT_KEY,makeHFCheckpoint,writeHFCheckpoint,readHFCheckpoint,clearHFCheckpoint
} from '../src/hf-class-checkpoint.mjs';

const now=1795270000000;
const makeStore=()=>{
 const kv=new Map();
 return {
  kv,getItem:k=>kv.get(k)??null,
  setItem:(k,v)=>kv.set(k,String(v)),
  removeItem:k=>kv.delete(k)
 };
};
const input=()=>({
 runId:'11111111-2222-4333-8444-555555555555',
 title:'HF · Clase recuperable',deviceMode:'mirror',
 config:{
  guided:[{name:'Carrera',target:'400 m',seconds:0},
          {name:'Descanso',target:'30 s',seconds:30}],
  stations:[{name:'SkiErg',target:'250 m'},{name:'Burpees',target:'12 rep'}],
  rounds:3,work:60,change:15,segments:[]
 },
 state:{
   mode:'guided',phase:'work',step:1,turn:0,paused:true,
   remainingMs:12000,phaseElapsedMs:18000,sessionElapsedMs:90000,
   specialIndex:-1,specialElapsedMs:0,amrapRounds:0,results:[],
   deadline:null,sessionAnchor:0,phaseAnchor:0,specialAnchor:0
 }
});
test('checkpoint writes an isolated HF-only key and loads paused progress exactly',()=>{
 const store=makeStore(),src=input(),snapshot=makeHFCheckpoint({...src,now});
 assert.equal(snapshot.state.paused,true);
 writeHFCheckpoint(store,snapshot,{now});
 assert.deepEqual(readHFCheckpoint(store,{now:now+5000}),snapshot);
 assert.deepEqual(src,input(),'the original runtime has not been modified');
 assert.deepEqual([...store.kv.keys()],[HF_CHECKPOINT_KEY]);
 assert.equal(store.getItem('gg-training-screen-workouts-v1'),null);
 assert.equal(store.getItem('hf:personal:gg-training-screen-workouts-v1'),null);
});
test('checkpoint becomes invalid after 36 hours and never automatically deletes data',()=>{
 const store=makeStore();writeHFCheckpoint(store,makeHFCheckpoint({...input(),now}),{now});
 assert.throws(()=>readHFCheckpoint(store,{now:now+37*3600000}),/antigua/);
 assert.ok(store.getItem(HF_CHECKPOINT_KEY));
});
test('corrupted or unsupported version fails closed, without clearing other data',()=>{
 const store=makeStore();store.setItem(HF_CHECKPOINT_KEY,'garbage');
 assert.throws(()=>readHFCheckpoint(store,{now}),/dañada/);
 assert.equal(store.getItem(HF_CHECKPOINT_KEY),'garbage');
});
test('reject impossible running states, invalid indices and forged advanced segments',()=>{
 const src=input();
 for(const state of [
  {...src.state,paused:false},
  {...src.state,step:999},
  {...src.state,phase:'finished'},
  {...src.state,mode:'stations'}
 ]){
  assert.throws(()=>makeHFCheckpoint({...src,state,now}));
 }
 const config=structuredClone(src.config);
 config.segments=[{type:'emom',start:0,end:1,limitSeconds:60,label:'SkiErg',
   rounds:1,workSeconds:40,restSeconds:25}];
 assert.throws(()=>makeHFCheckpoint({...src,config,now}),/EMOM/);
});
test('another unfinished class cannot silently overwrite a saved checkpoint',()=>{
 const store=makeStore(),first=makeHFCheckpoint({...input(),now});
 writeHFCheckpoint(store,first,{now});
 const second=makeHFCheckpoint({...input(),runId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',now:now+1000});
 assert.throws(()=>writeHFCheckpoint(store,second,{now:now+1000}),/otra clase/);
 assert.deepEqual(readHFCheckpoint(store,{now:now+1000}),first);
});
test('discard clears only HF collective checkpoint, not an independent workout',()=>{
 const store=makeStore();store.setItem('gg-training-screen-workouts-v1','SAVE');
 writeHFCheckpoint(store,makeHFCheckpoint({...input(),now}),{now});
 clearHFCheckpoint(store);
 assert.equal(readHFCheckpoint(store,{now}),null);
 assert.equal(store.getItem('gg-training-screen-workouts-v1'),'SAVE');
});
test('resumption of AMRAP retains elapsed and round count rather than recalculating from elapsed wall time',()=>{
 const src=input();src.config.segments=[{type:'amrap',start:0,end:1,limitSeconds:900,label:'HYBRID'}];
 src.state.specialIndex=0;src.state.specialElapsedMs=467000;src.state.amrapRounds=3;
 const store=makeStore();writeHFCheckpoint(store,makeHFCheckpoint({...src,now}),{now});
 const data=readHFCheckpoint(store,{now:now+30000});
 assert.equal(data.state.specialElapsedMs,467000);
 assert.equal(data.state.amrapRounds,3);
 assert.equal(data.state.paused,true);
});
