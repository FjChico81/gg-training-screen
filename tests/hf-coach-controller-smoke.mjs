import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFCoachController} from '../src/hf-coach-controller.mjs';
import {createHFRuntime} from '../src/hf-class-runtime.mjs';
import {HFRevisionConflict} from '../src/hf-live-client.mjs';

const trainer='11111111-2222-4333-8444-555555555555';
const screen='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const pair='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const cmd='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const session={user:{id:trainer},access_token:'FAKE_COACH_TOKEN'};
const now=()=>new Date('2026-11-21T15:00:00.000Z');
const plan={guided:[{name:'Burpees',target:'12 rep',seconds:0}]};
const pairing={id:pair,trainer_id:trainer,screen_user_id:screen,
  accepted_at:'2026-11-21T14:00:00.000Z',
  expires_at:'2026-11-22T14:00:00.000Z'};
const initial={id,pair_id:pair,revision:0,mode:'guided',public_plan:plan,
  runtime:createHFRuntime('guided',plan)};

function fixture({
  active=true,revoked=false,onUpdate,onInspect,onGet,onCreate
}={}){
  const calls=[];
  const pairClient={
    async getPairing(_session,ident){calls.push('getPair');assert.equal(ident,pair);return active?pairing:null;},
    async getRevocation(_session,ident){calls.push('getRevocation');assert.equal(ident,pair);return revoked?{pair_id:pair}:null;}
  };
  const client={
    async getSession(){calls.push('getSession');return onGet?onGet():initial;},
    async createSession(_session,data){calls.push('createSession');return onCreate?onCreate(data):{id,revision:0,...data};},
    async updateRuntime(_session,data){calls.push('updateRuntime');return onUpdate?onUpdate(data):{...initial,revision:1,runtime:data.runtime,last_command_id:data.commandId};},
    async inspectUncertainCommand(_session,_id,commandId){calls.push('inspectUncertainCommand');return onInspect?onInspect(commandId):{committed:false,row:initial};}
  };
  return {calls,controller:createHFCoachController({client,pairingClient:pairClient,session,now,uuid:()=>cmd})};
}

test('creates HF class only for explicitly accepted, unrevoked pair',async()=>{
  const f=fixture();
  const row=await f.controller.create({
    pairId:pair,title:'Clase HIIT',mode:'guided',publicPlan:plan,durationMinutes:60
  });
  assert.equal(row.pairing.id,pair);
  assert.equal(row.title,'Clase HIIT');
  assert.equal(row.expiresAt,'2026-11-21T16:00:00.000Z');
  assert.deepEqual(f.calls,['getPair','getRevocation','createSession']);
});

test('revoked and unapproved pair cannot create session',async()=>{
  for(const settings of [{active:false},{revoked:true}]){
    const f=fixture(settings);
    await assert.rejects(f.controller.create({
      pairId:pair,title:'Clase',mode:'guided',publicPlan:plan
    }),/no está aprobado/);
    assert.equal(f.calls.includes('createSession'),false);
  }
});

test('trainer command reads latest revision and issues exactly one write',async()=>{
  const f=fixture();
  const row=await f.controller.command(id,'start');
  assert.equal(row.revision,1);
  assert.equal(row.runtime.phase,'work');
  assert.equal(f.calls.filter(x=>x==='getSession').length,1);
  assert.equal(f.calls.filter(x=>x==='updateRuntime').length,1);
});

test('optimistic conflict is returned to user, never retried',async()=>{
  const f=fixture({onUpdate:()=>{throw new HFRevisionConflict();}});
  await assert.rejects(f.controller.command(id,'start'),HFRevisionConflict);
  assert.equal(f.calls.filter(x=>x==='updateRuntime').length,1);
  assert.equal(f.calls.includes('inspectUncertainCommand'),false);
});

test('uncertain success is confirmed by original UUID, without second write',async()=>{
  const f=fixture({
    onUpdate:()=>{const e=Error('timeout');e.code='HF_UNCERTAIN_REQUEST';throw e;},
    onInspect:(commandId)=>({committed:commandId===cmd,row:{id,revision:1,last_command_id:cmd}})
  });
  const row=await f.controller.command(id,'start');
  assert.equal(row.last_command_id,cmd);
  assert.equal(f.calls.filter(x=>x==='updateRuntime').length,1);
  assert.equal(f.calls.filter(x=>x==='inspectUncertainCommand').length,1);
});

test('uncertain non-committed response blocks rather than auto-replaying',async()=>{
  const f=fixture({
    onUpdate:()=>{const e=Error('timeout');e.code='HF_UNCERTAIN_REQUEST';throw e;},
    onInspect:()=>({committed:false,row:initial})
  });
  await assert.rejects(f.controller.command(id,'start'),e=>e.code==='HF_OUTCOME_UNKNOWN');
  assert.equal(f.calls.filter(x=>x==='updateRuntime').length,1);
});

test('invalid actions and out-of-range session durations are rejected before write',async()=>{
  const f=fixture();
  await assert.rejects(f.controller.command(id,'finish'));
  await assert.rejects(f.controller.create({
    pairId:pair,title:'Clase',mode:'guided',publicPlan:plan,durationMinutes:10000
  }));
  assert.equal(f.calls.includes('updateRuntime'),false);
  assert.equal(f.calls.includes('createSession'),false);
});
