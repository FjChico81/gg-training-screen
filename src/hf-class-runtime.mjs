/**
 * HF class runtime v3 — pure, deterministic time-based state machine.
 * NO Supabase/database access. No side effects, network, timers, secrets, or writes.
 *
 * All wall-clock times are ISO UTC. The read-only screen may derive presentation
 * from an authenticated snapshot, but never commits advances to the server.
 * A later transactional server command must revalidate the revision and action.
 */
const ACTIONS = new Set(['start','pause','resume','next','reset']);
const PHASES = new Set(['ready','work','change','finished']);
const MAX_CATCHUP = 256;
const MAX_MS = 24 * 60 * 60 * 1000;

function fail(msg) { throw Error('HF_RUNTIME: '+msg); }
function utcMs(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('UTC inválido');
  const ms=Date.parse(value);
  if(!Number.isFinite(ms) || new Date(ms).toISOString()!==value) fail('Fecha UTC inválida');
  return ms;
}
const utc = ms => new Date(ms).toISOString();
const nonNeg = (n,max=MAX_MS) => Number.isSafeInteger(n)&&n>=0&&n<=max;
export function validateHFClassPlan(mode, plan) {
  if(!plan || typeof plan!=='object'||Array.isArray(plan))fail('Plan inválido');
  if(mode==='guided') {
    if(Object.keys(plan).some(k=>k!=='guided')||!Array.isArray(plan.guided)
      ||plan.guided.length<1||plan.guided.length>24)fail('Pasos guiados inválidos');
    for(const e of plan.guided) {
      if(!e || typeof e.name!=='string'||!e.name.trim()||e.name.length>60
        ||typeof e.target!=='string'||!e.target.trim()||e.target.length>85
        ||!nonNeg(e.seconds,7200))fail('Ejercicio guiado inválido');
      if(/^descanso$/i.test(e.name.trim())&&e.seconds===0)fail('Descanso sin tiempo programado');
      if(Object.keys(e).some(k=>!['name','target','seconds'].includes(k)))fail('Plan con campos privados');
    }
    return true;
  }
  if(mode==='stations') {
    if(Object.keys(plan).some(k=>!['stations','rounds','work','change'].includes(k))
      ||!Array.isArray(plan.stations)||plan.stations.length<2||plan.stations.length>8
      ||!nonNeg(plan.rounds,12)||plan.rounds<1
      ||!nonNeg(plan.work,1800)||plan.work<10||!nonNeg(plan.change,300))fail('Circuito inválido');
    for(const e of plan.stations) {
      if(!e || typeof e.name!=='string'||!e.name.trim()||e.name.length>60
        ||typeof e.target!=='string'||!e.target.trim()||e.target.length>85
        ||Object.keys(e).some(k=>!['name','target'].includes(k)))fail('Estación inválida');
    }
    return true;
  }
  fail('Formato de clase no permitido');
}
export function createHFRuntime(mode, plan) {
  validateHFClassPlan(mode,plan);
  return {
    mode,phase:'ready',step:0,turn:0,paused:false,
    deadlineUtc:null,runningSinceUtc:null,remainingMs:null,
    elapsedMs:0,phaseElapsedMs:0
  };
}
export function validateHFRuntime(state,plan) {
  if(!state||typeof state!=='object'||Array.isArray(state)
    ||!['guided','stations'].includes(state.mode)||!PHASES.has(state.phase)
    ||typeof state.paused!=='boolean'
    ||!nonNeg(state.step,24)||!nonNeg(state.turn,96)
    ||!nonNeg(state.elapsedMs)||!nonNeg(state.phaseElapsedMs))fail('Estado no válido');
  validateHFClassPlan(state.mode,plan);
  if(state.deadlineUtc!==null)utcMs(state.deadlineUtc);
  if(state.runningSinceUtc!==null)utcMs(state.runningSinceUtc);
  if(state.remainingMs!==null && !nonNeg(state.remainingMs))fail('Resto de tiempo inválido');
  if((state.phase==='ready'||state.phase==='finished') &&
    (state.paused||state.deadlineUtc!==null||state.runningSinceUtc!==null||state.remainingMs!==null))fail('Estado no activo corrupto');
  if((state.phase==='work'||state.phase==='change') && !state.paused && state.runningSinceUtc===null)fail('Falta reloj activo');
  if(state.paused && (state.runningSinceUtc!==null||state.deadlineUtc!==null))fail('Reloj en pausa inconsistente');
  if(state.phase==='change' && state.mode!=='stations')fail('Cambio solo en estaciones');
  if(state.mode==='guided' && state.step >= plan.guided.length && state.phase!=='finished')fail('Cursor fuera de la clase');
  if(state.mode==='stations' && state.turn>=plan.stations.length*plan.rounds && state.phase!=='finished')fail('Rotación fuera del circuito');
  if(Object.keys(state).some(k=>!['mode','phase','step','turn','paused','deadlineUtc','runningSinceUtc','remainingMs','elapsedMs','phaseElapsedMs'].includes(k)))fail('Campos privados en estado');
  return true;
}
const duration = (s,p) => s.mode==='guided' ? p.guided[s.step]?.seconds||0 : s.phase==='change'?p.change:p.work;
function acc(s,whenMs) {
  const anchor=s.runningSinceUtc===null?whenMs:utcMs(s.runningSinceUtc);
  const delta=Math.max(0,whenMs-anchor);
  return {
    ...s,
    elapsedMs:Math.min(MAX_MS,s.elapsedMs+delta),
    phaseElapsedMs:Math.min(MAX_MS,s.phaseElapsedMs+delta),
    runningSinceUtc:null
  };
}
function beginPhase(s,p,whenMs) {
  const seconds=duration(s,p);
  return {...s,
    paused:false,phaseElapsedMs:0,runningSinceUtc:utc(whenMs),
    deadlineUtc:seconds>0?utc(whenMs+seconds*1000):null,
    remainingMs:null
  };
}
function stepForward(s,p,atMs) {
  const current=acc(s,atMs);
  const next={...current,deadlineUtc:null,remainingMs:null,paused:false};
  if(current.mode==='guided') {
    next.step++;
    if(next.step>=p.guided.length) {
      return {...next,phase:'finished',runningSinceUtc:null};
    }
    return beginPhase(next,p,atMs);
  }
  if(current.phase==='work' && current.turn>=p.stations.length*p.rounds-1) {
    return {...next,phase:'finished',runningSinceUtc:null};
  }
  if(current.phase==='work' && p.change>0) {
    next.phase='change';
    return beginPhase(next,p,atMs);
  }
  next.phase='work';
  next.turn++;
  return beginPhase(next,p,atMs);
}
/**
 * Materializes timed transitions on a READ-ONLY COPY at the supplied UTC time.
 * The database is not updated; runtime can catch up when TV restarts.
 */
