/**
 * HF · Local collective-session checkpoint, independent of GG/VECTOR storage.
 * No I/O until a caller explicitly supplies a Storage-compatible object.
 * A reopened class must be resumed manually and ALWAYS starts paused.
 */
export const HF_CHECKPOINT_KEY='hf:collective-class:checkpoint:v1';
const TTL=36*60*60*1000;
const MAX_JSON_BYTES=190000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES=new Set(['ready','work','change','finished']);
const TYPES=new Set(['amrap','emom','for-time']);
function bad(message){throw new Error('Copia de clase HF: '+message);}
function str(v,max=120){return typeof v==='string'&&v.length<=max&&v.trim().length>0;}
function int(v,min,max){return Number.isSafeInteger(v)&&v>=min&&v<=max;}
function millis(v){return int(v,0,7*24*60*60*1000);}
function checkStep(s){
  if(!s||!str(s.name,60)||!str(s.target,85)||!int(s.seconds??0,0,7200))bad('paso incompatible');
  if(s.gifId!=null&&(typeof s.gifId!=='string'||!/^[a-z0-9-]{1,70}$/.test(s.gifId)))bad('GIF inválido');
}
function validatePlan(mode,config){
  if(!config||typeof config!=='object'||Array.isArray(config))bad('configuración ausente');
  if(!Array.isArray(config.guided)||config.guided.length<1||config.guided.length>200)bad('guía fuera de rango');
  if(!Array.isArray(config.stations)||config.stations.length<2||config.stations.length>8)bad('estaciones fuera de rango');
  for(const s of config.guided)checkStep(s);
  for(const s of config.stations){
    if(!str(s.name,60)||!str(s.target,85))bad('estación inválida');
    if(s.gifId!=null&&(typeof s.gifId!=='string'||!/^[a-z0-9-]{1,70}$/.test(s.gifId)))bad('GIF inválido');
  }
  if(!int(config.rounds,1,12)||!int(config.work,10,1800)||!int(config.change,0,300))
    bad('tiempos de estaciones fuera de límites');
  const segments=config.segments??[];
  if(!Array.isArray(segments)||segments.length>80)bad('segmentos inválidos');
  let lastEnd=-1;
  for(const seg of segments){
    if(!seg||!TYPES.has(seg.type)||!int(seg.start,0,config.guided.length-1)||
      !int(seg.end,seg.start,config.guided.length-1)||seg.start<=lastEnd||
      !str(seg.label,85)||!int(seg.limitSeconds,seg.type==='for-time'?0:1,7200))
      bad('segmento avanzado incompatible');
    if(seg.type==='emom'&&(!int(seg.rounds,1,50)||seg.end-seg.start+1!==seg.rounds*2
      ||!int(seg.workSeconds,1,59)||!int(seg.restSeconds,1,59)||
      seg.workSeconds+seg.restSeconds!==60||seg.limitSeconds!==seg.rounds*60))
      bad('EMOM incompleto');
    if(seg.type==='for-time'&&!int(seg.rounds,1,20))bad('FOR TIME sin rondas');
    lastEnd=seg.end;
  }
  if(!['guided','stations'].includes(mode))bad('modo inválido');
}
function validate(data,now){
  if(!data||data.version!==1||!UUID.test(data.runId)||!str(data.title,120)||
    !['mirror','tablet'].includes(data.deviceMode)||
    !int(data.savedAt,0,Number.MAX_SAFE_INTEGER)||data.savedAt>now+300000||
    now-data.savedAt>TTL||now<data.savedAt-300000)
    bad('copia antigua o incompatible');
  validatePlan(data.mode,data.config);
  const s=data.state;
  if(!s||s.mode!==data.mode||!PHASES.has(s.phase)||
    !['work','change'].includes(s.phase)||s.paused!==true||
    !int(s.step,0,data.config.guided.length-1)||
    !int(s.turn,0,data.config.stations.length*data.config.rounds-1)||
    !millis(s.sessionElapsedMs)||!millis(s.phaseElapsedMs)||
    !(s.remainingMs===null||millis(s.remainingMs))||
    !int(s.specialIndex??-1,-1,(data.config.segments??[]).length-1)||
    !millis(s.specialElapsedMs??0)||!int(s.amrapRounds??0,0,100000))
    bad('estado de clase imposible');
  if(s.mode==='stations'&&s.phase==='change'&&data.config.change===0)bad('cambio de estación inexistente');
  if(s.mode==='guided'&&s.phase==='change')bad('cambio no permitido');
  const seg=(data.config.segments??[])[s.specialIndex];
  if(seg&&!(s.step>=seg.start&&s.step<=seg.end))bad('segmento desincronizado');
  if(!seg&&s.specialIndex!==-1)bad('segmento ausente');
  if(s.results!==undefined){
    if(!Array.isArray(s.results)||s.results.length>50)bad('resultados inválidos');
    for(const result of s.results){
      if(!result||!TYPES.has(result.type)||!str(result.label,85)
        ||!int(result.seconds,0,7200)||typeof result.complete!=='boolean')
        bad('resultado avanzado incompatible');
    }
  }
  return data;
}
/**
 * Creates a safe, already-paused snapshot at an explicit timestamp. The caller
 * must calculate elapsed and remaining time at that timestamp.
 */
export function makeHFCheckpoint({runId,title,deviceMode,config,state,now=Date.now()}){
  if(!int(now,0,Number.MAX_SAFE_INTEGER))bad('reloj inválido');
  const snap={version:1,runId,title,deviceMode,mode:state?.mode,config,state,savedAt:now};
  return validate(JSON.parse(JSON.stringify(snap)),now);
}
export function writeHFCheckpoint(store,snapshot,{now=Date.now(),allowReplace=false}={}){
  if(typeof store?.setItem!=='function'||typeof store?.getItem!=='function')bad('almacenamiento no disponible');
  validate(snapshot,now);
  const existing=store.getItem(HF_CHECKPOINT_KEY);
  if(existing&&!allowReplace){
    let old;
    try{old=JSON.parse(existing);}catch{bad('existe una copia dañada; revísala antes de continuar');}
    if(old?.runId!==snapshot.runId)bad('hay otra clase pendiente de recuperar');
  }
  const raw=JSON.stringify(snapshot);
  if(raw.length>MAX_JSON_BYTES)bad('la sesión supera el tamaño local permitido');
  store.setItem(HF_CHECKPOINT_KEY,raw);
  return true;
}
export function readHFCheckpoint(store,{now=Date.now()}={}){
  if(typeof store?.getItem!=='function')bad('almacenamiento no disponible');
  const raw=store.getItem(HF_CHECKPOINT_KEY);
  if(raw===null)return null;
  if(raw.length>MAX_JSON_BYTES)bad('copia excesivamente grande');
  let data;
  try{data=JSON.parse(raw);}catch{bad('la copia está dañada');}
  return validate(data,now);
}
/** Only user-confirmed discard or a finished session may clear this key. */
export function clearHFCheckpoint(store){
  if(typeof store?.removeItem!=='function')bad('almacenamiento no disponible');
  store.removeItem(HF_CHECKPOINT_KEY);
}
