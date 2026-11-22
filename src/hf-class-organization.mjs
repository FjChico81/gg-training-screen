/**
 * HF collective class organization (Stage B).
 *
 * Storage must be explicitly provided by the HF caller. The main HF app passes
 * its existing profile-scoped appStorage wrapper. The class presentation page
 * uses the equivalent "hf:<profile>:" wrapper. NEVER touch GG/VECTOR keys.
 *
 * No Supabase, network, persistence migrations or automatic data deletion.
 */
export const HF_FAVORITES_KEY='hf-collective-favorites-v1';
export const HF_TEMPLATES_KEY='hf-collective-templates-v1';
export const HF_COLLECTIVE_HISTORY_KEY='hf-collective-history-v1';

export const HF_CATEGORIES=Object.freeze(['Fuerza','Híbrido','Cardio','Movilidad','AMRAP','EMOM','FOR TIME','Intervalos','Otros']);
const ID=/^[a-z0-9_-]{1,130}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEMPLATES=80,MAX_HISTORY=1000,MAX_FAVORITES=500;
const limitText=(v,max)=>typeof v==='string'&&v.trim()!==''&&v.length<=max;
const copy=x=>JSON.parse(JSON.stringify(x));
function fail(message){throw new Error('HF · Organización: '+message);}
function getRaw(store,key){
  if(typeof store?.getItem!=='function')fail('Almacenamiento no disponible.');
  return store.getItem(key);
}
function safeRead(store,key,maxBytes){
  const raw=getRaw(store,key);
  if(raw===null)return {raw,data:null};
  if(typeof raw!=='string'||raw.length>maxBytes)fail('Datos de '+key+' demasiado grandes. No se modificarán.');
  let data;
  try{data=JSON.parse(raw);}catch{fail('Datos de '+key+' dañados. Conserva una copia antes de continuar.');}
  return {raw,data};
}
function safeWrite(store,key,before,value){
  if(typeof store?.setItem!=='function')fail('Este navegador no permite guardar.');
  if(getRaw(store,key)!==before)fail('Otra pestaña ha modificado estos datos. Actualiza HF y repite la acción.');
  store.setItem(key,JSON.stringify(value));
}
function validId(id){return typeof id==='string'&&ID.test(id);}
function listFavoriteData(store){
  const {raw,data}=safeRead(store,HF_FAVORITES_KEY,50000);
  if(data===null)return {raw,ids:[]};
  if(!data||data.version!==1||!Array.isArray(data.ids)||data.ids.length>MAX_FAVORITES
    ||data.ids.some(x=>!validId(x))||new Set(data.ids).size!==data.ids.length)
    fail('La lista de favoritos no es válida.');
  return {raw,ids:data.ids};
}
export function listHFFavorites(store){return [...listFavoriteData(store).ids];}
export function toggleHFFavorite(store,workoutId){
  if(!validId(workoutId))fail('Identificador de rutina inválido.');
  const {raw,ids}=listFavoriteData(store);
  const exists=ids.includes(workoutId);
  if(!exists&&ids.length>=MAX_FAVORITES)fail('Hay demasiados favoritos. No se ha borrado ninguno.');
  const updated=exists?ids.filter(x=>x!==workoutId):[...ids,workoutId];
  safeWrite(store,HF_FAVORITES_KEY,raw,{version:1,ids:updated});
  return !exists;
}
function validateWorkout(w){
  if(!w||!limitText(w.name,120)||!Array.isArray(w.blocks)||!w.blocks.length||w.blocks.length>200)
    fail('La rutina no sirve como plantilla.');
  let steps=0;
  const blocks=w.blocks.map(b=>{
    if(!b||!limitText(b.name,120)||!Array.isArray(b.items)||!b.items.length)fail('Bloque incompleto.');
    steps+=b.items.length;
    if(steps>200||b.items.some(x=>!limitText(x,500)))fail('La plantilla supera los límites permitidos.');
    return {name:b.name,items:[...b.items]};
  });
  // Intentionally exclude workout id, metadata, cloud revisions and user data.
  return {name:w.name,blocks};
}
function validateTemplate(t){
  if(!t||!UUID.test(t.id)||!limitText(t.name,70)||!HF_CATEGORIES.includes(t.category)
    ||!Number.isSafeInteger(t.createdAt)||t.createdAt<0)fail('Plantilla inválida.');
  validateWorkout(t.workout);
  return t;
}
function readTemplateData(store){
  const {raw,data}=safeRead(store,HF_TEMPLATES_KEY,1000000);
  if(data===null)return {raw,items:[]};
  if(!data||data.version!==1||!Array.isArray(data.items)||data.items.length>MAX_TEMPLATES)
    fail('El archivo de plantillas no es compatible.');
  const ids=new Set();
  for(const t of data.items){
    validateTemplate(t);
    if(ids.has(t.id))fail('Hay identificadores de plantilla duplicados.');
    ids.add(t.id);
  }
  return {raw,items:data.items};
}
export function listHFTemplates(store){return copy(readTemplateData(store).items);}
export function saveHFTemplate(store,workout,{name=workout?.name,category='Otros',now=Date.now(),uuid=()=>crypto.randomUUID()}={}){
  const sanitized=validateWorkout(workout);
  if(!limitText(name,70)||!HF_CATEGORIES.includes(category))fail('Nombre o categoría de plantilla inválidos.');
  if(!Number.isSafeInteger(now)||now<0)fail('Fecha inválida.');
  const id=uuid();if(!UUID.test(id))fail('Identificador de plantilla no válido.');
  const {raw,items}=readTemplateData(store);
  if(items.length>=MAX_TEMPLATES)fail('Se alcanzó el máximo de plantillas. Exporta una copia; no se ha eliminado ninguna.');
  if(items.some(t=>t.id===id))fail('Identificador duplicado.');
  const item={id,name:name.trim(),category,createdAt:now,workout:sanitized};
  const next=[...items,item];
  safeWrite(store,HF_TEMPLATES_KEY,raw,{version:1,items:next});
  return copy(item);
}
export function renameHFTemplate(store,id,{name,category}={}){
  if(!UUID.test(id)||!limitText(name,70)||!HF_CATEGORIES.includes(category))
    fail('Datos de plantilla incorrectos.');
  const {raw,items}=readTemplateData(store),index=items.findIndex(x=>x.id===id);
  if(index<0)fail('Plantilla no encontrada.');
  const next=items.map((t,i)=>i===index?{...t,name:name.trim(),category}:t);
  safeWrite(store,HF_TEMPLATES_KEY,raw,{version:1,items:next});
}
export function removeHFTemplate(store,id){
  if(!UUID.test(id))fail('Identificador de plantilla inválido.');
  const {raw,items}=readTemplateData(store),next=items.filter(x=>x.id!==id);
  if(next.length===items.length)fail('La plantilla no existe.');
  safeWrite(store,HF_TEMPLATES_KEY,raw,{version:1,items:next});
}
function validateHistoryRecord(r){
  if(!r||!UUID.test(r.runId)||!limitText(r.title,120)||
    !['guided','stations'].includes(r.mode)||
    !['mirror','tablet'].includes(r.deviceMode)||
    !['completed','stopped'].includes(r.outcome)||
    !Number.isSafeInteger(r.endedAt)||r.endedAt<0||
    !Number.isSafeInteger(r.elapsedMs)||r.elapsedMs<0||r.elapsedMs>7*24*3600000||
    !Number.isSafeInteger(r.progress)||r.progress<0||r.progress>200||
    !Number.isSafeInteger(r.total)||r.total<0||r.total>200||
    r.progress>r.total||!Array.isArray(r.results)||r.results.length>50)
    fail('Registro de clase inválido.');
  if(r.feedback!==undefined){
    const feedback=r.feedback;
    if(!feedback||typeof feedback!=='object'||Array.isArray(feedback)||
      (feedback.rpe!==null&&(!Number.isInteger(feedback.rpe)||feedback.rpe<1||feedback.rpe>10))||
      !['','Sí','No'].includes(feedback.pain)||
      typeof feedback.notes!=='string'||feedback.notes.length>1000)
      fail('Feedback colectivo inválido.');
  }
  for(const result of r.results){
    if(!result||!['amrap','for-time','emom'].includes(result.type)||
      !limitText(result.label,85)||!Number.isSafeInteger(result.seconds)||
      result.seconds<0||result.seconds>7200||typeof result.complete!=='boolean')
      fail('Resultado colectivo incompatible.');
  }
  return r;
}
function readHistoryData(store){
  const {raw,data}=safeRead(store,HF_COLLECTIVE_HISTORY_KEY,1000000);
  if(data===null)return {raw,items:[]};
  if(!data||data.version!==1||!Array.isArray(data.items)||data.items.length>MAX_HISTORY)
    fail('El historial colectivo no es válido.');
  const ids=new Set();
  for(const item of data.items){
    validateHistoryRecord(item);
    if(ids.has(item.runId))fail('El historial tiene sesiones duplicadas.');
    ids.add(item.runId);
  }
  return {raw,items:data.items};
}
export function listHFCollectiveHistory(store){
  return copy(readHistoryData(store).items).sort((a,b)=>b.endedAt-a.endedAt);
}
export function appendHFCollectiveHistory(store,entry){
  const record=copy(entry);
  validateHistoryRecord(record);
  const {raw,items}=readHistoryData(store);
  if(items.some(i=>i.runId===record.runId))return {added:false,duplicate:true};
  if(items.length>=MAX_HISTORY)fail('Historial lleno. Exporta una copia; no se ha borrado ningún registro.');
  safeWrite(store,HF_COLLECTIVE_HISTORY_KEY,raw,{version:1,items:[...items,record]});
  return {added:true,duplicate:false};
}
export function updateHFCollectiveFeedback(store,runId,feedback){
  if(typeof runId!=='string'||!UUID.test(runId))fail('Identificador de clase inválido.');
  const normalized={
    rpe:feedback?.rpe??null,
    pain:feedback?.pain??'',
    notes:feedback?.notes??''
  };
  const {raw,items}=readHistoryData(store);
  const index=items.findIndex(record=>record.runId===runId);
  if(index<0)fail('No se encuentra la clase archivada; no se ha borrado nada.');
  const updated={...items[index],feedback:normalized};
  validateHistoryRecord(updated);
  if(items[index].feedback)fail('El feedback ya está guardado. No se sobrescribirá.');
  const next=items.map((record,i)=>i===index?updated:record);
  safeWrite(store,HF_COLLECTIVE_HISTORY_KEY,raw,{version:1,items:next});
  return {saved:true,runId};
}
export function exportHFCollectiveData(store){
  return {
    format:'HF-collective-export',version:1,exportedAt:new Date().toISOString(),
    favorites:listHFFavorites(store),templates:listHFTemplates(store),
    collectiveHistory:listHFCollectiveHistory(store)
  };
}
/** Pass only the HF local-profile id known by the app, never a raw URL prefix. */
export function hfScopedStorage(storage,profileId='personal'){
  if(!/^(personal|[a-f0-9]{32})$/.test(profileId))fail('Perfil HF no válido.');
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')
    fail('Almacenamiento del navegador no disponible.');
  const prefix='hf:'+profileId+':';
  return {
    getItem:key=>storage.getItem(prefix+key),
    setItem:(key,value)=>storage.setItem(prefix+key,value),
    removeItem:key=>storage.removeItem(prefix+key)
  };
}