export function materializeHFRuntime(state,plan,atUtc) {
  validateHFRuntime(state,plan);
  const now=utcMs(atUtc);
  let s={...state},count=0;
  if(s.paused||s.phase==='ready'||s.phase==='finished')return s;
  const since=utcMs(s.runningSinceUtc);
  if(since>now)fail('El reloj de referencia está adelantado');
  while(s.deadlineUtc!==null && utcMs(s.deadlineUtc)<=now){
    if(++count>MAX_CATCHUP)fail('Demasiadas transiciones automáticas');
    const boundary=utcMs(s.deadlineUtc);
    s=stepForward(s,plan,boundary);
  }
  return s;
}
export function commandHFRuntime(state,plan,action,atUtc) {
  if(!ACTIONS.has(action))fail('Orden desconocida');
  const now=utcMs(atUtc);
  let s=materializeHFRuntime(state,plan,atUtc);
  if(action==='reset') return createHFRuntime(s.mode,plan);
  if(action==='start') {
    if(s.phase!=='ready')fail('La sesión ya empezó');
    return beginPhase({...s,phase:'work'},plan,now);
  }
  if(action==='resume') {
    if(!s.paused||!['work','change'].includes(s.phase))fail('No hay pausa que reanudar');
    return {...s,paused:false,runningSinceUtc:atUtc,
      deadlineUtc:s.remainingMs===null?null:utc(now+s.remainingMs),
      remainingMs:null};
  }
  if(action==='pause') {
    if(s.paused||!['work','change'].includes(s.phase))fail('Sesión no pausables');
    const remaining=s.deadlineUtc===null?null:Math.max(0,utcMs(s.deadlineUtc)-now);
    return {...acc(s,now),paused:true,deadlineUtc:null,remainingMs:remaining};
  }
  if(s.paused||!['work','change'].includes(s.phase))fail('No se puede avanzar');
  return stepForward(s,plan,now);
}
export function presentHFRuntime(state,plan,atUtc) {
  const s=materializeHFRuntime(state,plan,atUtc);
  const now=utcMs(atUtc);
  const running=!s.paused&&['work','change'].includes(s.phase);
  const delta=running?Math.max(0,now-utcMs(s.runningSinceUtc)):0;
  const elapsedMs=Math.min(MAX_MS,s.elapsedMs+delta);
  const phaseElapsedMs=Math.min(MAX_MS,s.phaseElapsedMs+delta);
  const remainingMs=s.paused?s.remainingMs:(s.deadlineUtc?Math.max(0,utcMs(s.deadlineUtc)-now):null);
  return {state:s,elapsedMs,phaseElapsedMs,remainingMs};
}
