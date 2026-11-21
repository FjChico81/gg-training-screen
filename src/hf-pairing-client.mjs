/**
 * HF · Enlace de entrenador y pantalla mediante aceptación explícita.
 * PREPARADO / NO ACTIVADO. Compatible con la propuesta v2 (SQL NO EJECUTADO).
 * Las comprobaciones locales nunca sustituyen la autorización RLS del servidor.
 */
const HF_ORIGIN = 'https://ydaqsmrfuwhqwqojrxyr.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAIR_FIELDS = 'id,trainer_id,screen_user_id,accepted_at,created_at,request_expires_at,expires_at';
const REVOCATION_FIELDS = 'pair_id,revoked_by,revoked_at';

function assertUuid(id, name) {
  if(typeof id !== 'string' || !UUID.test(id)) throw Error(name+' no válido');
}
function assertSession(session) {
  if(!session || typeof session.access_token !== 'string' || !session.access_token) {
    throw Error('Es necesario iniciar sesión con una cuenta de HF');
  }
  assertUuid(session.user?.id, 'Usuario HF');
}
function assertConfig(config) {
  if(!config || config.url !== HF_ORIGIN ||
    typeof config.publishableKey !== 'string' ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) {
    throw Error('Destino o clave de HF TRAINING no autorizados. Conexión detenida');
  }
}
function assertRows(rows) {
  if(!Array.isArray(rows)) throw Error('Respuesta inesperada de HF TRAINING');
  return rows;
}

export function createHFPairingClient(config, {
  fetchImpl = (...args) => fetch(...args),
  now = () => new Date()
} = {}) {
  assertConfig(config);
  const base = HF_ORIGIN+'/rest/v1/';
  async function request(session, table, method, query='', payload) {
    assertSession(session);
    if(table !== 'hf_class_pairings' && table !== 'hf_class_pair_revocations') {
      throw Error('Tabla fuera del módulo de vinculación HF');
    }
    const url = base+table+'?'+query;
    let response;
    try {
      response = await fetchImpl(url,{
        method, redirect:'error', credentials:'omit', cache:'no-store',
        headers:{
          apikey:config.publishableKey,
          Authorization:'Bearer '+session.access_token,
          'Content-Type':'application/json',
          ...(method==='GET'?{}:{Prefer:'return=representation'})
        },
        ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
        signal:AbortSignal.timeout(12000)
      });
    } catch(error) {
      const uncertain = new Error('Sin confirmación del servidor HF. Consulta el estado antes de repetir.');
      uncertain.code='HF_PAIRING_UNCERTAIN';
      uncertain.cause=error;
      throw uncertain;
    }
    let raw;
    try { raw=await response.text(); }
    catch(error) {
      const uncertain=new Error('La respuesta se cortó. Consulta el emparejamiento antes de reintentar.');
      uncertain.code='HF_PAIRING_UNCERTAIN';
      uncertain.cause=error;
      throw uncertain;
    }
    let rows;
    try {rows=raw?JSON.parse(raw):[];} catch {rows=[];}
    if(!response.ok){
      const failure=new Error(typeof rows?.message==='string'?rows.message:'Error de permisos o conexión HF');
      failure.code=rows?.code||'HF_PAIRING_HTTP_ERROR';
      failure.status=response.status;
      throw failure;
    }
    return assertRows(rows);
  }
  function date(){
    const instant=now();
    if(!(instant instanceof Date)||!Number.isFinite(instant.getTime())) throw Error('Reloj no válido');
    return instant;
  }
  async function requestPairing(trainerSession, screenUserId) {
    assertSession(trainerSession);
    assertUuid(screenUserId,'Pantalla');
    if(screenUserId===trainerSession.user.id) throw Error('La pantalla necesita una cuenta HF distinta');
    const instant=date().getTime();
    const rows=await request(trainerSession,'hf_class_pairings','POST',
      'select='+encodeURIComponent(PAIR_FIELDS),
      {
        trainer_id:trainerSession.user.id,
        screen_user_id:screenUserId,
        request_expires_at:new Date(instant+10*60*1000).toISOString(),
        expires_at:new Date(instant+48*3600*1000).toISOString()
      });
    if(rows.length!==1)throw Error('No se confirmó la solicitud de enlace');
    return rows[0]; // Solo una pantalla autorizada podrá aceptarla por RLS
  }
  async function listPendingForScreen(screenSession) {
    assertSession(screenSession);
    const filter='select='+encodeURIComponent(PAIR_FIELDS)+
      '&screen_user_id=eq.'+encodeURIComponent(screenSession.user.id)+
      '&accepted_at=is.null&request_expires_at=gt.'+
      encodeURIComponent(date().toISOString())+
      '&order=created_at.desc&limit=15';
    return request(screenSession,'hf_class_pairings','GET',filter);
  }
  async function getPairing(session,id){
    assertUuid(id,'Enlace');
    const query='select='+encodeURIComponent(PAIR_FIELDS)+'&id=eq.'+encodeURIComponent(id)+'&limit=1';
    const rows=await request(session,'hf_class_pairings','GET',query);
    return rows[0]??null;
  }
  async function accept(screenSession,id){
    assertUuid(id,'Enlace');
    const query='select='+encodeURIComponent(PAIR_FIELDS)+
      '&id=eq.'+encodeURIComponent(id)+'&accepted_at=is.null&request_expires_at=gt.'+
      encodeURIComponent(date().toISOString());
    // Servidor y trigger RLS verifican que solo la CUENTA DE PANTALLA acepta,
    // sin revelar al navegador ninguna clave privada de entrenador.
    const rows=await request(screenSession,'hf_class_pairings','PATCH',query,{
      accepted_at:date().toISOString()
    });
    if(rows.length!==1)throw Error('No se aceptó el enlace. Puede estar vencido o revocado.');
    return rows[0];
  }
  async function revoke(session,id){
    assertUuid(id,'Enlace');
    assertSession(session);
    const query='select='+encodeURIComponent(REVOCATION_FIELDS);
    const rows=await request(session,'hf_class_pair_revocations','POST',query,{
      pair_id:id,revoked_by:session.user.id
    });
    if(rows.length!==1)throw Error('No se confirmó la revocación. Consulta el estado.');
    return rows[0];
  }
  async function getRevocation(session,id){
    assertUuid(id,'Enlace');
    const query='select='+encodeURIComponent(REVOCATION_FIELDS)+
      '&pair_id=eq.'+encodeURIComponent(id)+'&limit=1';
    const rows=await request(session,'hf_class_pair_revocations','GET',query);
    return rows[0]??null;
  }
  async function inspectUncertain(session,id) {
    const [pairing,revocation]=await Promise.all([
      getPairing(session,id),getRevocation(session,id)
    ]);
    return {pairing,revocation,isActive:Boolean(pairing?.accepted_at&&!revocation&&Date.parse(pairing.expires_at)>date().getTime())};
  }
  return Object.freeze({
    requestPairing,listPendingForScreen,getPairing,accept,revoke,getRevocation,inspectUncertain
  });
}
