import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toHFPresentation,createHFHandoff,consumeHFHandoff,HFPresentationError}
  from '../src/hf-workout-presenter.mjs';

const token='11111111-2222-4333-8444-555555555555';
const now=1763740000000;
const store=()=>{
 const state=new Map();
 return {state,getItem:k=>state.get(k)??null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
};
const fixture=()=>({
 id:'saved-1',name:'HF · Fuerza y cardio',hrLimit:185,
 ggCloud:{user_id:'private-user',revision:12},
 blocks:[
  {name:'Fuerza',items:[
    'Sentadilla goblet | 3x10 | 25kg | RIR 2 | descanso 45s | GIF sentadilla-goblet',
    '20 burpees'
  ]},
  {name:'Cardio',items:['Carrera | 400 m','SkiErg @60',
    'Recuperación · Ronda 1/3 @30','Bicicleta | 20 kcal']}
 ]});
test('read-only export never mutates the saved workout, ID, cloud revision or HR profile',()=>{
 const w=fixture(), original=structuredClone(w);
 const data=toHFPresentation(w,'guided');
 assert.deepEqual(w,original);
 assert.equal(data.title,w.name);
 assert.equal(data.mode,'guided');
 const text=JSON.stringify(data);
 for(const privateField of ['hrLimit','user_id','revision','saved-1'])assert.equal(text.includes(privateField),false);
 assert.equal(data.requiresReview,false);
});
test('strength with explicit rest expands sets and only inserts programmed breaks',()=>{
 const guided=toHFPresentation(fixture(),'guided').plan.guided;
 const squat=guided.filter(x=>x.name==='Sentadilla goblet');
 const rest=guided.filter(x=>x.kind==='rest');
 assert.equal(squat.length,3);
 assert.equal(squat[0].seconds,0);
 assert.match(squat[1].target,/Serie 2\/3 · 10 repeticiones · 25 kg · RIR 2/);
 assert.equal(squat[0].gifId,'sentadilla-goblet');
 assert.deepEqual(rest.map(x=>x.seconds),[45,45,30]);
 const noExplicit=toHFPresentation({name:'Series sin descanso',blocks:[
  {name:'Fuerza',items:['3 × 10 sentadillas']}
 ]},'guided').plan.guided;
 assert.equal(noExplicit.length,3);
 assert.equal(noExplicit.every(x=>x.kind==='exercise'),true);
});
test('cardio distances, reps, calories and explicit duration retain targets',()=>{
 const list=toHFPresentation(fixture(),'guided').plan.guided;
 assert.ok(list.some(x=>x.name==='Carrera'&&x.target==='400 m'&&x.seconds===0));
 assert.ok(list.some(x=>x.name==='Bicicleta'&&x.target==='20 kcal'));
 assert.ok(list.some(x=>x.name==='burpees'&&x.target==='20 repeticiones'));
 assert.ok(list.some(x=>x.name==='SkiErg'&&x.seconds===60));
});
test('legacy 5 min bicycle without @seconds is manual: no fabricated countdown',()=>{
 const p=toHFPresentation({name:'Legacy',blocks:[{name:'Cardio',items:['5 min bicicleta']}]},'guided');
 assert.equal(p.plan.guided[0].seconds,0);
 assert.equal(p.plan.guided[0].target,'5 min');
});
test('valid AMRAP is preserved while malformed EMOM and FOR TIME are rejected',()=>{
 const amrap=toHFPresentation({name:'AMRAP',blocks:[{name:'AMRAP 900s · Ejemplo',items:['Burpees @30']}]},'guided');
 assert.equal(amrap.plan.segments[0].type,'amrap');
 for(const name of ['EMOM · SkiErg','FOR TIME 1200s · Ejemplo']){
  assert.throws(()=>toHFPresentation({name:'Complex',blocks:[{name,items:['Burpees @30']}]},'guided'),
    HFPresentationError);
 }
});
test('missing time for rest and conflicting timed strength reject rather than invent logic',()=>{
 for(const item of ['DESCANSO','Recuperación · Ronda 2/3','Sentadilla | 3x10 @60']){
  assert.throws(()=>toHFPresentation({name:'Invalid',blocks:[{name:'Fuerza',items:[item]}]},'guided'),
    HFPresentationError);
 }
});
test('station adaptation requires 2–8 exercises in a single untimed block and review',()=>{
 const w={name:'Estaciones de fuerza',blocks:[{name:'Estaciones',items:[
  'Sentadilla goblet | 3x10 | 25kg | RIR 2',
  'Carrera | 400 m','20 burpees'
 ]}]};
 const result=toHFPresentation(w,'stations');
 assert.equal(result.requiresReview,true);
 assert.equal(result.plan.stations.length,3);
 assert.equal(result.plan.stations[0].name,'Sentadilla goblet');
 assert.equal(result.plan.stations[1].target,'400 m');
 assert.deepEqual([result.plan.rounds,result.plan.work,result.plan.change],[3,60,20]);
 assert.match(result.warnings[0],/NO provienen/);
 for(const invalid of [
  {name:'Too many blocks',blocks:[{name:'A',items:['A','B']},{name:'B',items:['C']}]},
  {name:'Timed stations',blocks:[{name:'Estaciones',items:['SkiErg @40','Burpees']}]},
  {name:'Interval circuit',blocks:[{name:'Intervalos',items:['Carrera','SkiErg']}]}
 ])assert.throws(()=>toHFPresentation(invalid,'stations'),HFPresentationError);
});
test('handoff is same-tab and temporary, never touches saved workout storage',()=>{
 const st=store();const workout=fixture();
 const id=createHFHandoff(workout,'guided',{store:st,uuid:()=>token,now:()=>now});
 assert.equal(id,token);
 assert.equal(st.state.size,1);
 const consumed=consumeHFHandoff(token,{store:st,now:()=>now+60000});
 assert.equal(consumed.plan.guided.length,10); // 3 squat + 2 rest + 5 others
 assert.equal(consumed.title,workout.name);
 assert.deepEqual(workout,fixture());
 assert.equal(st.state.has('gg-training-screen-workouts-v1'),false);
 assert.equal(st.state.has('hf:personal:gg-training-screen-workouts-v1'),false);
});
test('expired, malformed and missing transfers fail closed',()=>{
 const st=store();
 createHFHandoff(fixture(),'guided',{store:st,now:()=>now,uuid:()=>token});
 assert.throws(()=>consumeHFHandoff(token,{store:st,now:()=>now+11*60000}),HFPresentationError);
 assert.throws(()=>consumeHFHandoff(token,{store:store(),now:()=>now}),HFPresentationError);
 assert.throws(()=>consumeHFHandoff('invalid',{store:st,now:()=>now}),HFPresentationError);
});
test('limit checks prevent runaway expansion over 200 planned steps',()=>{
 const huge={name:'Huge',blocks:[{name:'Fuerza',items:[
   ...Array(7).fill('Sentadilla | 30x10 | descanso 30s')
 ]}]};
 assert.throws(()=>toHFPresentation(huge,'guided'),/200 pasos/);
});
