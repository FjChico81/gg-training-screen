import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountHFOrganization} from '../src/hf-organization-ui.mjs';
import * as tools from '../src/hf-class-organization.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Script} from 'node:vm';

const makeStore=()=>{const map=new Map();return {
 getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),
 removeItem:k=>map.delete(k)
}};
function createFakeDom(){
 const doc={};
 class Fake{
  constructor(tag){
   this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];
   this.className='';this.textContent='';this.hidden=false;this.style={};
   this.attrs={};this.value='';this.onclick=null;this.oninput=null;this.onchange=null;
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k];}
  remove(){}
  click(){this.onclick?.();}
  focus(){this.focused=true;}
  querySelector(selector){
   if(selector==='h3')return find(this,n=>n.tagName==='H3');
   return null;
  }
 }
 doc.createElement=tag=>new Fake(tag);
 doc.body=new Fake('body');
 const host=new Fake('div');
 function find(node,check){
  if(check(node))return node;
  for(const child of node.children){const found=find(child,check);if(found)return found;}
  return null;
 }
 function all(node,check){
  return [ ...(check(node)?[node]:[]),...node.children.flatMap(child=>all(child,check)) ];
 }
 return {doc,host,find:fn=>find(host,fn),all:fn=>all(host,fn)};
}
const workout=()=>({id:'w173',name:'HF · Clase híbrida',
 blocks:[{name:'Fuerza',items:['Burpees | 3x10 | descanso 20s','Carrera | 500 m']}]});
function mount(){
 const dom=createFakeDom(),store=makeStore();
 const callbacks={present:[],draft:[],open:[],only:[]};
 const controller=mountHFOrganization({
  host:dom.host,store,tools,getWorkouts:()=>[workout()],
  getFavoriteFilter:()=>false,
  onFavoriteFilter:v=>callbacks.only.push(v),
  onPresent:(w,mode)=>callbacks.present.push([w,mode]),
  onDraft:x=>callbacks.draft.push(x),
  onOpen:id=>callbacks.open.push(id),
  onRefreshLibrary:()=>{},categoryForWorkout:()=> 'Híbrido'
 });
 return {dom,store,callbacks,controller};
}
test('HF club UI has three separate accessible sections without HTML string injection',()=>{
 const {dom,controller}=mount();controller.refresh();
 assert.ok(dom.find(n=>n.id==='hfClubFavorites'));
 assert.ok(dom.find(n=>n.id==='hfClubTemplates'));
 assert.ok(dom.find(n=>n.id==='hfClubHistory'));
 const source=readFileSync(resolve('src/hf-organization-ui.mjs'),'utf8');
 assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML/);
});
test('favorites quick actions display only existing HF routines and never change workouts',()=>{
 const {dom,store,callbacks,controller}=mount();
 tools.toggleHFFavorite(store,'w173');controller.refresh();
 const button=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Presentar');
 assert.ok(button);button.click();
 assert.equal(callbacks.present.length,1);
 assert.equal(callbacks.present[0][0].id,'w173');
 assert.equal(callbacks.present[0][1],'guided');
 const filter=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Ver solo favoritas');
 filter.click();
 assert.deepEqual(callbacks.only,[true]);
});
test('templates can be presented or copied into the existing HF editor',()=>{
 const {dom,store,callbacks,controller}=mount();
 tools.saveHFTemplate(store,workout(),{
  name:'Clase habitual',category:'Híbrido',uuid:()=> '11111111-2222-4333-8444-555555555555'
 });
 controller.refresh();
 const edit=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Usar en editor');
 assert.ok(edit);edit.click();
 assert.equal(callbacks.draft.length,1);
 assert.equal(callbacks.draft[0].name,'Clase habitual');
 const station=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Estaciones');
 station.click();
 assert.equal(callbacks.present.at(-1)[1],'stations');
 assert.equal(callbacks.present.at(-1)[0].name,'Clase habitual');
});
test('template category filter narrows the visible card without changing stored data',()=>{
 const {dom,store,controller}=mount();
 tools.saveHFTemplate(store,workout(),{
  name:'Mi plantilla',category:'Híbrido',uuid:()=> '11111111-2222-4333-8444-555555555555'
 });
 controller.refresh();
 const select=dom.find(n=>n.tagName==='SELECT'&&n.attrs['aria-label']==='Categoría de plantilla');
 assert.ok(select);select.value='Cardio';select.onchange();
 assert.ok(dom.find(n=>n.textContent==='No hay plantillas que coincidan.'));
 assert.equal(tools.listHFTemplates(store).length,1);
});
test('main app inline scripts remain syntactically valid after edition-scoped HF addition',()=>{
 const page=readFileSync(resolve('index.html'),'utf8');
 const snippets=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.ok(snippets.length>=2);
 for(const snippet of snippets){
  // Module scripts use import syntax and are not compiled as classic scripts.
  if(snippet.includes("import('./src/gg-cloud-ui"))continue;
  new Script(snippet);
 }
 const a=page.indexOf('function setupHF(){'),b=page.indexOf('function setupLocalProfiles(){',a);
 const hf=page.slice(a,b);
 assert.match(hf,/hfClubOrganizer/);
 assert.match(hf,/hf-class-organization\.mjs/);
 assert.match(hf,/if\(!isHF\)return/);
});

