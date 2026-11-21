/* HF preview transport · local demonstration only.
 * BroadcastChannel works between tabs of the SAME origin and browser profile,
 * NOT between iPhone and Samsung. It is NOT authentication or authorization.
 * Never reuse this transport as a production remote-control channel.
 */
(function(root){
  'use strict';
  const VERSION=1;
  const PAIR=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ACTIONS=new Set(['start','pause','resume','next','reset']);
  const PHASES=new Set(['ready','work','change','finished']);
  const isValidPair=pair=>typeof pair==='string'&&PAIR.test(pair);
  const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  function safePlan(plan,mode){
    if(!plan||typeof plan!=='object'||Array.isArray(plan))return false;
    const list=mode==='guided'?plan.guided:plan.stations;
    if(!Array.isArray(list)||list.length<(mode==='guided'?1:2)||list.length>(mode==='guided'?24:8))return false;
    if(!list.every(item=>item&&typeof item.name==='string'&&item.name.length<=60
      &&typeof item.target==='string'&&item.target.length<=85))return false;
    return mode==='guided'?list.every(item=>Number.isInteger(item.seconds)&&item.seconds>=0&&item.seconds<=7200)
      :Number.isInteger(plan.rounds)&&plan.rounds>=1&&plan.rounds<=12
       &&Number.isInteger(plan.work)&&plan.work>=10&&plan.work<=1800
       &&Number.isInteger(plan.change)&&plan.change>=0&&plan.change<=300;
  }
  function safeSnapshot(snapshot){
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return false;
    const s=snapshot.state;
    if(!s||!['guided','stations'].includes(s.mode)||!PHASES.has(s.phase))return false;
    if(!Number.isInteger(s.step)||s.step<0||s.step>24
      ||!Number.isInteger(s.turn)||s.turn<0||s.turn>100)return false;
    if(typeof s.paused!=='boolean')return false;
    for(const key of ['sessionElapsedMs','phaseElapsedMs','sessionAnchor','phaseAnchor']){
      if(!numeric(s[key]))return false;
    }
    for(const key of ['deadline','remainingMs']){
      if(s[key]!==null&&!numeric(s[key]))return false;
    }
    return safePlan(snapshot.config,s.mode);
  }
  function create({pair,role,onCommand=()=>false,onState=()=>{},onAck=()=>{},Channel=root.BroadcastChannel,uuid=()=>root.crypto.randomUUID()}){
    if(!isValidPair(pair))throw Error('Identificador de prueba inválido');
    if(!['coach','screen'].includes(role))throw Error('Rol de prueba inválido');
    if(typeof Channel!=='function')throw Error('Este navegador no admite BroadcastChannel');
    const channel=new Channel('hf-class-demo-v1:'+pair);
    const clientId=uuid();
    const seen=new Set();
    let revision=0,lastRevision=-1,closed=false;
    function post(kind,rest={}){
      if(closed)return false;
      channel.postMessage({version:VERSION,kind,pair,sender:clientId,...rest});
      return true;
    }
    function publish(snapshot){
      if(role!=='screen'||!safeSnapshot(snapshot))return false;
      revision++;
      return post('state',{revision,payload:snapshot});
    }
    function requestState(){return role==='coach'&&post('hello');}
    function send(action){
      if(role!=='coach'||!ACTIONS.has(action))return null;
      const commandId=uuid();
      post('command',{action,commandId});
      return commandId;
    }
    channel.onmessage=event=>{
      if(closed)return;
      const m=event.data;
      if(!m||m.version!==VERSION||m.pair!==pair||m.sender===clientId)return;
      if(role==='screen'){
        if(m.kind==='hello'){try{onCommand({action:'snapshot'})}catch(e){}return;}
        if(m.kind!=='command'||!ACTIONS.has(m.action)
          ||!isValidPair(m.commandId)||seen.has(m.commandId))return;
        seen.add(m.commandId);
        if(seen.size>256)seen.delete(seen.values().next().value);
        let accepted=false;
        try{accepted=onCommand({action:m.action,commandId:m.commandId})===true;}
        catch(e){accepted=false;}
        post('ack',{commandId:m.commandId,accepted});
      }else{
        if(m.kind==='state'&&Number.isInteger(m.revision)&&m.revision>lastRevision
          &&safeSnapshot(m.payload)){
          lastRevision=m.revision;
          onState(m.payload,m.revision);
        }
        if(m.kind==='ack'&&isValidPair(m.commandId)
          &&typeof m.accepted==='boolean'){
          onAck(m.commandId,m.accepted);
        }
      }
    };
    return Object.freeze({pair,role,send,requestState,publish,close(){
      if(closed)return;
      closed=true;
      channel.close();
    }});
  }
  root.HFPreviewLink=Object.freeze({create,isValidPair,safeSnapshot});
})(typeof window!=='undefined'?window:globalThis);
