// HF Stage B · collective history integration with a simulated browser.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const root=resolve(__dirname,'..'),file=readFileSync(resolve(root,'hf-class-display.html'),'utf8');
const src=file.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(src);
const checkpointPromise=import(pathToFileURL(resolve(root,'src/hf-class-checkpoint.mjs')).href);
const organizationPromise=import(pathToFileURL(resolve(root,'src/hf-class-organization.mjs')).href);
const source=src
 .replace("await import('./src/hf-class-checkpoint.mjs?v=2.9.64')","await __mockCheckpoint()")
 .replace("import('./src/hf-class-organization.mjs?v=2.9.64')","__mockOrganization()");
const marker='  updateDeviceUI();\n  loadForms();render();setInterval(tick,160);\n  void bootstrapRecovery();';
assert.ok(source.includes(marker),'Expected HF screen bootstrap');
const instrument='  window.__test={state:()=>JSON.parse(JSON.stringify(state)),start:startSession,next:nextPhase,finish:finish,tick:tick,save:saveCollectiveOutcome};\n';
const script=source.replace(marker,instrument+marker);
const uuid='11111111-2222-4333-8444-555555555555';
const memory=()=>{const data=new Map();return {data,
 getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),
 removeItem:k=>data.delete(k)
}};
function element(id=''){
 const attr=new Map(),classes=new Set();let value='';
 return {
  id,hidden:false,disabled:false,className:'',textContent:'',children:[],style:{},
  previousElementSibling:{textContent:id},
  get value(){return value},set value(v){value=String(v)},
  classList:{add(...x){x.forEach(v=>classes.add(v))},remove(...x){x.forEach(v=>classes.delete(v))},
   contains:x=>classes.has(x),toggle(x,force){
    const now=force===undefined?!classes.has(x):!!force;
    if(now)classes.add(x);else classes.delete(x);return now;}},
  setAttribute(k,v){attr.set(k,String(v))},getAttribute:k=>attr.get(k),
  addEventListener(){},replaceChildren(...a){this.children=a},append(...a){this.children.push(...a)},
  remove(){}
 };
}
async function boot(store,{profile='personal',time=1795270000000}={}){
 let now=time;
 class DateMock extends Date{
  constructor(...a){super(...(a.length?a:[now]))}
  static now(){return now}
 }
 const nodes=new Map(),listeners={};
 const document={
  fullscreenElement:null,fullscreenEnabled:false,visibilityState:'visible',
  body:{classList:{add(){},remove(){},contains(){return false},toggle(){return true}}},
  getElementById(id){if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id)},
  createElement:x=>element(x),
  addEventListener:(name,cb)=>{listeners[name]=cb}
 };
 const window={addEventListener:(name,cb)=>{listeners['window:'+name]=cb}};
 const context={
  document,window,location:{search:'?mode=guided&view=tablet&hfProfile='+profile},
  URLSearchParams,localStorage:store,sessionStorage:memory(),Date:DateMock,
  crypto:{randomUUID:()=>uuid},setInterval:()=>0,
  confirm:()=>true,alert:()=>{},console,
  __mockCheckpoint:()=>checkpointPromise,
  __mockOrganization:()=>organizationPromise
 };
 new Function(...Object.keys(context),script)(...Object.values(context));
 for(let i=0;i<30;i++)await Promise.resolve();
 return {
  app:window.__test,
  el:id=>document.getElementById(id),
  click(id){const node=document.getElementById(id);assert.equal(typeof node.onclick,'function');node.onclick()},
  advance(ms){now+=ms;window.__test.tick()},
  flush:async()=>{for(let i=0;i<35;i++)await Promise.resolve();}
 };
}
test('finishing a class creates one isolated collective history entry and only then clears checkpoint',async()=>{
 const storage=memory(),app=await boot(storage);
 storage.setItem('gg-training-screen-workouts-v1','IMPORTANT');
 app.click('start');app.advance(11000);
 const oldCheckpoint=storage.getItem('hf:collective-class:checkpoint:v1');
 assert.ok(oldCheckpoint);
 app.click('finishClass');await app.flush();
 assert.equal(app.app.state().phase,'finished');
 const history=JSON.parse(storage.getItem('hf:personal:hf-collective-history-v1'));
 assert.equal(history.items.length,1);
 assert.equal(history.items[0].outcome,'stopped');
 assert.equal(history.items[0].elapsedMs,11000);
 assert.equal(history.items[0].title,'HF · Clase guiada');
 assert.equal(storage.getItem('hf:collective-class:checkpoint:v1'),null);
 assert.equal(storage.getItem('gg-training-screen-workouts-v1'),'IMPORTANT');
 app.app.save();await app.flush();
 assert.equal(JSON.parse(storage.getItem('hf:personal:hf-collective-history-v1')).items.length,1);
});
test('natural completion is recorded once with full guided progress',async()=>{
 const storage=memory(),app=await boot(storage);
 app.click('start');
 for(let i=0;i<6;i++)app.app.next();
 await app.flush();
 const entries=JSON.parse(storage.getItem('hf:personal:hf-collective-history-v1')).items;
 assert.equal(entries.length,1);
 assert.equal(entries[0].outcome,'completed');
 assert.deepEqual([entries[0].progress,entries[0].total],[6,6]);
});
test('history write error keeps class checkpoint and offers retry without deleting stored records',async()=>{
 const storage=memory();
 storage.setItem('hf:personal:hf-collective-history-v1','CORRUPT_NOT_JSON');
 const app=await boot(storage);app.click('start');app.click('finishClass');await app.flush();
 assert.equal(app.el('retryCollectiveArchive').hidden,false);
 assert.match(app.el('collectiveArchiveStatus').textContent,/Historial no guardado/);
 assert.ok(storage.getItem('hf:collective-class:checkpoint:v1'));
 assert.equal(storage.getItem('hf:personal:hf-collective-history-v1'),'CORRUPT_NOT_JSON');
});
test('collective histories are scoped to the originating HF profile',async()=>{
 const storage=memory(),profile='abcdef0123456789abcdef0123456789';
 const app=await boot(storage,{profile});
 app.click('start');app.click('finishClass');await app.flush();
 assert.ok(storage.getItem('hf:'+profile+':hf-collective-history-v1'));
 assert.equal(storage.getItem('hf:personal:hf-collective-history-v1'),null);
});
test('HF home loads organization only inside its edition guard and legacy individual history remains separate',()=>{
 const home=readFileSync(resolve(root,'index.html'),'utf8');
 const first=home.indexOf('function setupHF(){'),next=home.indexOf('function setupLocalProfiles(){',first);
 const hf=home.slice(first,next);
 assert.match(hf,/if\(!isHF\)return/);
 assert.match(hf,/hfClubOrganizer/);
 assert.match(hf,/hf-organization-ui\.mjs/);
 assert.match(hf,/getWorkouts:\(\)=>workouts/);
 assert.match(home,/function getHistory\(\)/);
 assert.match(home,/gg-strength-history-v1/);
 assert.match(home,/hf-class-checkpoint\.mjs/);
 assert.doesNotMatch(hf,/hps|dionisio/i);
});

test('an interrupted class from another HF profile cannot be viewed, resumed or discarded',async()=>{
 const storage=memory();
 const guestProfile='abcdef0123456789abcdef0123456789';
 const guest=await boot(storage,{profile:guestProfile});guest.click('start');
 const checkpoint=storage.getItem('hf:collective-class:checkpoint:v1');
 assert.ok(checkpoint);
 const personal=await boot(storage,{profile:'personal',time:1795270002000});
 assert.equal(personal.el('recoveryPanel').hidden,false);
 assert.equal(personal.el('resumeRecovery').disabled,true);
 assert.equal(personal.el('discardRecovery').disabled,true);
 assert.equal(personal.el('start').disabled,true);
 assert.match(personal.el('recoveryTitle').textContent,/otro perfil HF/);
 assert.doesNotMatch(personal.el('recoveryMessage').textContent,/HF · Clase guiada/);
 assert.equal(storage.getItem('hf:collective-class:checkpoint:v1'),checkpoint);
});
