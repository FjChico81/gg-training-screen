// Pure browser simulation of the HF collective class screen; no cloud/network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const html=readFileSync(resolve(__dirname,'../hf-class-display.html'),'utf8');
const src=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(src);
function node(id=''){
 const attributes={};
 return {
   id,hidden:false,disabled:false,textContent:'',children:[],style:{},_value:'',
   get value(){return this._value;},set value(x){this._value=String(x);},
   previousElementSibling:{textContent:id},
   classList:{add(){},remove(){},toggle(){},contains(){return false}},
   setAttribute(k,v){attributes[k]=String(v);},
   getAttribute:k=>attributes[k],addEventListener(){},replaceChildren(){},append(){},remove(){}
 };
}
function boot(){
 const nodes=new Map(),body={classList:{add(){},remove(){},toggle(){},contains(){return false}}};
 const document={body,fullscreenElement:null,visibilityState:'visible',
   getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},
   createElement(tag){return node(tag);},addEventListener(){}};
 let now=1000000;class VirtualDate extends Date{static now(){return now;}}
 const marker='loadForms();render();setInterval(tick,160);';
 const injected=src.replace(marker,[
    'globalThis.__test={',
    'getState:()=>JSON.parse(JSON.stringify(state)),',
    'getConfig:()=>JSON.parse(JSON.stringify(config)),',
    'setGuided:(plan)=>{config.guided=JSON.parse(JSON.stringify(plan.guided));',
    'config.segments=JSON.parse(JSON.stringify(plan.segments));',
    'state.mode="guided";resetSession(true);},',
    'start:startSession,pause:pauseSession,next:nextPhase,tick:tick,',
    '};',marker].join(''));
 const context={document,window:{},location:{search:'?mode=guided'},URLSearchParams,
    Date:VirtualDate,setInterval:()=>0,console,confirm:()=>true,alert:()=>{}};
 vm.runInNewContext(injected,context,{timeout:1000,filename:'hf-advanced-screen'});
 return {t:context.__test,el:id=>document.getElementById(id),
   advance(ms){now+=ms;this.t.tick();},now:()=>now};
}
const step=(name,seconds=0)=>({name,target:'Objetivo',seconds});
const advanced=(type,steps,limitSeconds)=>({
  guided:steps,segments:[{type,start:0,end:steps.length-1,limitSeconds,label:'Clase especial',
    ...(type==='emom'?{rounds:2,workSeconds:40,restSeconds:20}:{}),
    ...(type==='for-time'?{rounds:1}:{})}]
});
test('AMRAP loops on manual completion without resetting its global clock',()=>{
 const x=boot();x.t.setGuided(advanced('amrap',[step('Carrera'),step('Burpees')],10));
 x.t.start();x.t.next();x.t.next();
 assert.equal(x.t.getState().step,0);
 assert.equal(x.t.getState().amrapRounds,1);
 x.advance(4500);
 assert.match(x.el('specialStatus').textContent,/AMRAP/);
 assert.match(x.el('specialStatus').textContent,/rondas completas/);
 x.advance(5501);
 assert.equal(x.t.getState().phase,'finished');
 assert.equal(x.t.getState().results[0].complete,false);
 assert.equal(x.t.getState().results[0].rounds,1);
 assert.equal(x.t.getState().results[0].seconds,10);
});
test('FOR TIME stops at the global deadline even during a manual step',()=>{
 const x=boot();x.t.setGuided(advanced('for-time',[step('400 m carrera'),step('Burpees')],5));
 x.t.start();x.advance(3000);x.t.next();x.advance(2001);
 assert.equal(x.t.getState().phase,'finished');
 assert.equal(x.t.getState().results[0].complete,false);
 assert.equal(x.t.getState().results[0].seconds,5);
});
test('FOR TIME with limit zero counts up and finishes only when all steps completed',()=>{
 const x=boot();x.t.setGuided(advanced('for-time',[step('400 m carrera'),step('Burpees')],0));
 x.t.start();x.advance(100000);
 assert.equal(x.t.getState().step,0);
 assert.equal(x.t.getState().phase,'work');
 x.t.next();x.t.next();
 assert.equal(x.t.getState().phase,'finished');
 assert.equal(x.t.getState().results[0].complete,true);
 assert.equal(x.t.getState().results[0].steps,2);
});
test('EMOM auto advances work/rest and includes last programmed recovery',()=>{
 const x=boot();
 x.t.setGuided(advanced('emom',[step('SkiErg',40),step('DESCANSO',20),
   step('SkiErg',40),step('DESCANSO',20)],120));
 x.t.start();x.advance(40001);assert.equal(x.t.getState().step,1);
 x.advance(20001);assert.equal(x.t.getState().step,2);
 x.advance(40001);assert.equal(x.t.getState().step,3);
 x.advance(20001);assert.equal(x.t.getState().phase,'finished');
});
test('pausing an AMRAP freezes its global limit during a long interruption',()=>{
 const x=boot();x.t.setGuided(advanced('amrap',[step('Burpees')],10));
 x.t.start();x.advance(4500);x.t.pause();
 assert.equal(x.t.getState().paused,true);
 const elapsed=x.t.getState().specialElapsedMs;
 x.advance(180000);
 assert.equal(x.t.getState().specialElapsedMs,elapsed);
 x.t.start();x.advance(5600);
 assert.equal(x.t.getState().phase,'finished');
});
test('AMRAP timeout skips remaining unfinished work and continues with the next normal block',()=>{
 const x=boot();x.t.setGuided({
  guided:[step('Burpees'),step('Carrera'),step('Estiramiento',60)],
  segments:[{type:'amrap',start:0,end:1,limitSeconds:5,label:'AMRAP corto'}]
 });
 x.t.start();x.advance(5001);
 assert.equal(x.t.getState().step,2);
 assert.equal(x.t.getState().phase,'work');
 assert.equal(x.t.getState().results[0].complete,false);
 x.advance(60001);assert.equal(x.t.getState().phase,'finished');
});
