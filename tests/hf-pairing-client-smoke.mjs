// HF-only pairing adapter tests. No real network, Supabase login or migrations.
// Run: node --test tests/hf-pairing-client-smoke.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFPairingClient} from '../src/hf-pairing-client.mjs';

const config={
  url:'https://ydaqsmrfuwhqwqojrxyr.supabase.co',
  publishableKey:'sb_publishable_TESTONLY'
};
const trainerId='11111111-2222-4333-8444-555555555555';
const screenId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const pairId='bbbbbbbb-aaaa-4bbb-8ccc-eeeeeeeeeeee';
const trainer={user:{id:trainerId},access_token:'TRAINER_TEST'};
const screen={user:{id:screenId},access_token:'SCREEN_TEST'};
const fixed=()=>new Date('2026-11-21T12:00:00.000Z');
const success=rows=>({ok:true,status:200,text:async()=>JSON.stringify(rows)});
const pending={id:pairId,trainer_id:trainerId,screen_user_id:screenId,
  accepted_at:null,expires_at:'2026-11-23T12:00:00.000Z'};
const approved={...pending,accepted_at:'2026-11-21T12:01:00.000Z'};

test('the pairing client rejects every destination other than exclusive HF TRAINING',()=>{
  for(const bad of [
    'https://other-project.supabase.co','http://ydaqsmrfuwhqwqojrxyr.supabase.co',
    'https://ydaqsmrfuwhqwqojrxyr.supabase.co/'
  ]){
    assert.throws(()=>createHFPairingClient({...config,url:bad}));
  }
  assert.throws(()=>createHFPairingClient({...config,publishableKey:'service_role_SECRET'}));
});

test('only authenticated trainer asks for a different dedicated screen account',async()=>{
  const calls=[];
  const client=createHFPairingClient(config,{
    fetchImpl:async(url,init)=>{calls.push({url,init});return success([pending]);},
    now:fixed
  });
  await assert.rejects(client.requestPairing(null,screenId),/iniciar sesión/i);
  await assert.rejects(client.requestPairing(trainer,trainerId),/distinta/i);
  assert.equal(calls.length,0);
  const result=await client.requestPairing(trainer,screenId);
  assert.equal(result.id,pairId);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/rest\/v1\/hf_class_pairings\?/);
  assert.equal(calls[0].init.headers.Authorization,'Bearer TRAINER_TEST');
  const payload=JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(payload).sort(),
    ['trainer_id','screen_user_id','request_expires_at','expires_at'].sort());
  assert.equal(Date.parse(payload.request_expires_at)-fixed().getTime(),600_000);
  assert.equal(Date.parse(payload.expires_at)-fixed().getTime(),48*3_600_000);
});

test('screen can list its own pending requests without granting trainer rights',async()=>{
  let lastUrl='';
  const client=createHFPairingClient(config,{
    fetchImpl:async(url)=>{lastUrl=url;return success([pending]);},now:fixed
  });
  const result=await client.listPendingForScreen(screen);
  assert.equal(result.length,1);
  assert.ok(lastUrl.includes('screen_user_id=eq.'+screenId));
  assert.ok(lastUrl.includes('accepted_at=is.null'));
  assert.ok(lastUrl.includes('request_expires_at=gt.'));
});

test('only a successful server update counts as screen acceptance',async()=>{
  let response=[approved],last=null;
  const client=createHFPairingClient(config,{now:fixed,
    fetchImpl:async(url,init)=>{last={url,init};return success(response);}
  });
  const result=await client.accept(screen,pairId);
  assert.equal(result.accepted_at,approved.accepted_at);
  assert.equal(last.init.method,'PATCH');
  assert.equal(last.init.headers.Authorization,'Bearer SCREEN_TEST');
  assert.deepEqual(Object.keys(JSON.parse(last.init.body)),['accepted_at']);
  response=[];
  await assert.rejects(client.accept(screen,pairId),/No se aceptó/);
});

test('explicit rejection or revocation is an append-only record',async()=>{
  let last=null;
  const client=createHFPairingClient(config,{fetchImpl:async(url,init)=>{
    last={url,init};
    return success([{pair_id:pairId,revoked_by:screenId}]);
  }});
  const result=await client.revoke(screen,pairId);
  assert.equal(result.pair_id,pairId);
  assert.equal(last.init.method,'POST');
  assert.match(last.url,/hf_class_pair_revocations/);
  assert.deepEqual(JSON.parse(last.init.body),{pair_id:pairId,revoked_by:screenId});
});

test('uncertain revocation never resends the request automatically',async()=>{
  let calls=0;
  const client=createHFPairingClient(config,{
    fetchImpl:async()=>{calls++;throw Error('network offline');}
  });
  await assert.rejects(client.revoke(screen,pairId),
    error=>error.code==='HF_PAIRING_UNCERTAIN');
  assert.equal(calls,1);
});

test('server state can be checked after a lost acknowledgement',async()=>{
  const client=createHFPairingClient(config,{now:fixed,fetchImpl:async(url)=>{
    if(url.includes('hf_class_pair_revocations'))return success([]);
    return success([approved]);
  }});
  const status=await client.inspectUncertain(screen,pairId);
  assert.equal(status.isActive,true);
  assert.equal(status.revocation,null);
  assert.equal(status.pairing.id,pairId);
});
