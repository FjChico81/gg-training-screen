import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const app=resolve(import.meta.dirname,'..');
const root=resolve(app,'..');
let html=await readFile(resolve(root,'index.html'),'utf8');
const start=html.indexOf('let hrDevice=null,hrCharacteristic=null,hrLastReading=0,hrValue=null;');
const end=html.indexOf('const GG_APP_VERSION=',start);
if(start<0||end<0)throw Error('No se encuentra el bloque Bluetooth esperado en la web; revisar cambios antes de compilar.');
const nativeUI=`let hrLastReading=0,hrValue=null,hrConnected=false,hrSensorName='';
function refreshHeart(){
  const max=Number(localStorage.getItem('gg-hr-max')||199);
  const live=hrConnected&&hrValue!==null&&Date.now()-hrLastReading<12000;
  $('hrBpm').textContent=live?String(hrValue):'--';
  $('hrZone').textContent=live?'FC '+Math.round(hrValue/max*100)+'% de máxima':'Sin lectura Bluetooth';
  $('disconnectHr').classList.toggle('hidden',!hrConnected);
  $('connectHr').textContent=hrConnected?'♥ Pulsómetro conectado':'♥ Conectar pulsómetro Bluetooth';
}
$('connectHr').onclick=async()=>{
  const status=$('hrConnectionStatus');
  if(hrConnected)return;
  try{
    status.textContent='Buscando pulsómetro…';
    const result=await window.GGNativeHeart.connect(({bpm,deviceName})=>{
      hrValue=bpm;hrLastReading=Date.now();hrConnected=true;hrSensorName=deviceName;
      status.textContent='Conectado: '+deviceName+' · '+bpm+' ppm';refreshHeart();
    },()=>{
      hrConnected=false;hrValue=null;status.textContent='Sensor desconectado';refreshHeart();
    });
    hrConnected=true;hrSensorName=result.name;
    status.textContent=hrValue===null?'Conectado: '+hrSensorName+' · esperando pulsaciones':'Conectado: '+hrSensorName+' · '+hrValue+' ppm';refreshHeart();
  }catch(error){hrConnected=false;status.textContent='Bluetooth: '+(error?.message||String(error));refreshHeart()}
};
$('disconnectHr').onclick=async()=>{
  try{await window.GGNativeHeart.disconnect();$('hrConnectionStatus').textContent='Sensor desconectado'}
  catch(error){$('hrConnectionStatus').textContent='Error al desconectar: '+error.message}
  finally{hrConnected=false;hrValue=null;refreshHeart()}
};
setInterval(refreshHeart,3000);
`;
html=html.slice(0,start)+nativeUI+html.slice(end);
const bundled=await build({entryPoints:[resolve(app,'src/native-entry.js')],bundle:true,platform:'browser',format:'iife',write:false,target:'safari16',logLevel:'warning'});
const js=bundled.outputFiles[0].text;
const scriptMarker="<script>\n'use strict';";
if(!html.includes(scriptMarker))throw new Error('No se encuentra el inicio del JavaScript de GG Mobile; se cancela la compilación.');
html=html.replace(scriptMarker,`<script>${js.replaceAll('</script',"<\\/script")}</script>${scriptMarker}`);
// Una app instalada por Xcode no se actualiza automáticamente desde GitHub Pages.
html=html.replace('id="checkUpdates" class="alt"','id="checkUpdates" class="alt hidden"');
html=html.replace('BUHARDILLA FIT · v2.7','GG MOBILE iOS · prototipo BLE');
const destination=resolve(app,'www');
await mkdir(destination,{recursive:true});
await writeFile(resolve(destination,'index.html'),html,'utf8');
console.log('GG Mobile iOS generada con puente Bluetooth nativo (sin alterar la web pública).');
