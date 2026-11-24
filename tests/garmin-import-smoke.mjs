import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {activitySummary, createGarminHandler} from '../supabase/functions/garmin-activities/index.ts';
import {createProfileSync} from '../src/authenticated-sync-v2.mjs';

const owner='owner-for-test', webOrigin='https://example.test';
const settings={owner,webOrigin,supabaseUrl:'https://gg-test.supabase.co',publishableKey:'public-test',garminKey:'garmin-test'};
const request=(method='POST',origin=webOrigin,authorization='Bearer user-test')=>new Request('https://gg-test.supabase.co/functions/v1/garmin-activities',{
 method,headers:{...(origin?{Origin:origin}:{}),...(authorization?{Authorization:authorization}:{})}
});
const garminRow={activityId:42,activityName:'Carrera',activityType:{typeKey:'running'},startTimeGMT:'2026-11-23 07:30:00',
 duration:3600,distance:10000,averageHR:150,maxHR:172,startLatitude:38.9};

test('Garmin response publishes only summary fields with a UTC timestamp',()=>{
 assert.deepEqual(activitySummary(garminRow),{
  id:'42',name:'Carrera',type:'running',date:'2026-11-23T07:30:00.000Z',
  elapsed:3600,elapsedWallSeconds:3600,distanceMeters:10000,averageHeartRate:150,peakHeartRate:172
 });
 assert.equal(activitySummary({...garminRow,parentId:50}),null);
 assert.equal(activitySummary({...garminRow,startTimeGMT:'invalid'}),null);
 assert.equal(activitySummary({...garminRow,maxHR:0}).peakHeartRate,null);
});

test('other users and origins cannot trigger Garmin requests',async()=>{
 let calls=0;
 const handle=createGarminHandler({...settings,fetchImpl:async url=>{
  assert.equal(url,settings.supabaseUrl+'/auth/v1/user');calls++;
  return Response.json({id:'other-user'});
 }});
 assert.equal((await handle(request('POST','https://other.test'))).status,403);
 assert.equal((await handle(request('POST',webOrigin,''))).status,401);
 assert.deepEqual(await (await handle(request('GET'))).json(),{enabled:false});
 assert.equal((await handle(request())).status,403);
 assert.equal(calls,2);
});

test('the verified owner can fetch the latest summaries without seeing Garmin credentials',async()=>{
 const calls=[];
 const handle=createGarminHandler({...settings,fetchImpl:async (url,{headers})=>{
  const address=new URL(url);
  calls.push(address.pathname);
  if(address.origin===settings.supabaseUrl){
   assert.equal(headers.Authorization,'Bearer user-test');
   return Response.json({id:owner});
  }
  if(address.pathname.includes('token')){
   assert.equal(headers.Authorization,'ApiKey garmin-test');
   return new Response('token.test');
  }
  assert.equal(address.searchParams.get('limit'),'30');
  assert.equal(headers.Authorization,'Bearer token.test');
  return Response.json([garminRow,{...garminRow,activityId:43,parentId:99}]);
 }});
 assert.deepEqual(await (await handle(request('GET'))).json(),{enabled:true});
 assert.equal(calls.length,1);
 const response=await handle(request());
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await response.json(),{activities:[activitySummary(garminRow)]});
 assert.equal(calls.length,4);
});

test('an import skips existing IDs and respects Garmin entries deleted on a different device',async()=>{
 const storageData=new Map(),activity={id:'garmin-42',source:'garmin',name:'Carrera'};
 const storage={getItem:key=>storageData.get(key)??null,setItem:(key,value)=>storageData.set(key,value)};
 let remote=[],applied;
 const cloud={verified:true,getRecords:async()=>remote,
  async upsertRevision(){
   const error=Object.assign(new Error('duplicate'),{code:'23505'});
   remote=[{kind:'history',client_id:activity.id,payload:{id:activity.id},deleted_at:'2026-11-24T00:00:00Z',revision:2}];
   throw error;
  }
 };
 const sync=createProfileSync({cloud,profileId:owner,storage,prefix:'gg-test:',onApply:async view=>{applied=view}});
 sync.seedLocal();
 sync.changed('history',JSON.stringify([activity]),{insertOnly:true});
 await sync.synchronize();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(applied.history,[]);
 assert.deepEqual(JSON.parse(storage.getItem('gg-test:sync-v2-pending')),{});
});

const historySource=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const intervalStart=historySource.indexOf('function workoutHistoryInterval(');
const intervalEnd=historySource.indexOf('function renderProfileStats(',intervalStart);
const helpers=runInNewContext(historySource.slice(intervalStart,intervalEnd)+'\n;({overlapsBuhardilla,buhardillaHistoryIntervals,visibleHistoryIndices});');

test('matching Garmin and BUHARDILLA times count once, with independent activities preserved',()=>{
 const workout={date:'2026-11-24T10:45:00Z',elapsed:1800,startedAt:'2026-11-24T10:00:00Z'};
 const garmin={source:'garmin',date:'2026-11-24T10:02:00Z',elapsed:1400,garmin:{elapsedWallSeconds:2400}};
 const separate={source:'garmin',date:'2026-11-24T10:44:30Z',elapsed:1200};
 const intervals=helpers.buhardillaHistoryIntervals([workout]);
 assert.equal(helpers.overlapsBuhardilla(garmin,intervals),true);
 assert.equal(helpers.overlapsBuhardilla(separate,intervals),false);
 assert.deepEqual(Array.from(helpers.visibleHistoryIndices([garmin,workout,separate])),[1,2]);
});

test('older BUHARDILLA sessions estimate the start from the saved end time and duration',()=>{
 const legacy={date:'2026-11-24T00:10:00Z',elapsed:1800};
 const beforeMidnight={date:'2026-11-23T23:40:00Z',elapsed:1800};
 const intervals=helpers.buhardillaHistoryIntervals([legacy]);
 assert.equal(helpers.overlapsBuhardilla(beforeMidnight,intervals),true);
});
