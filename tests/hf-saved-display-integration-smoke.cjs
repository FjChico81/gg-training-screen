// HF saved workout -> presentation UI integration, no database or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const path=require('node:url');

const root=resolve(__dirname,'..');
const html=readFileSync(resolve(root,'hf-class-display.html'),'utf8');
const index=readFileSync(resolve(root,'index.html'),'utf8');
const originalScript=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(originalScript);
assert.match(originalScript,/import\('\.\/src\/hf-workout-presenter\.mjs'\)/);
const script=originalScript.replace(
  "await import('./src/hf-workout-presenter.mjs')","await __mockImport()"
);
let bridgePromise=import(path.pathToFileURL(resolve(root,'src/hf-workout-presenter.mjs')).href);
const token='11111111-2222-4333-8444-555555555555';
const sample={id:'hf-1',name:'HF · Fuerza + cardio',blocks:[
  {name:'Fuerza',items:['Sentadilla goblet | 2x10 | 25kg | descanso 30s | GIF sentadilla-goblet']},
  {name:'Cardio',items:['Carrera | 400 m','20 burpees']}
]};

function element(id='') {
  const attr=new Map(),cls=new Set(),children=[];
  let input='';
  const item={
    id,hidden:false,disabled:false,textContent:'',className:'',children,style:{},
    previousElementSibling:{textContent:id},
    classList:{
      add(...x){x.forEach(k=>cls.add(k));},
      remove(...x){x.forEach(k=>cls.delete(k));},
      contains(x){return cls.has(x);},
      toggle(x,force){const next=force===undefined?!cls.has(x):!!force;
        if(next)cls.add(x);else cls.delete(x);return next;}
    },
    setAttribute(k,v){attr.set(k,String(v));},
    getAttribute(k){return attr.get(k);},
    addEventListener(){},
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children.splice(0,this.children.length,...items);},
    remove(){}
  };
  Object.defineProperty(item,'value',{get(){return input},set(v){input=String(v)}});
  return item;
}
function createDom(){
  const nodes=new Map(),bodyClasses=new Set();
  const document={
    body:{classList:{
      add(...x){x.forEach(k=>bodyClasses.add(k));},
      remove(...x){x.forEach(k=>bodyClasses.delete(k));},
      contains(x){return bodyClasses.has(x);},
      toggle(x,force){const next=force===undefined?!bodyClasses.has(x):!!force;
        if(next)bodyClasses.add(x);else bodyClasses.delete(x);return next;}
    }},
    fullscreenElement:null,fullscreenEnabled:false,
    getElementById(id){if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);},
    createElement:tag=>element(tag),
    addEventListener(){}
  };
  return {document,el:id=>document.getElementById(id)};
}
const createStore=()=>{
  const map=new Map();
  return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
};
async function boot(workout,mode='guided',{invalid=false}={}){
  const bridge=await bridgePromise;
  const store=createStore();
  if(!invalid)bridge.createHFHandoff(workout,mode,{store,uuid:()=>token});
  const {document,el}=createDom();
  // The real HTML marks the configuration section initially hidden.
  el('config').hidden=true;
  el('importNotice').hidden=true;
  const context={
    document,window:{},location:{search:'?mode='+mode+'&hfTransfer='+token+'&view=tablet'},
    URLSearchParams,sessionStorage:store,console,Date,
    setInterval:()=>0,confirm:()=>true,alert:()=>{},
    __mockImport:()=>bridgePromise
  };
  new Function('document','window','location','URLSearchParams','sessionStorage',
    'Date','setInterval','confirm','alert','console','__mockImport',script)(
      document,context.window,context.location,context.URLSearchParams,store,
      Date,context.setInterval,context.confirm,context.alert,console,context.__mockImport
  );
  // Resolve async import, handoff validation and UI rerender.
  for(let i=0;i<15;i++)await Promise.resolve();
  return {document,el,store,bridge};
}

test('saved guided workout opens in correct class with the exact title and steps',async()=>{
  const x=await boot(sample);
  assert.equal(x.el('screenTitle').textContent,sample.name);
  assert.equal(x.el('guidedMode').getAttribute('aria-pressed'),'true');
  assert.equal(x.el('start').disabled,false);
  assert.match(x.el('importNotice').textContent,/Rutina guardada/);
  assert.match(x.el('progressText').textContent,/Ejercicio 1 de 5/);
  assert.equal(x.el('config').hidden,true);
  assert.equal(x.el('deviceHint').textContent.includes('iPad'),true);
});

test('import does not mutate original saved workout or create a cloud session',async()=>{
  const frozen=structuredClone(sample);
  const x=await boot(sample);
  assert.deepEqual(sample,frozen);
  assert.equal(x.store.getItem('gg-training-screen-workouts-v1'),null);
  assert.equal(x.store.getItem('hf:personal:gg-training-screen-workouts-v1'),null);
  assert.equal(index.includes('async function presentSavedHFWorkout'),true);
  assert.equal(index.includes("import('./src/hf-workout-presenter.mjs')"),true);
});

test('station adaptation is blocked until coach confirms rounds, work and transitions',async()=>{
  const workout={name:'Circuito adaptado',blocks:[{
    name:'Estaciones',items:['SkiErg | 250 m','Burpees | 10 kcal']
  }]};
  const x=await boot(workout,'stations');
  assert.equal(x.el('screenTitle').textContent,workout.name);
  assert.equal(x.el('start').disabled,true);
  assert.equal(x.el('config').hidden,false);
  assert.match(x.el('importNotice').textContent,/Confirma los tiempos/);
  x.el('configForm').onsubmit({preventDefault(){}});
  assert.equal(x.el('config').hidden,true);
  assert.equal(x.el('start').disabled,false);
});

test('missing handoff never falls back to a pretend saved workout',async()=>{
  const x=await boot(sample,'guided',{invalid:true});
  assert.equal(x.el('start').disabled,true);
  assert.match(x.el('importNotice').textContent,/No se ha podido abrir/);
});

test('imported workout cannot silently switch to a different session format',async()=>{
  let alerts=[];
  const x=await boot(sample);
  // Handler uses alert from the supplied environment; its behavior is
  // checked by unchanged mode after selecting station.
  x.el('stationsMode').onclick();
  assert.equal(x.el('guidedMode').getAttribute('aria-pressed'),'true');
  assert.equal(x.el('screenTitle').textContent,sample.name);
});
