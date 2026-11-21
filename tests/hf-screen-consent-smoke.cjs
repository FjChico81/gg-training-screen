// HF two-tab consent smoke. No real browser, network or databases.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const transport=readFileSync(resolve(root,'src/hf-preview-link.js'),'utf8');
function lastScript(file){
  const html=readFileSync(resolve(root,file),'utf8');
  const found=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(found.length>0);
  return found.at(-1)[1];
}
const screenCode=lastScript('hf-class-prototype.html').replace(
  'loadForms();render();setInterval(tick,160);setupScreenPreview();',
  'window.__test={state:()=>({...state})};loadForms();render();setInterval(tick,160);setupScreenPreview();'
);
const coachCode=lastScript('hf-coach-preview.html');
const pair='11111111-2222-4333-8444-555555555555';
let clock=1000000,n=1;
const uuid=()=>('00000000-0000-4000-8000-'+(n++).toString(16).padStart(12,'0');
class BC{
  static peers=new Map();static queue=[];
  constructor(name){
    this.name=name;this.closed=false;
    if(!BC.peers.has(name))BC.peers.set(name,new Set());
    BC.peers.get(name).add(this);
  }
  postMessage(message){
    for(const peer of BC.peers.get(this.name)){
      if(peer!==this&&!peer.closed)BC.queue.push({peer,message});
    }
  }
  close(){this.closed=true;BC.peers.get(this.name).delete(this);}
  static flush(){
    let i=0;
    while(BC.queue.length){
      assert.ok(i++<1000,'message flood');
      const {peer,message}=BC.queue.shift();
      if(!peer.closed)peer.onmessage?.({data:message});
    }
  }
  static reset(){BC.peers.clear();BC.queue.length=0;}
}
function node(id=''){
  let val='';
  const classes=new Set(),events=new Map();
  const x={id,textContent:'',hidden:false,disabled:false,children:[],style:{},onclick:null,
    previousElementSibling:{textContent:id},
    classList:{
      add(...v){v.forEach(t=>classes.add(t));},
      remove(...v){v.forEach(t=>classes.delete(t));},
      contains(t){return classes.has(t);},
      toggle(t){if(classes.has(t)){classes.delete(t);return false;}classes.add(t);return true;}
    },
    addEventListener(k,f){events.set(k,f);},
    setAttribute(){},
    append(...v){this.children.push(...v);},
    replaceChildren(...v){this.children=v;},
    remove(){},
    click(){if(!this.disabled){this.onclick?.();events.get('click')?.();}}
  };
  Object.defineProperty(x,'value',{get(){return val;},set(v){val=String(v);}});
  return x;
}
function boot(code,search,isCoach){
  const nodes=new Map(),classes=new Set(),intervals=[];
  const document={
    body:{classList:{
      add(...v){v.forEach(t=>classes.add(t));},
      remove(...v){v.forEach(t=>classes.delete(t));},
      contains(t){return classes.has(t);},
      toggle(t){if(classes.has(t)){classes.delete(t);return false;}classes.add(t);return true;}
    }},
    getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},
    createElement:node,addEventListener(){}
  };
  if(isCoach)for(const id of ['start','pause','resume','next','reset'])
    document.getElementById(id).disabled=true;
  const window={BroadcastChannel:BC,crypto:{randomUUID:uuid},addEventListener(){}};
  new Function('window',transport)(window);
  new Function('document','window','Date','URLSearchParams','location','confirm','setInterval',code)(
    document,window,{now:()=>clock},URLSearchParams,{search},()=>true,
    (fn,delay)=>intervals.push({fn,delay})
  );
  return {window,el:id=>document.getElementById(id),intervals};
}
function prepare(mode='guided'){
  BC.reset();clock=1000000;n=1;
  return {
    screen:boot(screenCode,'?role=screen&pair='+pair+'&mode='+mode,false),
    coach:boot(coachCode,'?pair='+pair,true)
  };
}
test('screen does not listen until explicit approval',()=>{
  const {screen,coach}=prepare();
  assert.equal(screen.el('screenConsent').hidden,false);
  assert.equal(coach.el('start').disabled,true);
  screen.el('denyPreview').click();
  assert.match(screen.el('previewBanner').textContent,/RECHAZADA/);
});
test('approved trainer can start and advance a station circuit',()=>{
  const {screen,coach}=prepare('stations');
  screen.el('approvePreview').click();
  coach.el('refresh').click();
  BC.flush();
  assert.equal(screen.el('screenConsent').hidden,true);
  assert.match(coach.el('connection').textContent,/CONECTADA/);
  coach.el('start').click();BC.flush();
  assert.equal(screen.window.__test.state().phase,'work');
  coach.el('next').click();BC.flush();
  assert.equal(screen.window.__test.state().phase,'change');
});
test('screen revocation pauses class and blocks stale trainer',()=>{
  const {screen,coach}=prepare();
  screen.el('approvePreview').click();
  coach.el('refresh').click();BC.flush();
  coach.el('start').click();BC.flush();
  screen.el('revokePreview').click();BC.flush();
  assert.equal(screen.window.__test.state().paused,true);
  assert.equal(screen.el('screenConsent').hidden,false);
  clock+=7000;
  coach.intervals.find(x=>x.delay===250).fn();
  assert.equal(coach.el('next').disabled,true);
  const before=screen.window.__test.state().step;
  coach.el('next').click();BC.flush();
  assert.equal(screen.window.__test.state().step,before);
});
