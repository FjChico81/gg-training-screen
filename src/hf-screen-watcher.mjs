/**
 * HF TRAINING — read-only screen watcher (PREPARED, NOT CONNECTED).
 *
 * Polling is a deliberately simple first transport for separate devices.
 * The screen can NEVER write, create, resume or advance a session.
 * Authenticated REST + server RLS remain mandatory.
 * Realtime can later trigger an immediate refresh; snapshots remain source of truth.
 */
import {materializeHFRuntime,validateHFRuntime} from './hf-class-runtime.mjs';

export function createHFScreenWatcher({
  client, session, id,
  onSnapshot, onDisconnected, onStale=()=>{}, onRecovered=()=>{},
  onError=()=>{},
  periodMs=1500, staleAfter=3,
  schedule=(fn,ms)=>setTimeout(fn,ms),
  cancel=handle=>clearTimeout(handle),
  clock=()=>new Date()
}) {
  if(!client || typeof client.getSession!=='function')throw Error('Cliente HF necesario');
  if(!session?.access_token||!session?.user?.id)throw Error('La pantalla requiere una cuenta HF autenticada');
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('Sesión de HF inválida');
  if(typeof onSnapshot!=='function'||typeof onDisconnected!=='function')throw Error('Callbacks obligatorios');
  if(!Number.isInteger(periodMs)||periodMs<500||periodMs>30000)throw Error('Intervalo inválido');
  if(!Number.isInteger(staleAfter)||staleAfter<1||staleAfter>10)throw Error('Umbral de desconexión inválido');
  let running=false, busy=false, task=null,revision=-1,failures=0,stale=false,latest=null;
  function next(){
    if(!running||busy||task!==null)return;
    task=schedule(()=>{task=null;void poll();},periodMs);
  }
  function disconnect(reason){
    running=false;
    if(task!==null){cancel(task);task=null;}
    latest=null;
    onDisconnected(reason);
  }
  async function poll(){
    if(!running||busy)return;
    busy=true;
    try{
      const row=await client.getSession(session,id);
      if(!running)return;
      if(!row){
        disconnect('revoked_expired_or_unavailable');
        return;
      }
      const number=row.revision;
      if(!Number.isSafeInteger(number)||number<0)throw Error('Revisión no válida');
      if(number<revision)throw Error('Estado anterior al último recibido');
      validateHFRuntime(row.runtime,row.public_plan);
      // Materialize for presentation only: no UPDATE, no remote command.
      const presentation=materializeHFRuntime(row.runtime,row.public_plan,clock().toISOString());
      const wasStale=stale;
      stale=false;failures=0;latest={row,presentation};
      if(wasStale)onRecovered();
      if(number>revision){
        revision=number;
        onSnapshot({row,presentation,revision:number});
      }
    }catch(error){
      if(!running)return;
      failures++;
      onError(error);
      if(failures>=staleAfter&&!stale){
        stale=true;
        onStale(); // UI must not claim live synchronization when stale.
      }
    }finally{
      busy=false;next();
    }
  }
  function start(){
    if(running)return false;
    running=true;
    void poll();
    return true;
  }
  function refresh(){if(!running||busy)return false;void poll();return true;}
  function stop(){
    running=false;
    if(task!==null){cancel(task);task=null;}
    latest=null;
  }
  return Object.freeze({
    start,refresh,stop,
    get status(){return {running,busy,stale,revision,failures};},
    get latest(){return latest;}
  });
}
