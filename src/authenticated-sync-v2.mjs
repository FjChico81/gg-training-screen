/**
 * GG FAMILY / HF TRAINING · authenticated v2 REST client.
 *
 * No service key, no HPS, no backend side effects until the caller explicitly
 * supplies the matching edition's URL + publishable key and enables login.
 * Offline changes are queued per account and profile, never mixed with legacy
 * local data. Only authenticated users can reach v2 tables (server RLS).
 */
const VALID_UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const KINDS=new Set(['workout','history','active','preferences','collective','class_state']);
const OFFLINE_MAX_AGE_MS=7*24*60*60*1000;
const isOffline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;
const safeJSON=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback}catch{return fallback}};
const clone=x=>JSON.parse(JSON.stringify(x));
const encode=encodeURIComponent;
function assertUUID(s){if(!VALID_UUID.test(s))throw Error('Identificador de usuario o perfil no válido.')}
function assertKind(kind){if(!KINDS.has(kind))throw Error('Tipo de registro no permitido.')}
function assertId(s){if(typeof s!=='string'||s.length<1||s.length>128)throw Error('Identificador de registro no válido.')}
function requestError(data,status){
 const code=data?.code||data?.error_code||null;
 return Object.assign(new Error(data?.msg||data?.message||data?.error_description||data?.error||'HTTP '+status),{status,code});
}
export class SecureSyncConflict extends Error {
 constructor(message){super(message);this.name='SecureSyncConflict'}
}
export function createEditionCloud({url,publishableKey,edition,storage,fetchImpl=fetch,now=Date.now,offline=isOffline}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!/^sb_publishable_[\w-]+$/.test(publishableKey)||!['gg','hf'].includes(edition))
  throw Error('Configuración pública independiente GG/HF incompleta.');
 if(!storage?.getItem||!storage?.setItem)throw Error('Almacenamiento no disponible.');
 const authKey='secure-'+edition+'-auth-v2';
 const head=()=>({apikey:publishableKey,'Content-Type':'application/json'});
 let auth=safeJSON(storage.getItem(authKey),null);
 let verified=false;
 async function request(path,{method='GET',token=auth?.access_token,body,headers={}}={}){
  const res=await fetchImpl(url+path,{
   method,headers:{...head(),...(token?{Authorization:'Bearer '+token}:{}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const text=await res.text();
  const result=safeJSON(text,text);
  if(!res.ok)throw requestError(result,res.status);
  return result;
 }
 function remember(data){
  if(!VALID_UUID.test(data?.user?.id)||!data.access_token||!data.refresh_token||!Number.isFinite(Number(data.expires_in)))
   throw Error('La respuesta de autenticación no es válida.');
  auth={user:{id:data.user.id,email:data.user.email||''},access_token:data.access_token,
   refresh_token:data.refresh_token,expiresAt:now()+Number(data.expires_in)*1000};
  storage.setItem(authKey,JSON.stringify(auth));verified=true;
  return auth.user;
 }
 async function refresh(){
  if(!auth?.refresh_token)throw Error('Vuelve a iniciar sesión.');
  const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',token:null,body:{refresh_token:auth.refresh_token}});
  return remember(data);
 }
 async function verify(){
  if(!auth){verified=false;return null}
  assertUUID(auth.user?.id);
  if(offline()){
   if(!Number.isFinite(auth.lastVerifiedAt)||now()-auth.lastVerifiedAt<0||now()-auth.lastVerifiedAt>OFFLINE_MAX_AGE_MS)
    throw Error('Es necesario conectarte a Internet al menos una vez para autorizar el acceso sin conexión.');
   verified=true;return {id:auth.user.id,email:auth.user.email||'',offline:true};
  }
  if(auth.expiresAt<=now()+60_000)await refresh();
  const data=await request('/auth/v1/user');
  if(data?.id!==auth.user.id)throw Error('La cuenta ha cambiado. Vuelve a iniciar sesión.');
  auth.user.email=data.email||auth.user.email||'';
  auth.lastVerifiedAt=now();
  storage.setItem(authKey,JSON.stringify(auth));
  verified=true;return {id:data.id,email:auth.user.email};
 }
 async function login(email,password){
  if(typeof email!=='string'||!email.includes('@')||typeof password!=='string'||!password)throw Error('Introduce correo y contraseña.');
  const data=await request('/auth/v1/token?grant_type=password',{method:'POST',token:null,body:{email:email.trim(),password}});
  remember(data);return verify();
 }
 async function register(email,password){
  if(!email||!password||password.length<8)throw Error('Correo y contraseña de al menos 8 caracteres.');
  return request('/auth/v1/signup',{method:'POST',token:null,body:{email:email.trim(),password}});
 }
 async function logout(){
  const token=auth?.access_token;
  auth=null;verified=false;
  storage.removeItem(authKey);
  if(token){try{await request('/auth/v1/logout?scope=local',{method:'POST',token})}catch{}}
 }
 function check(){if(!verified||!auth?.user?.id)throw Error('Inicia sesión y verifica tu cuenta.');}
 function owner(){check();return auth.user.id}
 async function profiles(){
  const uid=owner();
  const cacheKey=authKey+':profiles:'+uid;
  if(offline()){
   const cache=safeJSON(storage.getItem(cacheKey),null);
   if(!cache||cache.uid!==uid||!Array.isArray(cache.rows)||!Number.isFinite(cache.at)||
     now()-cache.at<0||now()-cache.at>OFFLINE_MAX_AGE_MS)
    throw Error('Los perfiles necesitan sincronizarse una vez con Internet antes de usarlos sin conexión.');
   return clone(cache.rows);
  }
  if(auth.expiresAt<=now()+60_000)await verify();
  let rows=await request('/rest/v1/training_profiles_v2?select=id,owner_id,name,is_primary,updated_at&owner_id=eq.'+uid+'&order=created_at.asc');
  if(!Array.isArray(rows))throw Error('No se pudieron recuperar los perfiles.');
  if(!rows.length){
   try{
    await request('/rest/v1/training_profiles_v2',{method:'POST',
     headers:{Prefer:'return=minimal'},body:{id:uid,owner_id:uid,name:'Principal',is_primary:true}});
   }catch(error){if(error.code!=='23505')throw error}
   rows=await request('/rest/v1/training_profiles_v2?select=id,owner_id,name,is_primary,updated_at&owner_id=eq.'+uid+'&order=created_at.asc');
  }
  if(!Array.isArray(rows)||!rows.length||rows.some(p=>p.owner_id!==uid||!VALID_UUID.test(p.id)))
   throw Error('Perfil devuelto sin autorización.');
  storage.setItem(cacheKey,JSON.stringify({uid,rows,at:now()}));
  return rows;
 }
 async function createProfile(name){
  const uid=owner(),clean=String(name||'').trim();
  if(!clean||clean.length>60)throw Error('Nombre de perfil inválido.');
  const id=crypto.randomUUID();assertUUID(id);
  const rows=await request('/rest/v1/training_profiles_v2?select=id,owner_id,name,is_primary',{
   method:'POST',headers:{Prefer:'return=representation'},
   body:{id,owner_id:uid,name:clean,is_primary:false}});
  if(!Array.isArray(rows)||rows[0]?.id!==id)throw Error('No se ha podido crear el perfil.');
  const cacheKey=authKey+':profiles:'+uid;
  const cache=safeJSON(storage.getItem(cacheKey),null);
  if(cache?.uid===uid&&Array.isArray(cache.rows))storage.setItem(cacheKey,
   JSON.stringify({uid,rows:[...cache.rows,rows[0]],at:now()}));
  return rows[0];
 }
 async function renameProfile(profileId,name){
  const uid=owner(),clean=String(name||'').trim();
  assertUUID(profileId);
  if(!clean||clean.length>60)throw Error('Escribe un nombre de entre 1 y 60 caracteres.');
  if(offline())throw Error('Conéctate a Internet para editar el perfil.');
  if(auth.expiresAt<=now()+60_000)await verify();
  const rows=await request('/rest/v1/training_profiles_v2?select=id,owner_id,name,is_primary,updated_at&owner_id=eq.'+uid+'&id=eq.'+profileId,{
   method:'PATCH',headers:{Prefer:'return=representation'},body:{name:clean}});
  const saved=Array.isArray(rows)&&rows.length===1?rows[0]:null;
  if(saved?.id!==profileId||saved.owner_id!==uid||saved.name!==clean)throw Error('No se pudo confirmar el nombre del perfil.');
  const cacheKey=authKey+':profiles:'+uid;
  const cache=safeJSON(storage.getItem(cacheKey),null);
  if(cache?.uid===uid&&Array.isArray(cache.rows))storage.setItem(cacheKey,
   JSON.stringify({...cache,rows:cache.rows.map(row=>row.id===saved.id?saved:row)}));
  return saved;
 }
 async function deleteProfile(profileId){
  const uid=owner();
  assertUUID(profileId);
  if(profileId===uid)throw Error('El perfil Principal no se puede eliminar.');
  if(offline())throw Error('Conéctate a Internet para eliminar un perfil.');
  if(auth.expiresAt<=now()+60_000)await verify();
  const deleted=await request('/rest/v1/rpc/delete_training_profile_v2',{
   method:'POST',body:{target_profile_id:profileId}});
  if(typeof deleted!=='boolean')throw Error('No se pudo confirmar la eliminación del perfil.');
  const cacheKey=authKey+':profiles:'+uid;
  const cache=safeJSON(storage.getItem(cacheKey),null);
  if(deleted&&cache?.uid===uid&&Array.isArray(cache.rows))storage.setItem(cacheKey,
   JSON.stringify({...cache,rows:cache.rows.filter(profile=>profile.id!==profileId)}));
  return deleted;
 }
 async function garminActivities(importNow=false){
  check();
  if(edition!=='gg'||offline())throw Error('Conéctate a Internet desde BUHARDILLA para usar Garmin.');
  if(auth.expiresAt<=now()+60_000)await verify();
  return request('/functions/v1/garmin-activities',{method:importNow?'POST':'GET'});
 }
 async function getRecords(profileId){
  const uid=owner();assertUUID(profileId);
  const list=[];let offset=0;
  while(true){
   const result=await request('/rest/v1/training_records_v2?select=owner_id,profile_id,kind,client_id,payload,revision,deleted_at,updated_at'+
      '&owner_id=eq.'+uid+'&profile_id=eq.'+profileId+
      '&order=kind.asc,client_id.asc&limit=300&offset='+offset);
   if(!Array.isArray(result)||result.some(x=>x.owner_id!==uid||x.profile_id!==profileId))
     throw Error('Respuesta de sincronización inválida.');
   list.push(...result);
   if(result.length<300)return list;
   offset+=300;
   if(offset>50000)throw Error('Demasiados registros. Revisa el historial.');
  }
 }
 async function upsertRevision(profileId,item,expectedRevision){
  const uid=owner();assertUUID(profileId);assertKind(item.kind);assertId(item.client_id);
  if(!item.payload||typeof item.payload!=='object'||Array.isArray(item.payload))throw Error('Registro incompatible.');
  const payload={owner_id:uid,profile_id:profileId,kind:item.kind,client_id:item.client_id,
    payload:item.payload,deleted_at:item.deleted_at||null};
  if(expectedRevision===null){
   const rows=await request('/rest/v1/training_records_v2?select=revision',{
    method:'POST',headers:{Prefer:'return=representation'},body:{...payload,revision:1}});
   if(!Array.isArray(rows)||rows.length!==1)throw new SecureSyncConflict('El registro ya existe en otro dispositivo.');
   return 1;
  }
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('Revisión local inválida.');
  const query='/rest/v1/training_records_v2?select=revision&owner_id=eq.'+uid+
    '&profile_id=eq.'+profileId+'&kind=eq.'+encode(item.kind)+
    '&client_id=eq.'+encode(item.client_id)+'&revision=eq.'+expectedRevision;
  const rows=await request(query,{method:'PATCH',headers:{Prefer:'return=representation'},
    body:{payload:item.payload,deleted_at:item.deleted_at||null,revision:expectedRevision+1,updated_at:new Date(now()).toISOString()}});
  if(!Array.isArray(rows)||rows.length!==1)
   throw new SecureSyncConflict('Otro dispositivo ha modificado este registro; se conserva la copia local.');
  return expectedRevision+1;
 }
 return {edition,authKey,get verified(){return verified},get user(){return verified?auth?.user:null},
  verify,login,register,logout,profiles,createProfile,renameProfile,deleteProfile,getRecords,upsertRevision,garminActivities};
}
export function profileUUID(uid,profileId){
 assertUUID(uid);
 if(profileId==='personal')return uid;
 const compact=String(profileId).toLowerCase();
 if(!/^[a-f0-9]{32}$/.test(compact))throw Error('Perfil inválido.');
 return compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
}
export function profileLocalId(uid,profileUUIDValue){
 assertUUID(uid);assertUUID(profileUUIDValue);
 return uid===profileUUIDValue?'personal':profileUUIDValue.replace(/-/g,'');
}
export function recordKey(kind,id){assertKind(kind);assertId(id);return kind+':'+id}
export function createProfileSync({cloud,profileId,storage,prefix,onApply,blocked=()=>false,onState=()=>{},now=Date.now}){
 const stateKey=prefix+'sync-v2-state',pendingKey=prefix+'sync-v2-pending';
 let shadow=safeJSON(storage.getItem(stateKey),{}),pending=safeJSON(storage.getItem(pendingKey),{});
 if(!shadow||Array.isArray(shadow)||typeof shadow!=='object')shadow={};
 if(!pending||Array.isArray(pending)||typeof pending!=='object')pending={};
 let running=false,queued=false,lastLocal={workout:{},history:{},active:{}};
 const loadArray=(raw)=>{const rows=safeJSON(raw,[]);return Array.isArray(rows)?rows:[]};
 const toMap=(rows,kind)=>Object.fromEntries(rows.filter(x=>{
   const id=kind==='collective'?x?.runId:x?.id;
   return x&&typeof id==='string'&&id.length<=128;
  }).map(x=>[kind==='collective'?x.runId:x.id,clone(x)]));
 function persist(){storage.setItem(stateKey,JSON.stringify(shadow));storage.setItem(pendingKey,JSON.stringify(pending));}
 function seedLocal({workouts=[],history=[],active=null,collective=[],class_state=null}={}){
  lastLocal={workout:toMap(workouts,'workout'),history:toMap(history,'history'),
    active:active?{current:clone(active)}:{},
    collective:toMap(collective,'collective'),
    class_state:class_state?{current:clone(class_state)}:{}};
 }
 function changed(kind,content,{insertOnly=false}={}){
  assertKind(kind);
  if(!['workout','history','active','collective','class_state'].includes(kind))return;
  const single=kind==='active'||kind==='class_state';
  const after=single?(content&&typeof content==='object'?{current:content}:{}):toMap(loadArray(content),kind);
  const before=lastLocal[kind]||{};
  for(const [id,item] of Object.entries(after)){
   if(JSON.stringify(before[id])!==JSON.stringify(item)){
    const key=recordKey(kind,id);
    pending[key]={kind,client_id:id,payload:clone(item),deleted_at:null,at:now(),...(insertOnly&&!before[id]?{insert_only:true}:{})};
   }
  }
  if(!single)for(const id of Object.keys(before)){
   if(!(id in after)){const key=recordKey(kind,id);
    pending[key]={kind,client_id:id,payload:{id},deleted_at:new Date(now()).toISOString(),at:now()}}
  }
  lastLocal[kind]=after;persist();queued=true;
 }
 async function synchronize(){
  if(running){queued=true;return}
  if(blocked()){onState('Sincronización pausada durante la actividad.');return}
  running=true;queued=false;
  try{
   if(!cloud.verified)throw Error('Sesión de usuario no verificada.');
   // Read the server FIRST. Never push an unacknowledged change without
   // comparing it to the last revision read from the server.
   const remote=await cloud.getRecords(profileId);
   const byKey=new Map(remote.map(x=>[recordKey(x.kind,x.client_id),x]));
   const unresolved={};
   for(const [key,item] of Object.entries(pending)){
    const server=byKey.get(key),revision=shadow[key]?.revision??null;
    // An import is insert-only. An existing Garmin ID, even a deleted one,
    // takes precedence over a concurrent import from another device.
    if(server&&item.insert_only){
     if(pending[key]===item)delete pending[key];
     else queued=true;
     continue;
    }
    const conflict=Boolean(server)&&(revision===null||Number(server.revision)!==Number(revision));
    if(conflict||(!server&&revision!==null)){
     unresolved[key]=item;continue;
    }
    try{
     const newRevision=await cloud.upsertRevision(profileId,item,revision);
     shadow[key]={revision:newRevision};
     byKey.set(key,{...item,revision:newRevision});
     // A second edit may have arrived while the network request was pending.
     // Never acknowledge/delete a newer local change with an older response.
     if(pending[key]===item)delete pending[key];
     else queued=true;
    }catch(error){
     if(item.insert_only&&error.code==='23505'){queued=true;continue}
     unresolved[key]=item;
     if(!(error instanceof SecureSyncConflict))onState('Cambio pendiente: '+error.message);
    }
   }
   persist();
   // Pending local changes never get overwritten by remote data.
   const mapped={workout:{},history:{},active:{},collective:{},class_state:{}};
   for(const [key,server] of byKey){
    if(!mapped[server.kind])continue;
    if(server.deleted_at||pending[key])continue;
    if(!server.payload||typeof server.payload!=='object')continue;
    mapped[server.kind][server.client_id]=clone(server.payload);
    shadow[key]={revision:Number(server.revision)};
   }
   // Merge any unsent, new local changes into the visible result.
   for(const [key,item] of Object.entries(pending)){
    if(!mapped[item.kind])continue;
    if(item.deleted_at)delete mapped[item.kind][item.client_id];
    else mapped[item.kind][item.client_id]=clone(item.payload);
   }
   // If pending conflicted with remote, keep the local draft and alert.
   const view={workouts:Object.values(mapped.workout),history:Object.values(mapped.history),active:mapped.active.current||null,
    collective:Object.values(mapped.collective),class_state:mapped.class_state.current||null};
   if(!blocked())await onApply(view,{initial:false,conflicts:Object.keys(unresolved).length});
   seedLocal(view);persist();
   onState(Object.keys(unresolved).length
     ?'Hay cambios en conflicto. Se conservan localmente; revisa antes de continuar.'
     :'Sincronizado con tus dispositivos.');
  }catch(error){onState('Pendiente de sincronizar: '+error.message)}
  finally{running=false;if(queued&&!blocked())queueMicrotask(()=>synchronize())}
 }
 async function initial(){
  if(!cloud.verified)throw Error('Debes iniciar sesión antes de cargar los entrenamientos.');
  const rows=await cloud.getRecords(profileId);
  const map={workout:{},history:{},active:{},collective:{},class_state:{}};
  for(const r of rows){const k=recordKey(r.kind,r.client_id);if(!pending[k])shadow[k]={revision:Number(r.revision)};
   if(!r.deleted_at&&map[r.kind]&&r.payload&&typeof r.payload==='object')map[r.kind][r.client_id]=clone(r.payload)
  }
  for(const [k,item] of Object.entries(pending)){if(!map[item.kind])continue;
   if(item.deleted_at)delete map[item.kind][item.client_id];else map[item.kind][item.client_id]=clone(item.payload)}
  const result={workouts:Object.values(map.workout),history:Object.values(map.history),active:map.active.current||null,
    collective:Object.values(map.collective),class_state:map.class_state.current||null};
  await onApply(result,{initial:true});seedLocal(result);persist();
  if(Object.keys(pending).length)void synchronize();
  return result;
 }
 return {initial,changed,synchronize,seedLocal,pendingCount:()=>Object.keys(pending).length};
}
