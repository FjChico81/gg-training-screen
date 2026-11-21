// HF TRAINING remote adapter smoke. No network calls or cloud changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFLiveClient,HFRevisionConflict} from '../src/hf-live-client.mjs';

const config={
  url:'https://ydaqsmrfuwhqwqojrxyr.supabase.co',
  publishableKey:'sb_publishable_TEST_ONLY'
};
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const commandId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const session={access_token:'FAKE_TOKEN',user:{id:user}};
const runtime={
  mode:'guided',phase:'work',step:1,turn:0,paused:false,
  deadlineUtc:'2026-11-21T12:00:00.000Z',
  elapsedMs:15000,phaseElapsedMs:2000,
  email:'NEVER_INCLUDE_IN_PUBLIC_RUNTIME'
};
const ok=rows=>({ok:true,status:200,text:async()=>JSON.stringify(rows)});

test('refuses any host other than the exact HF TRAINING project',()=>{
  assert.throws(()=>createHFLiveClient({...config,url:'https://unapproved.supabase.co'}));
  assert.throws(()=>createHFLiveClient({...config,url:'http://ydaqsmrfuwhqwqojrxyr.supabase.co'}));
  assert.throws(()=>createHFLiveClient({...config,url:config.url+'/unexpected/path'}));
  assert.throws(()=>createHFLiveClient({...config,publishableKey:'service_role_fake'}));
});

test('uses HF only and requires caller supplied HF credentials',async()=>{
  const calls=[];
  const client=createHFLiveClient(config,{fetchImpl:async(url,init)=>{
    calls.push({url,init});return ok([]);
  }});
  await assert.rejects(client.getSession(null,id),/Inicia sesión/);
  assert.equal(calls.length,0);
  await client.getSession(session,id);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/ydaqsmrfuwhqwqojrxyr\.supabase\.co\/rest\/v1\/hf_class_live_sessions/);
  assert.equal(calls[0].init.headers.Authorization,'Bearer FAKE_TOKEN');
  assert.equal(calls[0].init.headers.apikey,config.publishableKey);
  assert.equal(calls[0].init.redirect,'error');
});

test('PATCH performs optimistic lock and excludes private runtime fields',async()=>{
  const calls=[];
  const client=createHFLiveClient(config,{fetchImpl:async(url,init)=>{
    calls.push({url,init});return ok([{id,revision:1,last_command_id:commandId}]);
  }});
  const response=await client.updateRuntime(session,{id,expectedRevision:0,commandId,runtime});
  assert.equal(response.id,id);
  assert.match(calls[0].url,/revision=eq\.0/);
  assert.equal(calls[0].init.method,'PATCH');
  const payload=JSON.parse(calls[0].init.body);
  assert.equal(payload.revision,1);
  assert.equal(payload.last_command_id,commandId);
  assert.equal(payload.runtime.email,undefined);
  assert.equal(calls[0].init.headers.Prefer,'return=representation');
});

test('zero rows means revision conflict or unauthorized; no blind retry',async()=>{
  let count=0;
  const client=createHFLiveClient(config,{fetchImpl:async()=>{
    count++;return ok([]);
  }});
  await assert.rejects(
    client.updateRuntime(session,{id,expectedRevision:0,commandId,runtime}),
    error=>error instanceof HFRevisionConflict
  );
  assert.equal(count,1);
});

test('unknown network result does not trigger an automatic second write',async()=>{
  let count=0;
  const client=createHFLiveClient(config,{fetchImpl:async()=>{
    count++;throw Error('offline');
  }});
  await assert.rejects(
    client.updateRuntime(session,{id,expectedRevision:0,commandId,runtime}),
    error=>error.code==='HF_UNCERTAIN_REQUEST'
  );
  assert.equal(count,1);
});

test('interrupted response body is also ambiguous, not safe to replay',async()=>{
  const client=createHFLiveClient(config,{fetchImpl:async()=>({
    ok:true,status:200,text:async()=>{throw Error('connection lost')}
  })});
  await assert.rejects(
    client.updateRuntime(session,{id,expectedRevision:0,commandId,runtime}),
    error=>error.code==='HF_UNCERTAIN_REQUEST'
  );
});

test('investigates uncertain command by reading last command UUID',async()=>{
  const client=createHFLiveClient(config,{fetchImpl:async()=>ok([{id,last_command_id:commandId}])});
  const result=await client.inspectUncertainCommand(session,id,commandId);
  assert.equal(result.committed,true);
});

test('screen view filters by its own authenticated ID',async()=>{
  let lastUrl='';
  const client=createHFLiveClient(config,{fetchImpl:async(url)=>{
    lastUrl=url;return ok([]);
  },now:()=>new Date('2026-11-21T11:00:00.000Z')});
  await client.listMyScreenSessions(session);
  assert.ok(lastUrl.includes('screen_user_id=eq.'+user));
  assert.ok(lastUrl.includes('expires_at=gt.'));
});
