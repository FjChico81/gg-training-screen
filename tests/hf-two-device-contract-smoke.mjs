import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFLiveClient,HFRevisionConflict} from '../src/hf-live-client.mjs';
import {createHFScreenWatcher} from '../src/hf-screen-watcher.mjs';
import {commandHFRuntime} from '../src/hf-class-runtime.mjs';

// In-memory fake REST server: strictly NOT a PostgreSQL/RLS security test.
const config={url:'https://ydaqsmrfuwhqwqojrxyr.supabase.co',
  publishableKey:'sb_publishable_FAKE_FOR_TESTS'};
const trainerId='11111111-2222-4333-8444-555555555555';
const screenId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsiderId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const pairId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const liveId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const commandId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const credentials=[
  [trainerId,'token-trainer'],[screenId,'token-screen'],[outsiderId,'token-outsider']
].map(([id,access_token])=>({access_token,user:{id}}));
const [trainer,screen,outsider]=credentials;
const plan={guided:[
  {name:'Burpees',target:'20 segundos',seconds:20},
  {name:'Carrera',target:'400 m',seconds:0}
]};
const reference=Date.parse('2026-11-21T14:45:00.000Z');
const pairing={id:pairId,trainer_id:trainerId,screen_user_id:screenId,
  accepted_at:'2026-11-21T14:40:00.000Z',expires_at:'2026-11-22T14:40:00.000Z'};
const result=(status,rows)=>({
  ok:status>=200&&status<300,status,
  text:async()=>JSON.stringify(rows)
});
const elapsed=ms=>new Date(reference+ms).toISOString();
function makeServer(){
  const db={live:null,revoked:false,writes:0};
  const calls=[];
  async function fetcher(address,init){
    calls.push({address,init});
    const url=new URL(address),method=init.method;
    assert.equal(url.hostname,'ydaqsmrfuwhqwqojrxyr.supabase.co');
    assert.equal(url.pathname,'/rest/v1/hf_class_live_sessions');
    const id=credentials.find(x=>init.headers.Authorization==='Bearer '+x.access_token)?.user.id;
    if(!id)return result(401,{message:'unauthorized'});
    if(method==='POST'){
      if(id!==trainerId||db.revoked)return result(403,{message:'not allowed'});
      const body=JSON.parse(init.body);
      if(body.pair_id!==pairId||body.trainer_id!==trainerId||body.screen_user_id!==screenId)
        return result(403,{message:'wrong identities'});
      db.live={...body,id:liveId,revision:0,last_command_id:null,updated_at:elapsed(0)};
      db.writes++;return result(201,[db.live]);
    }
    if(method==='GET'){
      if(!db.live||db.revoked||!(id===trainerId||id===screenId))return result(200,[]);
      return result(200,[db.live]);
    }
    if(method==='PATCH'){
      if(!db.live||db.revoked||id!==trainerId)return result(403,{message:'not a trainer'});
      const rev=Number(url.searchParams.get('revision')?.replace('eq.',''));
      if(rev!==db.live.revision||url.searchParams.get('id')!=='eq.'+liveId)return result(200,[]);
      const body=JSON.parse(init.body);
      db.live={...db.live,...body,updated_at:elapsed(0)};
      db.writes++;return result(200,[db.live]);
    }
    throw Error('Unexpected method '+method);
  }
  return {db,calls,fetcher};
}
const noWait=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

test('two different authenticated clients share one session via HF REST contract',async()=>{
  const server=makeServer();
  let time=reference;
  const trainerClient=createHFLiveClient(config,{fetchImpl:server.fetcher,now:()=>new Date(time)});
  const screenClient=createHFLiveClient(config,{fetchImpl:server.fetcher,now:()=>new Date(time)});
  const created=await trainerClient.createSession(trainer,{
    pairing,title:'Clase de prueba',mode:'guided',publicPlan:plan,expiresAt:elapsed(2*3600000)
  });
  assert.equal(created.id,liveId);
  assert.equal(server.db.writes,1);

  const original=await screenClient.getSession(screen,liveId);
  assert.equal(original.revision,0);
  assert.equal(original.runtime.phase,'ready');
  const anonymous=await screenClient.getSession(outsider,liveId);
  assert.equal(anonymous,null);

  const states=[],lost=[];
  const watcher=createHFScreenWatcher({
    client:screenClient,session:screen,id:liveId,
    clock:()=>new Date(time),
    schedule:()=>123, cancel:()=>{},
    onSnapshot:s=>states.push(s),onDisconnected:s=>lost.push(s)
  });
  watcher.start();await noWait();
  assert.equal(states.length,1);
  assert.equal(states.at(-1).presentation.phase,'ready');

  const updated=commandHFRuntime(created.runtime,plan,'start',elapsed(0));
  const patch=await trainerClient.updateRuntime(trainer,{
    id:liveId,expectedRevision:0,commandId,runtime:updated
  });
  assert.equal(patch.revision,1);
  assert.equal(server.db.writes,2);
  watcher.refresh();await noWait();
  assert.equal(states.length,2);
  assert.equal(states.at(-1).presentation.phase,'work');

  await assert.rejects(trainerClient.updateRuntime(trainer,{
    id:liveId,expectedRevision:0,commandId,runtime:updated
  }),HFRevisionConflict);
  assert.equal(server.db.writes,2,'stale double-click never commits again');

  time+=25000;watcher.refresh();await noWait();
  assert.equal(watcher.latest.presentation.step,1,'screen derives the next step by UTC after network gap');
  assert.equal(server.db.live.revision,1,'read-only screen never writes automatic transitions');

  await assert.rejects(screenClient.updateRuntime(screen,{
    id:liveId,expectedRevision:1,commandId,runtime:updated
  }));
  assert.equal(server.db.writes,2,'screen cannot write through fake RLS');

  server.db.revoked=true;
  watcher.refresh();await noWait();
  assert.equal(watcher.status.running,false);
  assert.deepEqual(lost,['revoked_expired_or_unavailable']);
  assert.equal(await screenClient.getSession(screen,liveId),null);
  assert.equal(server.db.writes,2);
  watcher.stop();
});

test('unaccepted or mismatched pairing cannot create a class through the trainer client',async()=>{
  const server=makeServer();
  const client=createHFLiveClient(config,{fetchImpl:server.fetcher,
    now:()=>new Date(reference)});
  const payload={pairing,title:'Clase',mode:'guided',publicPlan:plan,
    expiresAt:elapsed(3600000)};
  await assert.rejects(client.createSession(trainer,{
    ...payload,pairing:{...pairing,accepted_at:null}
  }));
  await assert.rejects(client.createSession(trainer,{
    ...payload,pairing:{...pairing,trainer_id:outsiderId}
  }));
  await assert.rejects(client.createSession(trainer,{
    ...payload,pairing:{...pairing,screen_user_id:trainerId}
  }));
  await assert.rejects(client.createSession(trainer,{
    ...payload,publicPlan:{...plan,secret:'sensitive'}
  }));
  await assert.rejects(client.createSession(trainer,{
    ...payload,expiresAt:elapsed(13*3600000)
  }));
  assert.equal(server.calls.length,0,'local checks reject before any network call');
});
