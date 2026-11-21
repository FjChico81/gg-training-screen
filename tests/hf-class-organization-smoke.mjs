import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  hfScopedStorage,HF_CATEGORIES,HF_FAVORITES_KEY,HF_TEMPLATES_KEY,
  HF_COLLECTIVE_HISTORY_KEY,listHFFavorites,toggleHFFavorite,
  listHFTemplates,saveHFTemplate,renameHFTemplate,removeHFTemplate,
  listHFCollectiveHistory,appendHFCollectiveHistory,exportHFCollectiveData
} from '../src/hf-class-organization.mjs';
const id='11111111-2222-4333-8444-555555555555',otherId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const memory=()=>{const map=new Map();return {
  map,getItem:key=>map.get(key)??null,
  setItem:(key,value)=>map.set(key,String(value)),
  removeItem:key=>map.delete(key)
}};
const fixture=()=>({id:'saved123',name:'Clase híbrida',
  blocks:[{name:'Fuerza',items:['Press banca | 3x10 | descanso 60s','Carrera | 400 m']}],
  ggCloud:{revision:93,owner_id:'secret-user'},hrLimit:181,secret:'no'});
const entry=(runId=id)=>({runId,title:'HF · Clase del lunes',mode:'guided',deviceMode:'tablet',
  outcome:'completed',endedAt:1795273000000,elapsedMs:3600000,progress:7,total:7,
  results:[{type:'amrap',label:'Híbrido',seconds:600,complete:false,rounds:3,partial:1}]});
