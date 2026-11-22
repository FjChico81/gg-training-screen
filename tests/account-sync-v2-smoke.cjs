// GG/HF Auth V2 -- offline mock tests. No network, database or HPS.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const root=resolve(__dirname,'..');
const mod=import(pathToFileURL(resolve(root,'src/authenticated-sync-v2.mjs')).href);
const userId='11111111-2222-4333-8444-555555555555';
const profileId=userId;
function memory(){const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
function server(){
 const rows=[],profiles=[];
 const reply=(value,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(value)});
 let online=true;
 return {
  rows,profiles,setOnline(v){online=v},
  async fetch(url,options){
   if(!online)throw Error('offline');
   const dest=new URL(url),verb=options.method||'GET';
   if(dest.pathname==='/auth/v1/token'&&dest.searchParams.get('grant_type')==='password')
     return reply({user:{id:userId,email:'test@example.com'},access_token:'access',refresh_token:'refresh',expires_in:3600});
   if(dest.pathname==='/auth/v1/user')return reply({id:userId,email:'test@example.com'});
   if(dest.pathname==='/rest/v1/training_profiles_v2'){
    if(verb==='GET')return reply(profiles);
    if(verb==='POST'){profiles.push(JSON.parse(options.body));return reply(null,201)}
   }
   if(dest.pathname==='/rest/v1/training_records_v2'){
    if(verb==='GET')return reply(rows.map(x=>JSON.parse(JSON.stringify(x))));
    if(verb==='POST'){
     const x=JSON.parse(options.body);
     if(rows.some(r=>r.kind===x.kind&&r.client_id===x.client_id))return reply({code:'23505',message:'duplicate'},409);
     rows.push(x);return reply([{revision:1}],201);
    }
    if(verb==='PATCH'){
     const id=dest.searchParams.get('client_id')?.slice(3),kind=dest.searchParams.get('kind')?.slice(3);
     const revision=Number(dest.searchParams.get('revision')?.slice(3));
     const target=rows.find(r=>r.kind===kind&&r.client_id===id&&r.revision===revision);
     if(!target)return reply([]);
     Object.assign(target,JSON.parse(options.body));return reply([{revision:target.revision}]);
    }
   }
   return reply({error:'Unexpected request '+dest.pathname},404);
  }
 };
}
function client(api,transport,storage,edition='gg'){
 return api.createEditionCloud({url:'https://example.supabase.co',publishableKey:'sb_publishable_mock',
  edition,storage,fetchImpl:transport.fetch,now:()=>100000});
}
test('unauthenticated clients cannot access account records',async()=>{
 const api=await mod,transport=server(),storage=memory(),cloud=client(api,transport,storage);
 assert.equal(await cloud.verify(),null);
 await assert.rejects(cloud.getRecords(profileId),/Inicia sesión/);
 assert.equal(transport.rows.length,0);
});
test('valid account creates one primary profile and keeps legacy data untouched',async()=>{
 const api=await mod,transport=server(),storage=memory();
 storage.setItem('gg-training-screen-workouts-v1','LEGACY_USER_DATA');
 const cloud=client(api,transport,storage);
 const user=await cloud.login('test@example.com','test-pass');
 assert.equal(user.id,userId);
 const profiles=await cloud.profiles();
 assert.equal(profiles.length,1);
 assert.equal(profiles[0].owner_id,userId);
 assert.equal(api.profileLocalId(userId,api.profileUUID(userId,'personal')),'personal');
 assert.equal(storage.getItem('gg-training-screen-workouts-v1'),'LEGACY_USER_DATA');
});
test('workouts and history sync without duplicate IDs',async()=>{
 const api=await mod,transport=server(),storage=memory(),cloud=client(api,transport,storage);
 await cloud.login('test@example.com','test-pass');await cloud.profiles();
 let latest;
 const sync=api.createProfileSync({cloud,profileId,storage,prefix:'v2-local:',onApply:async v=>{latest=v}});
 await sync.initial();
 sync.changed('workout',JSON.stringify([{id:'routine-1',name:'Sesión A',blocks:[]}]));
 await sync.synchronize();
 sync.changed('history',JSON.stringify([{id:'session-1',name:'Sesión A',rpe:7}]));
 await sync.synchronize();
 assert.equal(latest.workouts.length,1);
 assert.equal(latest.history.length,1);
 assert.equal(transport.rows.length,2);
 assert.equal(sync.pendingCount(),0);
 await sync.synchronize();assert.equal(transport.rows.length,2);
});
test('offline queue keeps changes and never overwrites a new remote revision',async()=>{
 const api=await mod,transport=server(),storage=memory(),cloud=client(api,transport,storage);
 await cloud.login('test@example.com','test-pass');await cloud.profiles();
 transport.rows.push({owner_id:userId,profile_id:profileId,kind:'workout',client_id:'w1',
   payload:{id:'w1',name:'Servidor'},revision:1,deleted_at:null});
 let current;
 const sync=api.createProfileSync({cloud,profileId,storage,prefix:'v2-conflict:',onApply:async v=>current=v});
 await sync.initial();transport.setOnline(false);
 sync.changed('workout',JSON.stringify([{id:'w1',name:'Edición local'}]));
 await sync.synchronize();
 assert.equal(sync.pendingCount(),1);
 transport.setOnline(true);transport.rows[0].revision=2;transport.rows[0].payload.name='Edición remota';
 await sync.synchronize();
 assert.equal(transport.rows[0].payload.name,'Edición remota');
 assert.equal(sync.pendingCount(),1);
 assert.equal(current.workouts[0].name,'Edición local');
});
test('collective HF history and checkpoint use separate record kinds',async()=>{
 const api=await mod,transport=server(),storage=memory(),cloud=client(api,transport,storage,'hf');
 await cloud.login('test@example.com','test-pass');await cloud.profiles();
 let latest;
 const sync=api.createProfileSync({cloud,profileId,storage,prefix:'hf-collective:',onApply:async v=>latest=v});
 await sync.initial();
 sync.changed('collective',JSON.stringify([{runId:'run-1',title:'Clase',rpe:8}]));
 sync.changed('class_state',{phase:'work',step:2});
 await sync.synchronize();
 assert.equal(latest.collective.length,1);
 assert.equal(latest.class_state.step,2);
 assert.deepEqual(transport.rows.map(x=>x.kind).sort(),['class_state','collective']);
});
test('login wall protects both apps and HF class direct URL',()=>{
 const html=readFileSync(resolve(root,'index.html'),'utf8');
 const hf=readFileSync(resolve(root,'hf-class-display.html'),'utf8');
 const sql=readFileSync(resolve(root,'infra/sql/authenticated-sync-v2.sql'),'utf8');
 assert.match(html,/document\.documentElement\.dataset\.access='locked'/);
 assert.match(html,/id="accountWall"/);
 assert.match(html,/src="src\/account-entry-v2\.mjs"/);
 assert.match(hf,/data-access="locked"/);
 assert.match(hf,/src="src\/hf-class-access-v2\.mjs"/);
 assert.match(sql,/alter table public\.training_records_v2 enable row level security/);
 assert.match(sql,/to authenticated/);
 assert.match(sql,/\(select auth\.uid\(\)\) = owner_id/);
 assert.doesNotMatch(sql,/grant\s+all\s+on\s+public\.training_records_v2\s+to\s+anon/i);
});

