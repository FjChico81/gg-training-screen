/**
 * HF collective entry is protected independently of navigation from HF home.
 * No class code starts until user identity and selected profile are verified.
 */
import {createEditionCloud,profileLocalId} from './authenticated-sync-v2.mjs';
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
  window.__HF_V2_BOOT(user.id);
  document.documentElement.dataset.access='unlocked';
 }
}catch(error){
 document.documentElement.dataset.access='locked';
 status.textContent='Acceso bloqueado: '+(error?.message||'No se pudo validar la sesión.');
}
