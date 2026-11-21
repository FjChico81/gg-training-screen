/**
 * HF TRAINING live-session client (PREPARED, NOT CONNECTED TO THE UI).
 * Does nothing until explicitly instantiated and called.
 * Expects a separate HF-authenticated session and the planned RLS table.
 * Requires security review, pairing flow, SQL testing, and approval before use.
 */
import {createHFRuntime,validateHFClassPlan} from './hf-class-runtime.mjs';
const HF_HOST = 'ydaqsmrfuwhqwqojrxyr.supabase.co'; // Exclusive HF TRAINING target
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES = new Set(['ready', 'work', 'change', 'finished']);
const MODES = new Set(['guided', 'stations']);
const FIELDS = 'id,pair_id,title,mode,public_plan,runtime,revision,last_command_id,expires_at,updated_at';

export class HFRevisionConflict extends Error {
  constructor(){
    super('La sesión ha cambiado o ya no es accesible. Relee el estado antes de enviar otra orden.');
    this.name='HFRevisionConflict';
    this.code='HF_REVISION_CONFLICT';
  }
}

function assertUUID(id,label='Identificador'){
  if(typeof id!=='string'||!UUID.test(id))throw Error(label+' inválido');
}
function assertAuth(session){
  if(!session||typeof session.access_token!=='string'||!session.access_token
     ||!session.user||!session.user.id)throw Error('Inicia sesión en HF antes de usar el control remoto.');
  assertUUID(session.user.id,'Usuario HF');
}
function cleanRuntime(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Estado de clase inválido');
  if(!MODES.has(value.mode)||!PHASES.has(value.phase))throw Error('Fase de clase inválida');
  if(!Number.isInteger(value.step)||value.step<0||value.step>24
     ||!Number.isInteger(value.turn)||value.turn<0||value.turn>120
     ||typeof value.paused!=='boolean')throw Error('Cursor de clase inválido');
  for(const key of ['elapsedMs','phaseElapsedMs']){
    if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>24*3600*1000)
      throw Error('Duración de clase inválida');
  }
  if(value.deadlineUtc!==null){
    if(typeof value.deadlineUtc!=='string'
      ||!Number.isFinite(Date.parse(value.deadlineUtc))
      ||!/Z$/.test(value.deadlineUtc))throw Error('Fecha límite UTC inválida');
  }
  for(const key of ['runningSinceUtc']){
    if(value[key]!==undefined&&value[key]!==null &&
      (typeof value[key]!=='string'||!Number.isFinite(Date.parse(value[key]))||!/Z$/.test(value[key])))
      throw Error('Reloj UTC del entrenamiento inválido');
  }
  if(value.remainingMs!==undefined && value.remainingMs!==null &&
    (!Number.isSafeInteger(value.remainingMs)||value.remainingMs<0||value.remainingMs>86400000))
    throw Error('Tiempo restante inválido');
  // Allow-list: la pantalla nunca recibe correos, tokens, FC ni historial.
  return {
    mode:value.mode,phase:value.phase,step:value.step,turn:value.turn,
    paused:value.paused,deadlineUtc:value.deadlineUtc,
    runningSinceUtc:value.runningSinceUtc??null,
    remainingMs:value.remainingMs??null,
    elapsedMs:value.elapsedMs,phaseElapsedMs:value.phaseElapsedMs
  };
}

