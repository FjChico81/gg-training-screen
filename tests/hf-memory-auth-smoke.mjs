import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHFMemoryAuth} from '../src/hf-memory-auth.mjs';
const config={url:'https://ydaqsmrfuwhqwqojrxyr.supabase.co',
  publishableKey:'sb_publishable_FAKE'};
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session={access_token:'fake-access',refresh_token:'fake-refresh',user:{id:user},expires_in:3600};
const ok=(data,status=200)=>({ok:status<300,status,text:async()=>JSON.stringify(data)});

test('auth refuses any foreign, non-HTTPS or malformed destination before contacting network',()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return ok(session);};
  for(const url of [
    'https://wrong.supabase.co','http://ydaqsmrfuwhqwqojrxyr.supabase.co',
    'https://ydaqsmrfuwhqwqojrxyr.supabase.co/'
  ]) assert.throws(()=>createHFMemoryAuth({...config,url},{fetchImpl}));
  assert.equal(calls,0);
});
test('login/refresh operate with publishable key and memory-only session',async()=>{
  const calls=[];
  const auth=createHFMemoryAuth(config,{fetchImpl:async(url,init)=>{
    calls.push({url,init});return ok(session);
  }});
  assert.equal(auth.session,null);
  const login=await auth.login('trainer@example.test','test-password');
  assert.equal(login.user.id,user);
  assert.equal(login.refresh_token,undefined);
  assert.equal(auth.session.refresh_token,'fake-refresh');
  assert.equal(calls[0].init.headers.apikey,config.publishableKey);
  assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.ok(calls[0].url.endsWith('token?grant_type=password'));
  await auth.refresh();
  assert.ok(calls[1].url.endsWith('token?grant_type=refresh_token'));
  assert.equal(calls[1].init.body,JSON.stringify({refresh_token:'fake-refresh'}));
  auth.clear();
  assert.equal(auth.session,null);
});
test('failed authentication cannot create a valid session',async()=>{
  const auth=createHFMemoryAuth(config,{fetchImpl:async()=>ok({message:'wrong'},401)});
  await assert.rejects(auth.login('user@test.test','bad'));
  assert.equal(auth.session,null);
});
test('logout drops token from memory before remote logout response arrives',async()=>{
  let finish;
  const auth=createHFMemoryAuth(config,{fetchImpl:async(url)=>{
    if(url.includes('/logout'))return new Promise(resolve=>{finish=()=>resolve(ok({}));});
    return ok(session);
  }});
  await auth.login('test@example.test','demo');
  const pending=auth.logout();
  assert.equal(auth.session,null);
  finish();await pending;
});
