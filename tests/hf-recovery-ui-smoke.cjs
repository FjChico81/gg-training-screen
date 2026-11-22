// End-to-end HF recovery UI using a simulated browser without network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const root=resolve(__dirname,'..');
const source=readFileSync(resolve(root,'hf-class-display.html'),'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)?.[1];
const modulePromise=import(pathToFileURL(resolve(root,'src/hf-class-checkpoint.mjs')).href);
assert.ok(source);
const file=source.replace("await import('./src/hf-class-checkpoint.mjs?v=2.9.64')","await __mockCheckpoint()");
const marker='  updateDeviceUI();\n  loadForms();render();setInterval(tick,160);\n  void bootstrapRecovery();';
assert.ok(file.includes(marker));
const instrumented=file.replace(marker,[
 "  window.__test={",
 "    state:()=>JSON.parse(JSON.stringify(state)),",
 "    start:startSession,pause:pauseSession,next:nextPhase,tick:tick,",
 "    save:()=>persistCheckpoint(true),",
 "  };",marker
].join('\n'));
function memory(){
 const kv=new Map();
 return {kv,getItem:k=>kv.get(k)??null,
  setItem:(k,v)=>kv.set(k,String(v)),
  removeItem:k=>kv.delete(k)};
}
function el(id=''){
 const attributes=new Map(), classes=new Set();
 let value='';
 const node={
  id,hidden:false,disabled:false,textContent:'',className:'',style:{},children:[],
  previousElementSibling:{textContent:id},
  classList:{
    add(...names){names.forEach(x=>classes.add(x));},
    remove(...names){names.forEach(x=>classes.delete(x));},
    contains:x=>classes.has(x),
    toggle(x,forced){const v=forced===undefined?!classes.has(x):!!forced;
      if(v)classes.add(x);else classes.delete(x);return v}
  },
  get value(){return value},set value(v){value=String(v)},
  addEventListener(){},setAttribute(k,v){attributes.set(k,String(v))},
  getAttribute:k=>attributes.get(k),
  replaceChildren(...x){this.children=x},append(...x){this.children.push(...x)},remove(){}
 };
 return node;
}
async function boot(store,{at=3000000000,token='?mode=guided&view=tablet'}={}){
 let now=at;
 class VirtualDate extends Date{
  constructor(...args){super(...(args.length?args:[now]))}
  static now(){return now}
 }
 const elements=new Map(), listeners={};
 const document={
  body:{classList:{add(){},remove(){},contains(){return false},toggle(){return true}}},
  fullscreenElement:null,fullscreenEnabled:false,visibilityState:'visible',
  getElementById(id){if(!elements.has(id))elements.set(id,el(id));return elements.get(id);},
  createElement(tag){return el(tag)},
  addEventListener(name,fn){listeners[name]=fn}
 };
 const window={addEventListener(name,fn){listeners['window:'+name]=fn}};
 const context={
  document,window,location:{search:token},URLSearchParams,Date:VirtualDate,
  sessionStorage:memory(),localStorage:store,
  crypto:{randomUUID:()=> '11111111-2222-4333-8444-555555555555'},
  setInterval:()=>0,confirm:()=>true,alert:()=>{},console,
  __mockCheckpoint:()=>modulePromise
 };
 new Function(...Object.keys(context),instrumented)(...Object.values(context));
 for(let i=0;i<24;i++)await Promise.resolve();
 return {window,document,el:id=>document.getElementById(id),listeners,
   advance(ms){now+=ms;window.__test.tick()},
   getState:()=>window.__test.state(),
   click(id){const n=this.el(id);assert.equal(typeof n.onclick,'function');n.onclick()},
   now:()=>now};
}
test('closing a timed class produces one HF-only checkpoint; reload shows explicit recovery prompt',async()=>{
 const store=memory(),first=await boot(store);
 assert.equal(first.el('start').disabled,false);
 first.click('start');first.advance(10000); // preparación, no se cuenta
 first.advance(10000);first.click('pause');
 assert.equal(first.getState().paused,true);
 assert.equal(store.kv.size,1);
 assert.equal(store.kv.has('hf:collective-class:checkpoint:v1'),true);
 const next=await boot(store,{at:first.now()+300000});
 assert.equal(next.el('recoveryPanel').hidden,false);
 assert.equal(next.el('start').disabled,true);
 assert.match(next.el('recoveryMessage').textContent,/en pausa/);
 next.click('resumeRecovery');
 assert.equal(next.el('recoveryPanel').hidden,true);
 assert.equal(next.getState().paused,true);
 assert.equal(next.getState().phaseElapsedMs,10000);
 next.advance(1500000);assert.equal(next.getState().step,0);
 next.click('start');next.advance(80001);
 assert.equal(next.getState().step,1);
});
test('recovery discard is explicit, clears HF checkpoint only and opens a new class',async()=>{
 const store=memory();store.setItem('gg-training-screen-workouts-v1','NEVER_DELETE');
 const first=await boot(store);first.click('start');first.advance(10000);
 const second=await boot(store,{at:first.now()+1000});
 assert.equal(second.el('recoveryPanel').hidden,false);
 second.click('discardRecovery');
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(store.getItem('hf:collective-class:checkpoint:v1'),null);
 assert.equal(store.getItem('gg-training-screen-workouts-v1'),'NEVER_DELETE');
 assert.equal(second.el('start').disabled,false);
});
test('corrupt checkpoint blocks automatic start and never deletes it without opt-in',async()=>{
 const store=memory();store.setItem('hf:collective-class:checkpoint:v1','not-json');
 const app=await boot(store);
 assert.equal(app.el('start').disabled,true);
 assert.equal(app.el('resumeRecovery').disabled,true);
 assert.equal(app.el('recoveryPanel').hidden,false);
 assert.equal(store.getItem('hf:collective-class:checkpoint:v1'),'not-json');
});
test('HF home offers resume shortcut only in the HF setup function',()=>{
 const home=readFileSync(resolve(root,'index.html'),'utf8');
 const hf=home.slice(home.indexOf('function setupHF(){'),home.indexOf('function setupLocalProfiles(){'));
 assert.match(hf,/hfResumeClass/);
 assert.match(hf,/readHFCheckpoint\(localStorage\)/);
 assert.match(hf,/hf-class-display\.html\?recover=1/);
 assert.match(hf,/if\(!isHF\)return/);
});