export function createHFLiveClient(config, {
  fetchImpl = (...args)=>fetch(...args),
  now = ()=>new Date()
}={}){
  const endpoint=new URL(config?.url||'');
  if(endpoint.protocol!=='https:'||endpoint.hostname!==HF_HOST||endpoint.pathname!=='/'
    ||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash){
    throw Error('El destino no es exclusivamente HF TRAINING. Operación detenida.');
  }
  if(typeof config.publishableKey!=='string'||!config.publishableKey.startsWith('sb_publishable_')){
    throw Error('Falta la clave pública de HF. Nunca uses claves secretas en el navegador.');
  }
  const table=endpoint.origin+'/rest/v1/hf_class_live_sessions';
  async function request(session,method,url,body){
    assertAuth(session);
    let response;
    try{
      response=await fetchImpl(url,{
        method,redirect:'error',credentials:'omit',cache:'no-store',
        headers:{
          apikey:config.publishableKey,
          Authorization:'Bearer '+session.access_token,
          'Content-Type':'application/json',
          ...(['PATCH','POST'].includes(method)?{Prefer:'return=representation'}:{})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(12000)
      });
    }catch(error){
      // A failed/aborted request might have committed on the server.
      const uncertain=new Error('No se pudo confirmar la orden. Consulta el estado de HF antes de continuar; NO la reenvíes a ciegas.');
      uncertain.code='HF_UNCERTAIN_REQUEST';
      uncertain.cause=error;
      throw uncertain;
    }
    let raw;
    try{raw=await response.text();}
    catch(error){
      const uncertain=new Error('Respuesta incompleta. Consulta el estado de HF antes de continuar; NO reenvíes la orden.');
      uncertain.code='HF_UNCERTAIN_REQUEST';
      uncertain.cause=error;
      throw uncertain;
    }
    let data;
    try{data=raw?JSON.parse(raw):null;}catch{data=null;}
    if(!response.ok){
      const msg=typeof data?.message==='string'?data.message:'Error de comunicación con HF TRAINING';
      const error=new Error(msg);
      error.code=data?.code||'HF_HTTP_ERROR';
      error.status=response.status;
      throw error;
    }
    if(!Array.isArray(data))throw Error('Respuesta inesperada del servidor HF');
    return data;
  }
  const params = filter => table+'?select='+encodeURIComponent(FIELDS)+(filter||'');
  async function getSession(session,id){
    assertUUID(id,'Sesión de HF');
    const rows=await request(session,'GET',params('&id=eq.'+encodeURIComponent(id)+'&limit=1'));
    return rows[0]??null; // RLS: no distinction between nonexistent and not authorized
  }
  async function listMyScreenSessions(session){
    assertAuth(session);
    const utc=now().toISOString();
    const filter='&screen_user_id=eq.'+encodeURIComponent(session.user.id)
      +'&expires_at=gt.'+encodeURIComponent(utc)+'&order=created_at.desc&limit=10';
    return request(session,'GET',params(filter));
  }
  async function createSession(session,{pairing,title,mode,publicPlan,expiresAt}){
    assertAuth(session);
    if(!pairing || typeof pairing!=='object')throw Error('Enlace de pantalla necesario');
    assertUUID(pairing.id,'Enlace');
    assertUUID(pairing.screen_user_id,'Pantalla');
    if(pairing.trainer_id!==session.user.id || pairing.screen_user_id===session.user.id)
      throw Error('El enlace no pertenece al entrenador y pantalla de HF');
    const current=now().getTime();
    const pairLimit=Date.parse(pairing.expires_at);
    const accepted=Date.parse(pairing.accepted_at);
    if(!Number.isFinite(accepted)||accepted>current||!Number.isFinite(pairLimit)||pairLimit<=current)
      throw Error('El vínculo no está aceptado o está caducado');
    if(typeof title!=='string'||!title.trim()||title.length>120)throw Error('Título de clase inválido');
    validateHFClassPlan(mode,publicPlan);
    const expiry=Date.parse(expiresAt);
    if(typeof expiresAt!=='string'||!Number.isFinite(expiry)||!expiresAt.endsWith('Z')||
      expiry<=current||expiry>current+12*3600000||expiry>pairLimit)
      throw Error('La caducidad de la clase no está permitida');
    const rows=await request(session,'POST',params(''),{
      pair_id:pairing.id,
      trainer_id:session.user.id,
      screen_user_id:pairing.screen_user_id,
      title:title.trim(),mode,
      public_plan:publicPlan,
      runtime:createHFRuntime(mode,publicPlan),
      expires_at:expiresAt
    });
    if(rows.length!==1)throw Error('No se confirmó la creación de la clase en HF');
    return rows[0];
  }
  async function updateRuntime(session,{id,expectedRevision,commandId,runtime}){
    assertUUID(id,'Sesión de HF');
    assertUUID(commandId,'Orden');
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Revisión previa inválida');
    const publicRuntime=cleanRuntime(runtime);
    const filter='&id=eq.'+encodeURIComponent(id)+'&revision=eq.'+expectedRevision;
    const rows=await request(session,'PATCH',params(filter),{
      runtime:publicRuntime,revision:expectedRevision+1,last_command_id:commandId
    });
    if(rows.length!==1)throw new HFRevisionConflict();
    return rows[0];
  }
  async function inspectUncertainCommand(session,id,commandId){
    assertUUID(commandId,'Orden');
    const row=await getSession(session,id);
    return {row,committed:row?.last_command_id===commandId};
  }
  return Object.freeze({createSession,getSession,listMyScreenSessions,updateRuntime,inspectUncertainCommand});
}
