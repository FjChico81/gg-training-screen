/**
 * HF TRAINING · Coach workflow controller, PREPARED / NOT ACTIVATED.
 * No network, Supabase, or storage side effects until a caller invokes a method.
 * Server RLS and an approved transactional command API are mandatory for release.
 */
import {commandHFRuntime, validateHFClassPlan} from './hf-class-runtime.mjs';
import {HFRevisionConflict} from './hf-live-client.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['start','pause','resume','next','reset']);
function validId(v){return typeof v==='string'&&UUID.test(v);}
function verifySession(session){
  if(!session?.access_token||!validId(session.user?.id))throw Error('La cuenta HF del entrenador no está autenticada');
}
function clockISO(now){
  const value=now();
  if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw Error('Reloj de la sesión inválido');
  return value.toISOString();
}

export function createHFCoachController({client,pairingClient,session,now=()=>new Date(),uuid=()=>crypto.randomUUID()}){
  if(!client||typeof client.getSession!=='function'||typeof client.updateRuntime!=='function'
    ||typeof client.createSession!=='function'||typeof client.inspectUncertainCommand!=='function')
    throw Error('Cliente de sesiones HF incompleto');
  if(!pairingClient||typeof pairingClient.getPairing!=='function'||typeof pairingClient.getRevocation!=='function')
    throw Error('Cliente de vinculación HF incompleto');
  verifySession(session);
  async function requireAccepted(pairId){
    if(!validId(pairId))throw Error('Enlace HF inválido');
    const [pair,revocation]=await Promise.all([
      pairingClient.getPairing(session,pairId),
      pairingClient.getRevocation(session,pairId)
    ]);
    const nowMs=Date.parse(clockISO(now));
    if(!pair||pair.trainer_id!==session.user.id||!validId(pair.screen_user_id)
      ||pair.screen_user_id===session.user.id||!pair.accepted_at||revocation
      ||!Number.isFinite(Date.parse(pair.accepted_at))
      ||Date.parse(pair.accepted_at)>nowMs
      ||!Number.isFinite(Date.parse(pair.expires_at))
      ||Date.parse(pair.expires_at)<=nowMs)
      throw Error('El enlace de pantalla no está aprobado, está caducado o ha sido revocado');
    return pair;
  }
  async function create({pairId,title,mode,publicPlan,durationMinutes=120}){
    const pairing=await requireAccepted(pairId);
    validateHFClassPlan(mode,publicPlan);
    if(!Number.isSafeInteger(durationMinutes)||durationMinutes<5||durationMinutes>720)
      throw Error('Duración de sesión fuera de límites');
    const end=new Date(Date.parse(clockISO(now))+durationMinutes*60000);
    const acceptedEnd=Date.parse(pairing.expires_at);
    if(end.getTime()>acceptedEnd)throw Error('La sesión no puede superar la caducidad del enlace');
    return client.createSession(session,{
      pairing,title,mode,publicPlan,expiresAt:end.toISOString()
    });
  }
  async function command(sessionId,action){
    if(!validId(sessionId))throw Error('Sesión HF inválida');
    if(!ACTIONS.has(action))throw Error('Orden no permitida');
    const row=await client.getSession(session,sessionId);
    if(!row)throw Error('Sesión inexistente, vencida o no autorizada');
    if(row.pair_id)await requireAccepted(row.pair_id);
    validateHFClassPlan(row.mode,row.public_plan);
    const next=commandHFRuntime(row.runtime,row.public_plan,action,clockISO(now));
    const id=uuid();
    if(!validId(id))throw Error('Identificador de orden no válido');
    try {
      return await client.updateRuntime(session,{
        id:sessionId,expectedRevision:row.revision,commandId:id,runtime:next
      });
    }catch(error){
      if(error instanceof HFRevisionConflict || error?.code==='HF_REVISION_CONFLICT'){
        // Never replay automatically after a concurrent update.
        throw error;
      }
      if(error?.code!=='HF_UNCERTAIN_REQUEST')throw error;
      let inspected;
      try{inspected=await client.inspectUncertainCommand(session,sessionId,id);}
      catch(inspectionError){
        const unknown=new Error('No se ha podido verificar la orden. Revisa el estado antes de actuar.');
        unknown.code='HF_OUTCOME_UNKNOWN';
        unknown.cause=inspectionError;
        throw unknown;
      }
      if(inspected?.committed&&inspected.row)return inspected.row;
      const unknown=new Error('La orden no está confirmada. No se repetirá automáticamente.');
      unknown.code='HF_OUTCOME_UNKNOWN';
      throw unknown;
    }
  }
  return Object.freeze({create,command,requireAccepted});
}
