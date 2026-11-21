/**
 * HF collective-screen adapter for the exact advanced block names written by
 * the existing HF workout editor. No network/storage access or code execution.
 */
const FORMATS={
  amrap:/^AMRAP (\d+)s · (.+)$/,
  emom:/^EMOM · (.+)$/,
  forTime:/^FOR TIME (\d+)s · (.+) · Ronda (\d+)\/(\d+)$/
};
const LIMIT_STEPS=200;
function reject(message){throw Error(message);}
function limited(value,what,max=100){
  if(typeof value!=='string'||!value.trim()||value.length>max)
    reject('El '+what+' supera el tamaño permitido o está vacío.');
  return value.trim();
}
function step(raw,block,converter,advanced=false){
  const out=converter(raw,block);
  if(!Array.isArray(out)||!out.length||advanced&&out.length!==1)
    reject('Este bloque avanzado contiene series o descansos que no pueden reproducirse fielmente en la pantalla colectiva.');
  if(advanced&&out[0].kind==='exercise'&&out[0].target?.startsWith('Serie '))
    reject('La fuerza por series dentro de un bloque avanzado necesita el motor individual HF.');
  return out;
}
function number(s,min,max,what){
  if(!/^\d+$/.test(s))reject('Formato incorrecto en '+what);
  const value=Number(s);
  if(!Number.isSafeInteger(value)||value<min||value>max)reject(what+' fuera de límites');
  return value;
}
function matchForTime(block){return block.name.match(FORMATS.forTime);}
function pushSteps(out,raws,name,convert,advanced){
  for(const raw of raws){
    const added=step(raw,name,convert,advanced);
    if(out.length+added.length>LIMIT_STEPS)reject('La presentación supera los 200 pasos permitidos.');
    out.push(...added);
  }
}
/**
 * Returns {guided, segments}; one segment may repeat (AMRAP) or stop at a
 * global deadline (FOR TIME), while EMOM uses exact work/rest generated steps.
 * The given workout and its blocks are never changed.
 */
export function buildHFAdvancedGuided(workout,convert){
  if(!Array.isArray(workout?.blocks)||typeof convert!=='function')reject('Rutina HF inválida.');
  const guided=[],segments=[];
  for(let i=0;i<workout.blocks.length;){
    const block=workout.blocks[i],name=block.name;
    const am=name.match(FORMATS.amrap),em=name.match(FORMATS.emom),ft=matchForTime(block);
    if(!am&&!em&&!ft&&/\b(?:AMRAP|EMOM|FOR TIME)\b/i.test(name))
      reject('El formato avanzado de '+name+' no está reconocido. Se conserva el motor original.');
    if(am){
      const seconds=number(am[1],1,7200,'Tiempo AMRAP');
      limited(am[2],'nombre AMRAP',85);
      if(block.items.length>40)reject('AMRAP admite hasta 40 ejercicios.');
      const start=guided.length;
      pushSteps(guided,block.items,name,convert,true);
      segments.push({type:'amrap',start,end:guided.length-1,limitSeconds:seconds,label:limited(am[2],'AMRAP',85)});
      i++;continue;
    }
    if(em){
      const title=limited(em[1],'EMOM',85);
      const items=block.items;
      if(items.length<2||items.length>100||items.length%2!==0)
        reject('El EMOM debe tener trabajo y recuperación en cada ronda.');
      const rounds=items.length/2;
      const start=guided.length;
      let workSeconds=null,restSeconds=null;
      for(let j=0;j<rounds;j++){
        const work=items[j*2].match(/^(.*?) · Ronda (\d+)\/(\d+) @(\d+)$/);
        const rest=items[j*2+1].match(/^Recuperaci[oó]n · Ronda (\d+)\/(\d+) @(\d+)$/i);
        if(!work||!rest||!work[1]||Number(work[2])!==j+1||Number(rest[1])!==j+1||
          Number(work[3])!==rounds||Number(rest[2])!==rounds)reject('El EMOM tiene rondas incompletas o desordenadas.');
        const workTime=number(work[4],1,59,'Trabajo EMOM');
        const restTime=number(rest[3],1,59,'Recuperación EMOM');
        if(workTime+restTime!==60)reject('Cada ronda EMOM debe sumar exactamente 60 segundos.');
        if(workSeconds!==null&&(workSeconds!==workTime||restSeconds!==restTime))
          reject('El EMOM generado por HF conserva el mismo tiempo por ronda; esta rutina fue modificada.');
        workSeconds=workTime;restSeconds=restTime;
        pushSteps(guided,[items[j*2],items[j*2+1]],name,convert,true);
      }
      segments.push({type:'emom',start,end:guided.length-1,limitSeconds:rounds*60,label:title,rounds,workSeconds,restSeconds});
      i++;continue;
    }
    if(ft){
      const limit=number(ft[1],0,7200,'Límite FOR TIME');
      const title=limited(ft[2],'FOR TIME',85);
      const rounds=number(ft[4],1,20,'Rondas FOR TIME');
      if(number(ft[3],1,rounds,'Ronda FOR TIME')!==1)
        reject('La primera ronda FOR TIME debe ser 1.');
      const start=guided.length;
      for(let round=1;round<=rounds;round++){
        const candidate=workout.blocks[i+round-1],next=candidate&&matchForTime(candidate);
        if(!next||Number(next[1])!==limit||next[2]!==title||
          Number(next[3])!==round||Number(next[4])!==rounds)
          reject('Las rondas FOR TIME deben ser consecutivas y conservar la configuración.');
        pushSteps(guided,candidate.items,candidate.name,convert,true);
      }
      segments.push({type:'for-time',start,end:guided.length-1,limitSeconds:limit,label:title,rounds});
      i+=rounds;continue;
    }
    pushSteps(guided,block.items,name,convert,false);
    i++;
  }
  return {guided,segments};
}
export function getHFSegment(segments,index){
  if(!Array.isArray(segments))return null;
  return segments.find(s=>index>=s.start&&index<=s.end)||null;
}
