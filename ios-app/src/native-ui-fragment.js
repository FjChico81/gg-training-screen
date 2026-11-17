// Solo se inserta dentro de la compilación nativa. No debe cargarse en Safari.
function formatHeartSummary(info){
  if(!info||!info.samples)return 'Sin pulsaciones registradas durante esta sesión';
  return 'FC media '+info.meanBpm+' ppm · máxima '+info.maxBpm+' ppm · medidos '+formatSeconds(info.coveredSeconds)+' ('+info.coveragePct+' % del entrenamiento)';
}
function renderHistoricalHeart(record,card,details){
  const info=record.heartRate;
  if(!info||!info.samples)return;
  card.append(node('p',formatHeartSummary(info),'gold small'));
  if(info.zonesConfigured&&Array.isArray(info.zoneSeconds)){
    details.append(node('p',info.zoneSeconds.map((s,i)=>'Z'+(i+1)+' '+formatSeconds(Math.round(s))).join(' · '),'muted small'));
  }else details.append(node('p','Zonas no calculadas: FC máxima sin configurar en esta sesión','muted small'));
  const raw=Array.isArray(info.points)?info.points:[];
  const points=raw.filter(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[1]>=25&&p[1]<=240);
  if(points.length<2)return;
  const visible=points.filter((p,i)=>i%Math.max(1,Math.ceil(points.length/400))===0||i===points.length-1);
  const xs=Math.max(1,info.durationSeconds||0,visible.at(-1)[0]);
  const min=Math.max(0,Math.min(...visible.map(p=>p[1]))-10);
  const max=Math.min(250,Math.max(...visible.map(p=>p[1]))+10);
  const height=Math.max(1,max-min);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 300 95');
  svg.setAttribute('aria-label','Gráfico de pulsaciones en la sesión');
  svg.setAttribute('role','img');
  svg.style.cssText='width:100%;max-width:500px;display:block;margin:10px 0';
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  line.setAttribute('points',visible.map(p=>(8+(p[0]/xs)*284).toFixed(1)+','+(87-(p[1]-min)/height*79).toFixed(1)).join(' '));
  line.setAttribute('fill','none');
  line.setAttribute('stroke','#ff7777');
  line.setAttribute('stroke-width','2');
  svg.append(line);
  details.append(svg);
}
// Dependencias globales del HTML de GG: $, session, paused, elapsed, saveSession.
let hrLastReading=0,hrValue=null,hrConnected=false,hrSensorName='',hrLastSave=0;
function formatHeartZone(profile,bpm){
  if(profile.maxHr===null)return 'Configura tu FC máxima en ⚙ para ver zonas';
  const ratio=bpm/profile.maxHr*100;
  const percent=Math.round(ratio);
  const zone=1+profile.bounds.filter(x=>ratio>=x).length;
  return 'Zona '+zone+' · '+percent+' % de FC máxima';
}
function refreshHeart(){
  const live=hrConnected&&hrValue!==null&&Date.now()-hrLastReading<12000;
  $('hrBpm').textContent=live?String(hrValue):'--';
  $('hrZone').textContent=live?formatHeartZone(window.GGNativeHeart.getProfile(),hrValue):'Sin lectura actual del sensor';
  $('disconnectHr').classList.toggle('hidden',!hrConnected);
  $('connectHr').textContent=hrConnected?'♥ Pulsómetro conectado':'♥ Conectar pulsómetro Bluetooth';
}
function renderHeartProfileInputs(){
  const p=window.GGNativeHeart.getProfile();
  $('heartMax').value=p.maxHr??'';
  for(let i=0;i<4;i++)$('heartBound'+i).value=p.bounds[i];
}
$('hrProfileToggle').onclick=()=>{
  const panel=$('hrProfilePanel');
  const opening=panel.classList.contains('hidden');
  panel.classList.toggle('hidden',!opening);
  if(opening)renderHeartProfileInputs();
};
$('hrProfileSave').onclick=()=>{
  try{
    if(session)throw Error('Guarda la configuración antes de iniciar un entrenamiento. La sesión activa conserva sus zonas originales.');
    const maxHr=$('heartMax').value.trim();
    const bounds=[0,1,2,3].map(i=>Number($('heartBound'+i).value));
    const p=window.GGNativeHeart.saveProfile({maxHr:maxHr===''?null:Number(maxHr),bounds});
    $('hrProfileStatus').textContent='Perfil guardado'+(p.maxHr?' · FC máx '+p.maxHr+' ppm':' · sin FC máxima configurada');
    refreshHeart();
  }catch(error){$('hrProfileStatus').textContent=error.message}
};
$('connectHr').onclick=async()=>{
  const status=$('hrConnectionStatus');
  if(hrConnected)return;
  try{
    status.textContent='Buscando pulsómetro…';
    const result=await window.GGNativeHeart.connect(({bpm,deviceName,at})=>{
      hrValue=bpm;
      hrLastReading=at;
      hrConnected=true;
      hrSensorName=deviceName;
      status.textContent='Conectado: '+deviceName+' · '+bpm+' ppm';
      window.GGNativeHeart.recordReading(bpm,at,elapsed,session&&!paused&&document.visibilityState==='visible');
      if(session&&!paused&&Date.now()-hrLastSave>=15000){
        hrLastSave=Date.now();
        saveSession();
      }
      refreshHeart();
    },()=>{
      hrConnected=false;
      hrValue=null;
      status.textContent='Sensor desconectado. Puedes volver a conectar.';
      refreshHeart();
    });
    hrConnected=true;
    hrSensorName=result.name;
    status.textContent=hrValue===null?'Conectado: '+hrSensorName+' · esperando pulsaciones':'Conectado: '+hrSensorName+' · '+hrValue+' ppm';
    refreshHeart();
  }catch(error){
    hrConnected=false;
    status.textContent='Bluetooth: '+(error?.message||String(error));
    refreshHeart();
  }
};
$('disconnectHr').onclick=async()=>{
  try{
    await window.GGNativeHeart.disconnect();
    $('hrConnectionStatus').textContent='Sensor desconectado';
  }catch(error){
    $('hrConnectionStatus').textContent='Error al desconectar: '+error.message;
  }finally{
    hrConnected=false;hrValue=null;refreshHeart();
    if(session)saveSession();
  }
};
setInterval(refreshHeart,3000);
renderHeartProfileInputs();