test('template name and category can be edited inline without altering source exercises',()=>{
 const {dom,store,controller}=mount();
 tools.saveHFTemplate(store,workout(),{
  name:'Clase habitual',category:'Híbrido',uuid:()=> '11111111-2222-4333-8444-555555555555'
 });
 controller.refresh();
 const button=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Editar datos');
 button.click();
 const input=dom.find(n=>n.tagName==='INPUT'&&n.attrs['aria-label']==='Nombre de plantilla');
 const category=dom.find(n=>n.tagName==='SELECT'&&n.attrs['aria-label']==='Categoría de la plantilla');
 assert.ok(input);assert.ok(category);
 input.value='Mi nuevo circuito';category.value='Cardio';
 const save=dom.find(n=>n.tagName==='BUTTON'&&n.textContent==='Guardar cambios');
 save.click();
 const [saved]=tools.listHFTemplates(store);
 assert.equal(saved.name,'Mi nuevo circuito');
 assert.equal(saved.category,'Cardio');
 assert.equal(saved.workout.blocks[0].items[0],'Burpees | 3x10 | descanso 20s');
});

test('compact HF club tabs show only one panel and remain keyboard-accessible',()=>{
 const {dom,controller}=mount();
 controller.refresh();
 const favorites=dom.find(n=>n.id==='hfClubFavorites');
 const templates=dom.find(n=>n.id==='hfClubTemplates');
 const history=dom.find(n=>n.id==='hfClubHistory');
 const tablist=dom.find(n=>n.attrs['role']==='tablist');
 assert.ok(tablist);
 assert.equal(tablist.attrs['aria-label'],'Organización de clases HF');
 assert.equal(favorites.hidden,false);
 assert.equal(templates.hidden,true);
 assert.equal(history.hidden,true);
 const tab=dom.find(n=>n.textContent==='▦ Plantillas'&&n.attrs['role']==='tab');
 tab.click();
 assert.equal(favorites.hidden,true);
 assert.equal(templates.hidden,false);
 assert.equal(history.hidden,true);
 assert.equal(tab.attrs['aria-selected'],'true');
 assert.equal(tab.attrs['aria-controls'],'hfClubTemplates');
 controller.openTab('history');
 assert.equal(templates.hidden,true);
 assert.equal(history.hidden,false);
 assert.equal(tablist.attrs['role'],'tablist');
});
test('resume class link retains the original local HF profile',()=>{
 const page=readFileSync(resolve('index.html'),'utf8');
 const a=page.indexOf('function setupHF(){');
 const b=page.indexOf('function setupLocalProfiles(){',a);
 const hf=page.slice(a,b);
 assert.match(hf,/resumeLink\.href=.*hfProfile.*encodeURIComponent\(localProfile\.id\)/);
 assert.match(hf,/saved\.profileId.*localProfile\.id/);
});