test('favorites are scoped to HF profile, not VECTOR or another HF local profile',()=>{
 const storage=memory(),personal=hfScopedStorage(storage,'personal');
 const guest=hfScopedStorage(storage,'abcdef0123456789abcdef0123456789');
 assert.equal(toggleHFFavorite(personal,'saved123'),true);
 assert.deepEqual(listHFFavorites(personal),['saved123']);
 assert.deepEqual(listHFFavorites(guest),[]);
 assert.equal(storage.getItem('gg-training-screen-workouts-v1'),null);
 assert.equal(storage.getItem('hf:personal:'+HF_FAVORITES_KEY)!==null,true);
 assert.equal(toggleHFFavorite(personal,'saved123'),false);
 assert.deepEqual(listHFFavorites(personal),[]);
});
test('template snapshots are independent copies stripped of cloud, HR and user metadata',()=>{
 const root=memory(),storage=hfScopedStorage(root),workout=fixture(),original=structuredClone(workout);
 const tmpl=saveHFTemplate(storage,workout,{name:'Fuerza base',category:'Fuerza',now:1795272000000,uuid:()=>id});
 assert.equal(tmpl.workout.id,undefined);
 assert.equal(tmpl.workout.ggCloud,undefined);
 assert.equal(tmpl.workout.hrLimit,undefined);
 assert.equal(tmpl.workout.secret,undefined);
 assert.deepEqual(workout,original);
 workout.blocks[0].items[0]='MODIFIED IN SOURCE';
 const saved=listHFTemplates(storage)[0];
 assert.equal(saved.workout.blocks[0].items[0],original.blocks[0].items[0]);
 saved.workout.blocks[0].items[0]='MODIFIED IN LIST';
 assert.equal(listHFTemplates(storage)[0].workout.blocks[0].items[0],original.blocks[0].items[0]);
});
test('templates can be renamed/reclassified without editing their exercises, and deleted only explicitly',()=>{
 const root=memory(),store=hfScopedStorage(root);
 saveHFTemplate(store,fixture(),{uuid:()=>id,category:'Otros'});
 renameHFTemplate(store,id,{name:'Técnica y cardio',category:'Cardio'});
 const [changed]=listHFTemplates(store);
 assert.equal(changed.name,'Técnica y cardio');
 assert.equal(changed.category,'Cardio');
 assert.equal(changed.workout.blocks[0].items.length,2);
 removeHFTemplate(store,id);
 assert.deepEqual(listHFTemplates(store),[]);
 assert.equal(root.getItem('hf:personal:gg-training-screen-workouts-v1'),null);
});
test('template categories are known and custom invalid names are rejected without overwriting source',()=>{
 const root=memory(),store=hfScopedStorage(root);
 assert.ok(HF_CATEGORIES.includes('AMRAP'));
 assert.throws(()=>saveHFTemplate(store,fixture(),{uuid:()=>id,category:'Malicioso'}),/categoría/);
 assert.throws(()=>saveHFTemplate(store,fixture(),{uuid:()=>id,name:' '.repeat(20)}));
 assert.deepEqual(listHFTemplates(store),[]);
});
test('collective history uses immutable run UUID to prevent repeated browser-completion writes',()=>{
 const root=memory(),store=hfScopedStorage(root);
 assert.deepEqual(appendHFCollectiveHistory(store,entry()),{added:true,duplicate:false});
 assert.deepEqual(appendHFCollectiveHistory(store,entry()),{added:false,duplicate:true});
 assert.equal(listHFCollectiveHistory(store).length,1);
 assert.equal(root.getItem('hf:personal:'+HF_COLLECTIVE_HISTORY_KEY)!==null,true);
 assert.equal(root.getItem('hf:personal:gg-strength-history-v1'),null);
});
test('class history is ordered descending, excludes individual metrics and keeps AMRAP results',()=>{
 const store=hfScopedStorage(memory());
 const first=entry();const second={...entry(otherId),endedAt:first.endedAt+1000,title:'HF · Circuito'};
 appendHFCollectiveHistory(store,first);appendHFCollectiveHistory(store,second);
 const sorted=listHFCollectiveHistory(store);
 assert.deepEqual(sorted.map(x=>x.runId),[otherId,id]);
 assert.equal(sorted[1].results[0].rounds,3);
 assert.equal(JSON.stringify(sorted).includes('hrLimit'),false);
});
test('corrupt templates or history are never silently reset or deleted',()=>{
 const root=memory(),store=hfScopedStorage(root);
 root.setItem('hf:personal:'+HF_TEMPLATES_KEY,'NOT JSON');
 assert.throws(()=>listHFTemplates(store),/dañados/);
 assert.equal(root.getItem('hf:personal:'+HF_TEMPLATES_KEY),'NOT JSON');
 root.setItem('hf:personal:'+HF_COLLECTIVE_HISTORY_KEY,'NOT JSON');
 assert.throws(()=>appendHFCollectiveHistory(store,entry()),/dañados/);
 assert.equal(root.getItem('hf:personal:'+HF_COLLECTIVE_HISTORY_KEY),'NOT JSON');
});
test('storage failures fail safely without deleting other records',()=>{
 const root=memory(),store=hfScopedStorage(root);
 root.setItem('hf:personal:'+HF_COLLECTIVE_HISTORY_KEY,JSON.stringify({version:1,items:[entry()]}));
 root.setItem('hf:personal:custom-safe-backup','BACKUP');
 assert.throws(()=>appendHFCollectiveHistory(store,{...entry(otherId),elapsedMs:-1}),/inválido/);
 assert.equal(root.getItem('hf:personal:custom-safe-backup'),'BACKUP');
 assert.equal(listHFCollectiveHistory(store).length,1);
});
test('export contains only collective HF records, templates and favorites',()=>{
 const root=memory(),store=hfScopedStorage(root);
 toggleHFFavorite(store,'saved123');
 saveHFTemplate(store,fixture(),{uuid:()=>id,category:'Híbrido'});
 appendHFCollectiveHistory(store,entry());
 const backup=exportHFCollectiveData(store);
 assert.equal(backup.format,'HF-collective-export');
 assert.equal(backup.templates.length,1);
 assert.equal(backup.collectiveHistory.length,1);
 assert.deepEqual(backup.favorites,['saved123']);
 const dumped=JSON.stringify(backup);
 assert.equal(dumped.includes('secret-user'),false);
 assert.equal(dumped.includes('ggCloud'),false);
});
test('foreign profile IDs cannot be used to escape HF namespace',()=>{
 for(const profile of ['','other','../../gg','x:y','abc/def','HF','PERSONAL']){
  assert.throws(()=>hfScopedStorage(memory(),profile));
 }
});
test('all data stays untouched when template limit or duplicate identifier blocks a save',()=>{
 const store=hfScopedStorage(memory());
 saveHFTemplate(store,fixture(),{uuid:()=>id});
 const previous=JSON.stringify(listHFTemplates(store));
 assert.throws(()=>saveHFTemplate(store,fixture(),{uuid:()=>id}),/duplicado/);
 assert.equal(JSON.stringify(listHFTemplates(store)),previous);
});
