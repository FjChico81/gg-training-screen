import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mountHFMobileNavigation} from '../src/hf-mobile-navigation.mjs';

class MockElement{
  constructor(tag,doc){
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];
    this.parentElement=null;this.id='';this.className='';this.textContent='';
    this.hidden=false;this.tabIndex=0;this.type='';this.onclick=null;
    this.attributes=new Map();this.focused=false;
    this.classList={
      add:(...classes)=>{const all=new Set(this.className.split(/\s+/).filter(Boolean));classes.forEach(x=>all.add(x));this.className=[...all].join(' ')},
      contains:x=>this.className.split(/\s+/).includes(x)
    };
  }
  setAttribute(k,v){this.attributes.set(k,String(v))}
  getAttribute(k){return this.attributes.get(k)??null}
  _attach(element,index){
    if(element.parentElement){
      const siblings=element.parentElement.children;
      siblings.splice(siblings.indexOf(element),1);
    }
    this.children.splice(index,0,element);
    element.parentElement=this;
  }
  append(...elements){for(const e of elements)this._attach(e,this.children.length)}
  prepend(...elements){for(let i=elements.length-1;i>=0;i--)this._attach(elements[i],0)}
  after(...elements){
    if(!this.parentElement)return;
    const target=this.parentElement;
    let index=target.children.indexOf(this)+1;
    for(const element of elements)target._attach(element,index++);
  }
  remove(){
    if(!this.parentElement)return;
    const parent=this.parentElement;
    parent.children.splice(parent.children.indexOf(this),1);
    this.parentElement=null;
  }
  querySelector(selector){
    const match=el=>selector.startsWith('.')?el.className.split(/\s+/).includes(selector.slice(1)):
      selector.startsWith('#')?el.id===selector.slice(1):el.tagName===selector.toUpperCase();
    const visit=parent=>{
      for(const child of parent.children){
        if(match(child))return child;
        const nested=visit(child);if(nested)return nested;
      }
      return null;
    };
    return visit(this);
  }
  focus(){this.focused=true}
}
function makeApp(){
  const doc={};
  doc.createElement=tag=>new MockElement(tag,doc);
  doc.body=doc.createElement('body');
  doc.getElementById=id=>{
    const visit=el=>{
      if(el.id===id)return el;
      for(const c of el.children){const found=visit(c);if(found)return found}
      return null;
    };
    return visit(doc.body);
  };
  const header=doc.createElement('header'),settings=doc.createElement('div');
  settings.id='settingsPanel';header.append(settings);doc.body.append(header);
  const closeSettings=doc.createElement('button');
  closeSettings.id='closeSettings';settings.append(closeSettings);
  const addProfile=doc.createElement('button');
  addProfile.id='addLocalProfile';settings.append(addProfile);
  const library=doc.createElement('section');library.id='library';
  const panel=doc.createElement('div');panel.className='panel';
  library.append(panel);doc.body.append(library);
  const add=(tag,id,cls,parent=panel)=>{
    const x=doc.createElement(tag);
    x.id=id||'';x.className=cls||'';
    parent.append(x);return x;
  };
  const title=add('h2','','library-title');title.textContent='Clases y entrenamientos';
  const intro=add('p','','hf-class-intro');intro.textContent='Larga explicación';
  const chooser=add('section','','hf-class-chooser');
  const resume=add('div','hfResumeClass','hidden',chooser);
  const organizer=add('div','hfClubOrganizer','hf-org-host');
  const profile=add('div','localProfilePanel','');
  const actions=add('div','','home-actions');
  const newButton=add('button','new','',actions);
  const individualHistory=add('button','historyButton','',actions);
  const exerciseLibrary=add('button','exerciseLibraryOpen','alt');
  const cloud=add('details','ggCloudPanel','library-cloud');
  const filters=add('div','libraryFilters','library-filters');
  const saved=add('div','saved','');
  const vector=add('section','vectorRoutines','hidden');
  let newClicks=0,historyClicks=0,exerciseClicks=0;
  newButton.onclick=()=>newClicks++;
  individualHistory.onclick=()=>historyClicks++;
  exerciseLibrary.onclick=()=>exerciseClicks++;
  return {doc,library,panel,settings,profile,cloud,exerciseLibrary,filters,saved,
    chooser,resume,organizer,newButton,individualHistory,vector,
    counts:()=>({newClicks,historyClicks,exerciseClicks})};
}
const byId=(app,id)=>app.doc.getElementById(id);
test('HF home opens with only concise actions while all other panels are hidden',()=>{
  const app=makeApp(),nav=mountHFMobileNavigation(app.doc,{profileLabel:'Principal'});
  assert.equal(nav.activeTab(),'home');
  assert.equal(byId(app,'hfPrimaryNavigation').getAttribute('role'),'tablist');
  assert.equal(byId(app,'hfPrimaryTabhome').textContent,'Inicio');
  assert.equal(byId(app,'hfPrimaryTabworkouts').textContent,'Mis entrenamientos');
  assert.equal(byId(app,'hfPrimaryTabclasses').textContent,'Clases');
  assert.equal(byId(app,'hfPrimaryPagehome').hidden,false);
  assert.equal(byId(app,'hfPrimaryPageworkouts').hidden,true);
  assert.equal(byId(app,'hfPrimaryPageclasses').hidden,true);
  assert.equal(app.saved.parentElement,byId(app,'hfPrimaryPageworkouts'));
  assert.equal(app.organizer.parentElement,byId(app,'hfPrimaryPageclasses'));
  assert.equal(app.resume.parentElement,byId(app,'hfPrimaryPagehome'));
});
test('Mis entrenamientos contains saved sessions, creation and personal history with original handlers',()=>{
  const app=makeApp(),nav=mountHFMobileNavigation(app.doc);
  byId(app,'hfPrimaryTabworkouts').onclick();
  assert.equal(nav.activeTab(),'workouts');
  const page=byId(app,'hfPrimaryPageworkouts');
  assert.equal(app.saved.parentElement,page);
  assert.equal(app.filters.parentElement,page);
  assert.equal(app.newButton.parentElement,app.individualHistory.parentElement);
  assert.equal(app.newButton.parentElement.parentElement,page);
  assert.equal(page.querySelector('.library-title').textContent,'Mis entrenamientos');
  app.newButton.onclick();app.individualHistory.onclick();
  assert.deepEqual(app.counts(),{newClicks:1,historyClicks:1,exerciseClicks:0});
});
test('Clases contains class chooser, templates, favorites and collective history',()=>{
  const app=makeApp(),nav=mountHFMobileNavigation(app.doc);
  byId(app,'hfPrimaryTabclasses').onclick();
  const page=byId(app,'hfPrimaryPageclasses');
  assert.equal(nav.activeTab(),'classes');
  assert.equal(app.chooser.parentElement,page);
  assert.equal(app.organizer.parentElement,page);
  assert.equal(page.querySelector('.hf-class-intro').textContent.includes('tablet'),true);
});
test('Profile, synchronization and exercise library are in settings, not the first screen',()=>{
  const app=makeApp();mountHFMobileNavigation(app.doc);
  assert.equal(app.profile.parentElement,app.settings);
  assert.equal(app.cloud.parentElement,app.settings);
  assert.equal(app.exerciseLibrary.parentElement,app.settings);
  assert.equal(app.settings.querySelector('.hf-settings-section-title').textContent,'Perfil y herramientas');
  app.exerciseLibrary.onclick();
  assert.equal(app.counts().exerciseClicks,1);
});
test('Arrow keys and Home/End navigate tabs with accessible selection and focus',()=>{
  const app=makeApp(),nav=mountHFMobileNavigation(app.doc);
  const tablist=byId(app,'hfPrimaryNavigation');
  let prevented=0;
  for(const key of ['ArrowRight','ArrowRight','Home','End']){
    tablist.onkeydown({key,preventDefault(){prevented++}});
  }
  assert.equal(prevented,4);
  assert.equal(nav.activeTab(),'classes');
  assert.equal(byId(app,'hfPrimaryTabclasses').getAttribute('aria-selected'),'true');
  assert.equal(byId(app,'hfPrimaryTabclasses').getAttribute('aria-controls'),'hfPrimaryPageclasses');
  assert.equal(byId(app,'hfPrimaryTabclasses').focused,true);
  assert.equal(byId(app,'hfPrimaryTabworkouts').tabIndex,-1);
});
test('navigation does not move or destroy nodes if a required HF component is missing',()=>{
  const app=makeApp();
  app.organizer.id='absent';
  const oldParent=app.saved.parentElement;
  assert.throws(()=>mountHFMobileNavigation(app.doc),/Falta algún componente/);
  assert.equal(app.saved.parentElement,oldParent);
  assert.equal(byId(app,'hfPrimaryNavigation'),null);
});
test('GG/VECTOR path never calls the HF navigation module',()=>{
  const page=readFileSync(resolve('index.html'),'utf8');
  const hf=page.slice(page.indexOf('function setupHF(){'),page.indexOf('function setupLocalProfiles(){'));
  assert.match(hf,/if\(!isHF\)return/);
  assert.match(hf,/hf-mobile-navigation\.mjs/);
  assert.equal(page.split("mountHFMobileNavigation(document").length-1,1);
  const css=readFileSync(resolve('assets/hf-association.css'),'utf8');
  const group=css.slice(css.indexOf('/* HF mobile navigation v1'));
  assert.ok(group);
  const rules=group.match(/(?:^|\n)\s*[^{}\n]+\{/g)||[];
  assert.ok(rules.length>15);
  assert.ok(rules.every(rule=>rule.includes('html[data-edition="hf"]')||rule.includes('@media')));
  assert.doesNotMatch(group,/innerHTML\s*:/);
});

test('extra HF profiles with no cloud still receive all three navigation tabs',()=>{
  const app=makeApp();
  app.cloud.remove(); // startup intentionally removes cloud UI for extra local profile
  const nav=mountHFMobileNavigation(app.doc,{profileLabel:'Invitado'});
  assert.equal(nav.activeTab(),'home');
  assert.equal(app.profile.parentElement,app.settings);
  assert.equal(app.exerciseLibrary.parentElement,app.settings);
  assert.equal(byId(app,'ggCloudPanel'),null);
});
test('settings are placed near the top, and cloud and profile controls retain their IDs',()=>{
  const app=makeApp();
  mountHFMobileNavigation(app.doc);
  const items=app.settings.children;
  const ids=items.map(el=>el.id||el.className);
  assert.ok(ids.indexOf('hf-settings-section-title')>ids.indexOf('closeSettings'));
  assert.ok(ids.indexOf('localProfilePanel')<ids.indexOf('addLocalProfile'));
  assert.ok(ids.indexOf('addLocalProfile')<ids.indexOf('ggCloudPanel'));
  assert.ok(ids.indexOf('ggCloudPanel')<ids.indexOf('exerciseLibraryOpen'));
});
