/**
 * Login-first browser experience for GG FAMILY / HF TRAINING.
 * This is an integration candidate. NEVER enable in production until both
 * dedicated project schemas, RLS, login and two-device sync are verified.
 */
import {createEditionCloud,createProfileSync,profileLocalId,profileUUID} from './authenticated-sync-v2.mjs?v=3.0.3';
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
let profileRefresh=null,profileMissing=false,profileRemoving=false;
const deleteButton=by('deleteLocalProfile');
const garminButton=by('garminImport');
let importingGarmin=false;
async function showGarminImport(user, profile){
 garminButton.classList.add('hidden');
 if(edition!=='gg'||!profile.is_primary||user.offline)return;
 try{
  const result=await cloud.garminActivities();
  if(currentUser===user&&selectedProfile===profile&&result.enabled===true)garminButton.classList.remove('hidden');
 }catch{ /* Other accounts and deployments without Garmin keep the control hidden. */ }
}
garminButton.onclick=async()=>{
 const user=currentUser,profile=selectedProfile;
 if(importingGarmin||edition!=='gg'||!user||!profile?.is_primary||profileMissing)return;
 const status=by('garminImportStatus');
 if(bridge.busy()){status.textContent='Termina tu sesión de BUHARDILLA antes de importar.';return}
 importingGarmin=true;garminButton.disabled=true;status.textContent='Consultando Garmin Connect…';
 try{
  const result=await cloud.garminActivities(true);
  const remote=await cloud.getRecords(profile.id);
  if(!Array.isArray(result.activities))throw Error('Historial de Garmin inválido.');
  const remoteHistory=remote.filter(record=>record.kind==='history');
  const known=new Set(remoteHistory.map(record=>record.client_id));
  if(currentUser!==user||selectedProfile!==profile||profileMissing)return;
  const {imported,overlapping}=bridge.importGarminActivities(
   result.activities.filter(entry=>!known.has('garmin-'+entry?.id)),
   remoteHistory.filter(record=>!record.deleted_at).map(record=>record.payload)
  );
  const received=imported===1?'1 actividad de Garmin incorporada.':imported+' actividades de Garmin incorporadas.';
  const skipped=overlapping===1?' Se omitió 1 actividad porque coincide con una sesión de BUHARDILLA.':overlapping?' Se omitieron '+overlapping+' actividades porque coinciden con sesiones de BUHARDILLA.':'';
  status.textContent=imported||overlapping?received+skipped:'No hay actividades nuevas entre las últimas 30.';
 }catch(error){
  if(currentUser===user&&selectedProfile===profile)status.textContent=error.message;
 }finally{garminButton.disabled=false;importingGarmin=false}
};
const syncStatus=text=>{by('accountSyncState').textContent=text};
function profileStatus(text){
 const status=by('profileActionStatus');
 status.textContent=text;
 status.classList.toggle('hidden',!text);
}
function updateDeleteButton(){
 deleteButton.classList.toggle('hidden',!selectedProfile||selectedProfile.is_primary||selectedProfile.id===currentUser?.id||profileMissing);
 deleteButton.disabled=profileRemoving;
}
function goToProfile(localId,replace=false){
 const url=new URL(location.href);
 if(localId==='personal')url.searchParams.delete('perfil');
 else url.searchParams.set('perfil',localId);
 if(replace)location.replace(url.href);
 else location.assign(url.href);
}
by('accountBrand').textContent=title;
function locked(phase='login'){
 document.documentElement.dataset.access='locked';
 wall.dataset.phase=phase;
 wall.classList.remove('hidden');
}
const unlock=()=>{document.documentElement.dataset.access='unlocked';wall.classList.add('hidden')};
function setBusy(busy){running=busy;for(const name of ['accountLogin','accountRegister','accountRetry'])by(name).disabled=busy}
const checkedProfile=()=>{
 const localId=new URLSearchParams(location.search).get('perfil')||'personal';
 const candidate=profiles.find(p=>profileLocalId(currentUser.id,p.id)===localId);
 return candidate||profiles.find(p=>p.is_primary)||profiles[0];
};
function leaveMissingProfile(){
 bridge.setController(null);
 controller=null;
 if(bridge.busy()){
  syncStatus('Este perfil se ha eliminado. Termina la actividad o cierra el editor para volver a Principal.');
  return;
 }
 goToProfile('personal',true);
}
function schedule(){
 if((!controller&&!profileMissing)||running||profileRemoving||!navigator.onLine||document.visibilityState==='hidden')return;
 if(profileMissing){leaveMissingProfile();return}
 if(profileRefresh||bridge.busy())return;
 profileRefresh=refreshProfiles().finally(()=>{profileRefresh=null});
}
async function refreshProfiles(){
 const user=currentUser;
 try{
  const latest=await cloud.profiles();
  if(currentUser!==user||running||profileRemoving)return;
  if(!latest.some(profile=>profile.id===selectedProfile?.id)){
   profiles=latest;
   profileMissing=true;
   updateDeleteButton();
   leaveMissingProfile();
   return;
  }
  const roster=rows=>JSON.stringify(rows.map(({id,name,is_primary})=>[id,name,is_primary]));
  if(roster(latest)!==roster(profiles))bridge.setProfiles(user.id,latest);
  profiles=latest;
  void controller.synchronize();
 }catch(error){
  if(currentUser===user&&!profileRemoving)syncStatus('Pendiente de sincronizar: '+error.message);
 }
}
async function ready(){
 locked('loading');
 const user=await cloud.verify();
 if(!user){locked();message('Inicia sesión para acceder a tus entrenamientos y a tu historial.');return false}
 currentUser=user;
 profiles=await cloud.profiles();
 if(!profiles.length)throw Error('No se ha podido crear o recuperar tu perfil.');
 bridge.setProfiles(user.id,profiles);
 selectedProfile=checkedProfile();
 profileMissing=false;
 profileStatus('');
 updateDeleteButton();
 if(!selectedProfile)throw Error('Perfil no autorizado.');
 const localId=profileLocalId(user.id,selectedProfile.id);
 const requested=new URLSearchParams(location.search).get('perfil')||'personal';
 if(localId!==requested){
  goToProfile(localId,true);return false;
 }
 if(!bridge.useProfile(user.id,localId))throw Error('No se ha podido abrir el perfil. Vuelve a intentarlo.');
 const prefix=bridge.storagePrefix();
 const existing=bridge.snapshot();
 // Backup only in the authenticated namespace. Legacy local workouts are
 // deliberately NOT imported. This never deletes any old local data.
 if((existing.workouts.length||existing.history.length)&&localStorage.getItem(prefix+'sync-before-first-pull-v2')===null){
  localStorage.setItem(prefix+'sync-before-first-pull-v2',JSON.stringify(existing));
 }
 controller=createProfileSync({
  cloud,profileId:profileUUID(user.id,localId),storage:localStorage,prefix,
  blocked:()=>bridge.busy()||profileRemoving||profileMissing,onApply:(view,options)=>bridge.apply(view,options),
  onState:text=>{if(!profileMissing)syncStatus(text)}
 });
 bridge.setController(controller);
 if(user.offline){
  // Only already-verified accounts/profile caches can enter offline. Work remains
  // under the authenticated namespace; local edits queue automatically.
  controller.seedLocal(existing);
  by('accountUser').textContent=user.email||'Cuenta personal';
  by('accountSyncState').textContent='Sin conexión · los cambios quedarán pendientes de sincronizar.';
  window.__secureAccount={logout:signOut,schedule,createProfile:addProfile,edition};
  unlock();
  return true;
 }
 await controller.initial();
 window.__secureAccount={logout:signOut,schedule,createProfile:addProfile,edition};
 by('accountUser').textContent=user.email||'Cuenta personal';
 by('accountSyncState').textContent='Cuenta verificada. Sincronización activa.';
 unlock();
 void showGarminImport(user,selectedProfile);
 return true;
}
async function signOut(){
 if(bridge.busy()){alert('Finaliza la sesión en curso antes de cerrar sesión.');return}
 await cloud.logout();
 garminButton.classList.add('hidden');
 by('garminImportStatus').textContent='';
 bridge.setController(null);
 currentUser=null;selectedProfile=null;controller=null;profileMissing=false;
 updateDeleteButton();
 locked();message('Sesión cerrada. Inicia sesión para acceder.');
}
async function addProfile(){
 if(!currentUser)throw Error('Primero inicia sesión.');
 const name=prompt('Nombre del perfil (se sincronizará en todos tus dispositivos)')?.trim();
 if(!name)return;
 const created=await cloud.createProfile(name);
 profiles=[...profiles,created];
 bridge.setProfiles(currentUser.id,profiles);
 goToProfile(profileLocalId(currentUser.id,created.id));
}
async function removeSelectedProfile(){
 const profile=selectedProfile;
 if(running||profileRemoving||profileMissing||!currentUser||!profile||profile.is_primary||profile.id===currentUser.id)return;
 profileStatus('');
 if(bridge.busy()){
  profileStatus('Termina la actividad o cierra el editor antes de eliminar el perfil.');
  return;
 }
 if(!navigator.onLine){profileStatus('Conéctate a Internet para eliminar el perfil.');return}
 if(!confirm('¿Eliminar el perfil «'+profile.name+'»? Sus rutinas e historial sincronizados se borrarán de la cuenta. Esta acción no se puede deshacer.'))return;
 profileRemoving=true;
 updateDeleteButton();
 profileStatus('Eliminando perfil…');
 try{
  await profileRefresh;
  const deleted=await cloud.deleteProfile(profile.id);
  const remaining=deleted?profiles.filter(item=>item.id!==profile.id):await cloud.profiles();
  if(remaining.some(item=>item.id===profile.id)){
   profileStatus('Este perfil está protegido y no se puede eliminar.');
   return;
  }
  profileMissing=true;
  bridge.setProfiles(currentUser.id,remaining);
  profileStatus('Perfil eliminado.');
  leaveMissingProfile();
 }catch{
  profileStatus('No se pudo confirmar la eliminación. Comprueba la conexión y vuelve a intentarlo.');
 }finally{
  profileRemoving=false;
  updateDeleteButton();
  if(!profileMissing)schedule();
 }
}
deleteButton.onclick=removeSelectedProfile;
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
 if(running||profileRemoving)return;
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
void run(ready);
