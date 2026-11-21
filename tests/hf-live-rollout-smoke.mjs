import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {HF_LIVE_ROLLOUT_APPROVED} from '../src/hf-live-rollout.mjs';

const root=resolve(import.meta.dirname,'..');
const html=readFileSync(resolve(root,'hf-live-beta.html'),'utf8');
const index=readFileSync(resolve(root,'index.html'),'utf8');
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,'HF beta should contain exactly one module script');
const script=js.replace(/^import [\s\S]*? from ['"][^'"]+['"];[ \t]*$/gm,'');

function page(mode='trainer'){
  let constructorCalls=0,fetchCalls=0;
  const elements=new Map();
  function element(id){
    if(!elements.has(id)){
      const target={
        id,hidden:false,disabled:false,textContent:'',attrs:{},
        children:[],style:{},
        setAttribute(k,v){this.attrs[k]=v;},
        querySelectorAll(){return Array.from({length:4},(_,n)=>element(id+'-control-'+n));},
        replaceChildren(...v){this.children=v;},
        append(...v){this.children.push(...v);}
      };
      elements.set(id,target);
    }
    return elements.get(id);
  }
  const document={getElementById:element};
  const crashing=()=>{constructorCalls++;throw Error('This must never instantiate a backend client');};
  const context={
    document,URLSearchParams,location:{search:'?role='+mode+'&enableLive=true'},
    HF_LIVE_ROLLOUT_APPROVED:false,
    HF_SUPABASE_CONFIG:{url:'https://unverified.invalid'},
    createHFMemoryAuth:crashing,createHFPairingClient:crashing,
    createHFLiveClient:crashing,createHFCoachController:crashing,
    createHFScreenWatcher:crashing,presentHFRuntime:crashing,
    fetch(){fetchCalls++;throw Error('Unexpected network call');}
  };
  runInNewContext(script,context,{timeout:1000});
  return {elements,element,constructorCalls,fetchCalls};
}

test('rollout is explicitly disabled and cannot be enabled by a URL flag',()=>{
  assert.equal(HF_LIVE_ROLLOUT_APPROVED,false);
  for(const mode of ['trainer','screen']){
    const p=page(mode);
    assert.equal(p.constructorCalls,0);
    assert.equal(p.fetchCalls,0);
    assert.match(p.element('feedback').textContent,/No se ha contactado con Supabase/);
    assert.equal(p.element('blocked').hidden,false);
    const disabledElements=p.element(mode==='screen'?'screenPanel':'trainerPanel')
      .querySelectorAll('button');
    assert.ok(disabledElements.every(x=>x.disabled===true));
  }
});

test('separate URL modes exist but cannot bypass the infrastructure gate',()=>{
  const t=page('trainer'),s=page('screen');
  assert.equal(t.element('trainerPanel').hidden,false);
  assert.equal(t.element('screenPanel').hidden,true);
  assert.equal(s.element('trainerPanel').hidden,true);
  assert.equal(s.element('screenPanel').hidden,false);
  const begin=index.indexOf('function setupHF(){');
  const end=index.indexOf('function setupLocalProfiles(){',begin);
  const hfHome=index.slice(begin,end);
  assert.match(hfHome,/hf-class-prototype\.html/);
  assert.doesNotMatch(hfHome,/hf-live-beta\.html|hf-pair-preview\.html/,
    'legacy remote pairing must not be exposed on the HF class launcher');
});

test('HF beta is render-only until approval and does not contain secrets',()=>{
  assert.match(html,/Conexión real todavía bloqueada/);
  assert.match(js,/if\(!HF_LIVE_ROLLOUT_APPROVED\)/);
  assert.match(html,/Cuenta de la pantalla/);
  assert.match(html,/Acceso del entrenador/);
  assert.doesNotMatch(html,/\b(?:service_role|sk-proj|sb_secret_)[A-Za-z0-9_-]{10,}/i);
  assert.doesNotMatch(html,/localStorage|sessionStorage|indexedDB/);
});
