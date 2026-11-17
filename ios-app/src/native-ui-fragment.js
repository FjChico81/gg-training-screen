// Solo se inserta dentro de la compilación nativa. No debe cargarse en Safari.
// Dependencias globales del HTML de GG: $, session, paused, elapsed, saveSession.
let hrLastReading=0,hrValue=null,hrConnected=false,hrSensorName='',hrLastSave=0;
function formatHeartZone(profile,bpm){
  if(profile.maxHr===null)return 'Configura tu FC máxima en ⚙ para ver zonas';
  const percent=Math.round(bpm/profile.maxHr*100);
  const zone=1+profile.bounds.filter(x=>percent>=x).length;
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