test('a previously verified user can open cached profile offline, but new devices cannot',async()=>{
 const api=await mod,transport=server(),storage=memory();
 const online=client(api,transport,storage);
 await online.login('test@example.com','test-pass');
 const profiles=await online.profiles();
 assert.equal(profiles.length,1);
 transport.setOnline(false);
 const offline=api.createEditionCloud({url:'https://example.supabase.co',
  publishableKey:'sb_publishable_mock',edition:'gg',storage,
  fetchImpl:transport.fetch,now:()=>100500,offline:()=>true});
 const cached=await offline.verify();
 assert.equal(cached.offline,true);
 const cachedProfiles=await offline.profiles();
 assert.equal(cachedProfiles[0].id,userId);
 const empty=api.createEditionCloud({url:'https://example.supabase.co',
  publishableKey:'sb_publishable_mock',edition:'hf',storage:memory(),
  fetchImpl:transport.fetch,now:()=>100500,offline:()=>true});
 assert.equal(await empty.verify(),null,'New browser cannot unlock offline');
 const noAuth=client(api,transport,memory(),'hf');
 await assert.rejects(noAuth.getRecords(userId),/Inicia sesión/);
});
test('offline account scope and HF collective profiles do not overlap',()=>{
 const html=readFileSync(resolve(root,'hf-class-display.html'),'utf8');
 const gate=readFileSync(resolve(root,'src/hf-class-access-v2.mjs'),'utf8');
 const main=readFileSync(resolve(root,'index.html'),'utf8');
 assert.match(main,/secureNamespace=\(isHF\?'hf-v2:':'gg-v2:'\)/);
 assert.match(html,/authorizedProfileId/);
 assert.match(gate,/window\.__HF_V2_BOOT\(user\.id,requested\)/);
 assert.match(gate,/const root='hf-auth-v2:'\+user\.id\+':'\+requested\+':'/);
});

