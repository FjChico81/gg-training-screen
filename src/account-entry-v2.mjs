/**
 * Login-first browser experience for GG FAMILY / HF TRAINING.
 * This is an integration candidate. NEVER enable in production until both
 * dedicated project schemas, RLS, login and two-device sync are verified.
 */
import {createEditionCloud,createProfileSync,profileLocalId,profileUUID} from './authenticated-sync-v2.mjs';
const edition=new URLSearchParams(location.search).get('app')==='hf'?'hf':'gg';
const config=edition==='hf'
 ?(await import('../config/hf-supabase.js')).HF_SUPABASE_CONFIG
 :(await import('../config/gg-supabase.js')).GG_SUPABASE_CONFIG;
const title=edition==='hf'?'HF · Hybrid Funcional Club':'BUHARDILLA Fitness';
const wall=document.getElementById('accountWall');
const by=id=>document.getElementById(id);
const message=(text,isError=false)=>{by('accountMessage').textContent=text;by('accountMessage').dataset.error=String(isError)};
const cloud=createEditionCloud({url:config.url,publishableKey:config.publishableKey,edition,storage:localStorage});
const bridge=window.__secureAppV2;
if(!bridge)throw Error('Falta el enlace de la aplicación al motor de acceso.');
let running=false,controller=null,profiles=[],currentUser=null,selectedProfile=null;
by('accountBrand').textContent=title;
const locked=()=>{document.documentElement.dataset.access='locked';wall.classList.remove('hidden')};
const unlock=()=>{document.documentElement.dataset.access='unlocked';wall.classList.add('hidden')};
function setBusy(busy){running=busy;for(const name of ['accountLogin','accountRegister','accountRetry'])by(name).disabled=busy}
const checkedProfile=()=>{
 const localId=new URLSearchParams(location.search).get('perfil')||'personal';
 const candidate=profiles.find(p=>profileLocalId(currentUser.id,p.id)===localId);
 return candidate||profiles.find(p=>p.is_primary)||profiles[0];
};
function schedule(){
 if(!controller||!navigator.onLine||document.visibilityState==='hidden')return;
 void controller.synchronize();
}
async function ready(){
 message('Verificando cuenta y permisos…');
 const user=await cloud.verify();
 if(!user){locked();message('Inicia sesión para acceder a tus entrenamientos y a tu historial.');return false}
 currentUser=user;
 profiles=await cloud.profiles();
 if(!profiles.length)throw Error('No se ha podido crear o recuperar tu perfil.');
 bridge.setProfiles(user.id,profiles);
 selectedProfile=checkedProfile();
 if(!selectedProfile)throw Error('Perfil no autorizado.');
 const localId=profileLocalId(user.id,selectedProfile.id);
 const requested=new URLSearchParams(location.search).get('perfil')||'personal';
 if(localId!==requested){
  const url=new URL(location.href);
  if(localId==='personal')url.searchParams.delete('perfil');
  else url.searchParams.set('perfil',localId);
  location.replace(url.href);return false;
 }
 if(!bridge.useProfile(user.id,localId))return false;
 const prefix=bridge.storagePrefix();
 const existing=bridge.snapshot();
 // Backup only in the authenticated namespace. Legacy local workouts are
 // deliberately NOT imported. This never deletes any old local data.
 if((existing.workouts.length||existing.history.length)&&localStorage.getItem(prefix+'sync-before-first-pull-v2')===null){
  localStorage.setItem(prefix+'sync-before-first-pull-v2',JSON.stringify(existing));
 }
 controller=createProfileSync({
  cloud,profileId:profileUUID(user.id,localId),storage:localStorage,prefix,
  blocked:()=>bridge.busy(),onApply:(view,options)=>bridge.apply(view,options),
  onState:text=>{const el=by('accountSyncState');if(el)el.textContent=text}
 });
 bridge.setController(controller);
 await controller.initial();
 window.__secureAccount={logout:signOut,schedule,createProfile:addProfile,edition};
 by('accountUser').textContent=user.email||'Cuenta personal';
 by('accountSyncState').textContent='Cuenta verificada. Sincronización activa.';
 unlock();schedule();
 return true;
}
async function signOut(){
 if(bridge.busy()){alert('Finaliza la sesión en curso antes de cerrar sesión.');return}
 await cloud.logout();
 bridge.setController(null);
 currentUser=null;selectedProfile=null;controller=null;
 locked();message('Sesión cerrada. Inicia sesión para acceder.');
}
async function addProfile(){
 if(!currentUser)throw Error('Primero inicia sesión.');
 const name=prompt('Nombre del perfil (se sincronizará en todos tus dispositivos)')?.trim();
 if(!name)return;
 const created=await cloud.createProfile(name);
 profiles=[...profiles,created];
 bridge.setProfiles(currentUser.id,profiles);
 const url=new URL(location.href);
 url.searchParams.set('perfil',profileLocalId(currentUser.id,created.id));
 location.assign(url.href);
}
by('accountLogin').onclick=()=>run(async()=>{
 message('Iniciando sesión en '+title+'…');
 await cloud.login(by('accountEmail').value,by('accountPassword').value);
 by('accountPassword').value='';
 await ready();
});
by('accountRegister').onclick=()=>run(async()=>{
 message('Creando cuenta en '+title+'…');
 await cloud.register(by('accountEmail').value,by('accountPassword').value);
 by('accountPassword').value='';
 message('Cuenta solicitada. Revisa tu correo para confirmar el registro y después inicia sesión.');
});
by('accountRetry').onclick=()=>run(ready);
by('accountLogout').onclick=()=>run(signOut);
by('addLocalProfile').onclick=()=>run(addProfile);
async function run(action){
 if(running)return;
 setBusy(true);
 try{await action()}
 catch(error){locked();message(error?.message||'No se pudo verificar tu cuenta.',true)}
 finally{setBusy(false)}
}
window.addEventListener('online',schedule);
window.addEventListener('focus',schedule);
document.addEventListener('visibilitychange',schedule);
window.addEventListener('pagehide',()=>{});
setInterval(schedule,30000);
locked();void run(ready);
