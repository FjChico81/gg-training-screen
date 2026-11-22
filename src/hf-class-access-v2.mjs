/**
 * HF collective: login-only access and scoped cloud record synchronization.
 * No legacy data is migrated. No other Supabase project is accessed.
 */
import {createEditionCloud,createProfileSync,profileLocalId} from './authenticated-sync-v2.mjs';
import {HF_SUPABASE_CONFIG} from '../config/hf-supabase.js';
const status=document.getElementById('hfAccessStatus');
try{
 const cloud=createEditionCloud({...HF_SUPABASE_CONFIG,edition:'hf',storage:localStorage});
 const user=await cloud.verify();
 if(!user){status.textContent='Inicia sesión en HF TRAINING antes de abrir una clase.'}
 else{
  const profiles=await cloud.profiles();
  const requested=new URLSearchParams(location.search).get('hfProfile')||'personal';
  const selected=profiles.find(p=>profileLocalId(user.id,p.id)===requested);
  if(!selected)throw Error('El perfil de HF no pertenece a tu cuenta. Abre HF y selecciona un perfil autorizado.');
  if(typeof window.__HF_V2_BOOT!=='function')throw Error('La pantalla de clase no ha podido iniciarse.');
  const root='hf-auth-v2:'+user.id+':'+requested+':';
  const historyKey='hf:'+requested+':hf-collective-history-v1';
  const checkpointKey='hf:collective-class:checkpoint:v1';
  const localHistory=root+historyKey,localCheckpoint=root+checkpointKey;
  let debounce=null;
  const report=(message)=>{const el=document.getElementById('hfAccessStatus');if(el)el.textContent=message};
  const sync=createProfileSync({
   cloud,profileId:selected.id,storage:localStorage,prefix:root+'class:'+requested+':',
   blocked:()=>false,
   onState:report,
   onApply:async(view)=>{
    const oldHistory=localStorage.getItem(localHistory);
    const existing=oldHistory?JSON.parse(oldHistory):null;
    if(view.collective.length||!existing){
     localStorage.setItem(localHistory,JSON.stringify({version:1,items:view.collective}));
    }
    if(view.class_state&&!view.class_state.ended){
     if(!window.__HF_CLASS_BUSY?.()&&!localStorage.getItem(localCheckpoint))
      localStorage.setItem(localCheckpoint,JSON.stringify(view.class_state));
    }else if(view.class_state?.ended&&!window.__HF_CLASS_BUSY?.())localStorage.removeItem(localCheckpoint);
   }
  });
  const existingHistory=localStorage.getItem(localHistory);
  const existingCheckpoint=localStorage.getItem(localCheckpoint);
  if((existingHistory||existingCheckpoint)&&!localStorage.getItem(root+'class-before-first-sync-v2')){
   localStorage.setItem(root+'class-before-first-sync-v2',
    JSON.stringify({history:existingHistory,checkpoint:existingCheckpoint}));
  }
  await sync.initial();
  function schedule(){
   if(debounce)clearTimeout(debounce);
   debounce=setTimeout(()=>{debounce=null;if(navigator.onLine)void sync.synchronize()},6000);
  }
  window.__HF_CLASS_SYNC_HOOK=(key,raw,removed)=>{
   try{
    if(key===historyKey&&raw){
     const value=JSON.parse(raw);
     if(!value||value.version!==1||!Array.isArray(value.items))return;
     sync.changed('collective',JSON.stringify(value.items));
     schedule();
    }else if(key===checkpointKey){
     const data=removed?{ended:true}:JSON.parse(raw);
     if(!data||typeof data!=='object')return;
     sync.changed('class_state',data);schedule();
    }
   }catch(error){report('Sincronización pendiente: '+(error?.message||'Error'))}
  };
  window.addEventListener('online',()=>void sync.synchronize());
  window.addEventListener('focus',()=>void sync.synchronize());
  document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible')void sync.synchronize();
  });
  window.__HF_V2_BOOT(user.id,requested);
  document.documentElement.dataset.access='unlocked';
 }
}catch(error){
 document.documentElement.dataset.access='locked';
 status.textContent='Acceso bloqueado: '+(error?.message||'No se pudo validar la sesión.');
}