test('two devices see the same authenticated workout and completed history',async()=>{
 const api=await mod,transport=server(),mobile=memory(),tablet=memory();
 const mobileCloud=client(api,transport,mobile),tabletCloud=client(api,transport,tablet);
 await mobileCloud.login('test@example.com','test-pass');
 await tabletCloud.login('test@example.com','test-pass');
 await mobileCloud.profiles();await tabletCloud.profiles();
 let mobileView=null,tabletView=null;
 const first=api.createProfileSync({cloud:mobileCloud,profileId,storage:mobile,prefix:'phone:',onApply:async x=>{mobileView=x}});
 const second=api.createProfileSync({cloud:tabletCloud,profileId,storage:tablet,prefix:'tablet:',onApply:async x=>{tabletView=x}});
 await first.initial();await second.initial();
 first.changed('workout',JSON.stringify([{id:'w-iphone',name:'Carrera en cinta',blocks:[{name:'Inicio',items:['5 min']}] }]));
 await first.synchronize();await second.synchronize();
 assert.equal(tabletView.workouts.length,1);
 assert.equal(tabletView.workouts[0].name,'Carrera en cinta');
 second.changed('history',JSON.stringify([{id:'h-tablet',name:'Carrera en cinta',rpe:6,notes:'Sin molestias'}]));
 await second.synchronize();await first.synchronize();
 assert.equal(mobileView.history.length,1);
 assert.equal(mobileView.history[0].notes,'Sin molestias');
 assert.equal(transport.rows.filter(x=>x.kind==='history').length,1);
});
test('queued edit is not discarded after response to a previous edit',async()=>{
 const api=await mod,transport=server(),storage=memory();
 const cloud=client(api,transport,storage);
 await cloud.login('test@example.com','test-pass');await cloud.profiles();
 let releaseFirst=null,posted=false;
 const delayedFetch=async (url,opts)=>{
  const path=new URL(url).pathname;
  if(path==='/rest/v1/training_records_v2' && opts.method==='POST' && !posted){
    posted=true;await new Promise(resolve=>{releaseFirst=resolve});
  }
  return transport.fetch(url,opts);
 };
 const delayedCloud=api.createEditionCloud({url:'https://example.supabase.co',publishableKey:'sb_publishable_mock',
  edition:'gg',storage,fetchImpl:delayedFetch,now:()=>100000});
 await delayedCloud.verify();
 const control=api.createProfileSync({cloud:delayedCloud,profileId,storage,prefix:'race:',onApply:async()=>{}});
 await control.initial();
 control.changed('workout',JSON.stringify([{id:'r1',name:'Edición inicial',blocks:[]}]));
 const first=control.synchronize();
 for(let attempt=0;attempt<50&&!releaseFirst;attempt++)await Promise.resolve();
 assert.equal(typeof releaseFirst,'function');
 control.changed('workout',JSON.stringify([{id:'r1',name:'Edición posterior',blocks:[]}]));
 releaseFirst();await first;
 for(let attempt=0;attempt<30 && (transport.rows[0]?.payload.name!=='Edición posterior'||control.pendingCount()!==0);attempt++)
  await new Promise(resolve=>setImmediate(resolve));
 assert.equal(transport.rows[0]?.payload.name,'Edición posterior');
 assert.equal(control.pendingCount(),0);
});
