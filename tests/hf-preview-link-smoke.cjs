// HF demo link tests. Run: node --test tests/hf-preview-link-smoke.cjs
// No Supabase, deployment, network or user data.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const src=readFileSync(resolve(__dirname,'../src/hf-preview-link.js'),'utf8');
const root={};
vm.runInNewContext(src,{window:root},{timeout:1000,filename:'hf-preview-link.js'});
const {create,isValidPair,safeSnapshot}=root.HFPreviewLink;

let seed=0;
const uuid=()=>('00000000-0000-4000-8000-'+(++seed).toString(16).padStart(12,'0'));
const pair='11111111-2222-4333-8444-555555555555';

class FakeChannel {
  static peers=new Map();
  static messages=[];
  constructor(name){
    this.name=name;this.onmessage=null;this.closed=false;
    if(!FakeChannel.peers.has(name))FakeChannel.peers.set(name,new Set());
    FakeChannel.peers.get(name).add(this);
  }
  postMessage(message){
    FakeChannel.messages.push(message);
    for(const peer of FakeChannel.peers.get(this.name)){
      if(peer!==this&&!peer.closed)peer.onmessage?.({data:message});
    }
  }
  close(){this.closed=true;FakeChannel.peers.get(this.name)?.delete(this);}
  static reset(){this.peers.clear();this.messages.length=0;}
}

function example(){
  return {
    state:{
      mode:'stations',phase:'work',step:0,turn:1,paused:false,
      deadline:1_060_000,remainingMs:60_000,phaseElapsedMs:0,
      phaseAnchor:1_000_000,sessionElapsedMs:0,sessionAnchor:1_000_000,
      userEmail:'private-should-not-pass'
    },
    config:{
      stations:[
        {name:'SkiErg',target:'250 m',privateNote:'not-published'},
        {name:'Carrera',target:'150 m'}
      ],
      rounds:2,work:60,change:20,privateNote:'not-published'
    },
    privateSession:'not-published'
  };
}
function link(role,options={}){return create({pair,role,Channel:FakeChannel,uuid,...options});}

test('requires a valid UUID pair',()=>{
  assert.equal(isValidPair(pair),true);
  assert.equal(isValidPair('public'),false);
  assert.throws(()=>create({pair:'1234',role:'coach',Channel:FakeChannel,uuid}));
});

test('screen sends only whitelisted public plan fields',()=>{
  FakeChannel.reset();
  let snapshot=null;
  const coach=link('coach',{onState:state=>{snapshot=state;}});
  const screen=link('screen',{onCommand:({action})=>{
    if(action==='snapshot'){screen.publish(example());return true;}
    return false;
  }});
  coach.requestState();
  assert.ok(snapshot,'coach must receive an authenticated-by-pair DEMO snapshot');
  assert.equal(snapshot.config.stations.length,2);
  assert.equal(snapshot.state.turn,1);
  assert.equal(JSON.stringify(snapshot).includes('private'),false);
  coach.close();screen.close();
});

test('coach command applies exactly once even if a message is duplicated',()=>{
  FakeChannel.reset();
  let moves=0,acks=[];
  const screen=link('screen',{onCommand:({action})=>{
    if(action==='next'){moves++;return true;}
    return false;
  }});
  const coach=link('coach',{onAck:(id,accepted)=>acks.push([id,accepted])});
  const id=coach.send('next');
  assert.equal(moves,1);assert.deepEqual(acks,[[id,true]]);
  const message=FakeChannel.messages.find(m=>m.kind==='command'&&m.commandId===id);
  const screenChannel=[...FakeChannel.peers.values()].flatMap(set=>[...set]).find(x=>x.onmessage&&x.name==='hf-class-demo-v1:'+pair&&x!==null);
  // Deliver duplicate to both peers: only screen must process commands.
  for(const peer of FakeChannel.peers.get('hf-class-demo-v1:'+pair))peer.onmessage?.({data:message});
  assert.equal(moves,1);assert.equal(acks.length,1);
  assert.equal(screen.send('next'),null);
  assert.equal(coach.publish(example()),false);
  screen.close();coach.close();
});

test('invalid actions, mismatched pair, and non-UUID command ids are ignored',()=>{
  FakeChannel.reset();
  let accepted=0;
  const screen=link('screen',{onCommand:()=>{accepted++;return true;}});
  const rogue=new FakeChannel('hf-class-demo-v1:'+pair);
  for(const msg of [
    {version:1,kind:'command',pair:'WRONG',sender:'rogue',action:'next',commandId:uuid()},
    {version:1,kind:'command',pair,sender:'rogue',action:'delete',commandId:uuid()},
    {version:1,kind:'command',pair,sender:'rogue',action:'next',commandId:'invalid'},
    {version:2,kind:'command',pair,sender:'rogue',action:'next',commandId:uuid()}
  ])rogue.postMessage(msg);
  assert.equal(accepted,0);
  rogue.close();screen.close();
});

test('coach accepts a new screen instance after restart even if revision starts at 1',()=>{
  FakeChannel.reset();
  let seen=0;
  const coach=link('coach',{onState:()=>{seen++;}});
  let first;
  first=link('screen',{onCommand:({action})=>{
    if(action==='snapshot'){first.publish(example());return true;}
    return false;
  }});
  coach.requestState();
  first.publish(example());
  first.publish(example());
  assert.equal(seen,3);
  first.close();
  let second;
  second=link('screen',{onCommand:({action})=>{
    if(action==='snapshot'){second.publish(example());return true;}
    return false;
  }});
  coach.requestState();
  assert.equal(seen,4);
  coach.close();second.close();
});

test('rejects out-of-bounds plan and timers',()=>{
  const s=example();
  assert.equal(safeSnapshot(s),true);
  s.state.step=-1;assert.equal(safeSnapshot(s),false);s.state.step=0;
  s.config.work=1;assert.equal(safeSnapshot(s),false);
});
