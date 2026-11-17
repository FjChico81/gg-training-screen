// Transformación reproducible y fail-closed: solo modifica HTML generado para iOS.
function one(source,needle,replacement){
  const i=source.indexOf(needle);
  if(i<0||source.indexOf(needle,i+needle.length)>=0)throw Error('Plantilla web incompatible o ambigua: '+needle.slice(0,85));
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
export function patchNativeHtml(source,uiFragment,bundledJs){
  let html=source;
  const nativeStart='let hrDevice=null,hrCharacteristic=null,hrLastReading=0,hrValue=null;';
  const nativeEnd='const GG_APP_VERSION=';
  const start=html.indexOf(nativeStart),end=html.indexOf(nativeEnd,start);
  if(start<0||end<0)throw Error('No se encuentra el Bluetooth web original');
  html=html.slice(0,start)+uiFragment+'\n'+html.slice(end);
  const status='<span id="hrConnectionStatus" class="muted small" style="grid-column:1/-1" aria-live="polite">Sensor no conectado</span>';
  const profileUI=`<button id="hrProfileToggle" class="alt" type="button" style="grid-column:1/-1">⚙ Configurar FC máxima y zonas</button>
<div id="hrProfilePanel" class="hidden" style="grid-column:1/-1">
  <label>Tu FC máxima (ppm)<input id="heartMax" type="number" inputmode="numeric" min="80" max="240" placeholder="Indica tu FC máxima"></label>
  <p class="small muted">Zonas por porcentaje de FC máxima. Los límites son orientativos y modificables.</p>
  <div class="setgrid">
    <label>Inicio Z2 (%)<input id="heartBound0" type="number" min="40" max="99"></label>
    <label>Inicio Z3 (%)<input id="heartBound1" type="number" min="40" max="99"></label>
    <label>Inicio Z4 (%)<input id="heartBound2" type="number" min="40" max="99"></label>
    <label>Inicio Z5 (%)<input id="heartBound3" type="number" min="40" max="99"></label>
  </div>
  <button id="hrProfileSave" class="alt" type="button">Guardar perfil cardíaco</button>
  <p id="hrProfileStatus" class="small muted" aria-live="polite"></p>
</div>`;
  html=one(html,status,status+'\n'+profileUI);
  html=one(html,'<div id="summaryDuration" class="metric"></div>','<div id="summaryDuration" class="metric"></div><p id="nativeHrSummary" class="gold small"></p>');
  html=one(html,"const details=node('div','','history-detail hidden');","const details=node('div','','history-detail hidden');renderHistoricalHeart(r,card,details);");
  html=one(html,'ftElapsed,ftResults,actualResults}))','ftElapsed,ftResults,actualResults,hrRecording:window.GGNativeHeart.exportRecording()}))');
  html=one(html,'actualResults:JSON.parse(JSON.stringify(actualResults))});','actualResults:JSON.parse(JSON.stringify(actualResults)),heartRate:window.GGNativeHeart.summary(elapsed)});');
  html=one(html,"$('start').onclick=()=>{step=0;","$('start').onclick=()=>{window.GGNativeHeart.resetRecording();step=0;");
  html=one(html,"$('pause').onclick=()=>{paused=!paused;clockAnchor","$('pause').onclick=()=>{paused=!paused;if(paused)window.GGNativeHeart.pauseRecording();clockAnchor");
  html=one(html,"actualResults=saved.actualResults||{};session=true","actualResults=saved.actualResults||{};session=true;if(saved.hrRecording){try{window.GGNativeHeart.restoreRecording(saved.hrRecording)}catch(err){console.warn('FC previa no recuperada',err)}}");
  html=one(html,"$('summaryDuration').textContent=formatSeconds(Math.floor(elapsed));","$('summaryDuration').textContent=formatSeconds(Math.floor(elapsed));$('nativeHrSummary').textContent=formatHeartSummary(window.GGNativeHeart.summary(elapsed));");
  html=one(html,"document.addEventListener('visibilitychange',()=>{clockAnchor=Date.now();saveSession();","document.addEventListener('visibilitychange',()=>{clockAnchor=Date.now();if(document.visibilityState!=='visible')window.GGNativeHeart.pauseRecording();saveSession();");
  // Una compilación instalada por Xcode no tiene actualizaciones automáticas de Pages.
  const updateStart=html.indexOf("const GG_APP_VERSION='2.7';");
  const loadStart=html.indexOf('load();try{const saved=',updateStart);
  if(updateStart<0||loadStart<0)throw Error('No se encuentra el verificador de actualizaciones web');
  html=html.slice(0,updateStart)+html.slice(loadStart);
  html=one(html,"show('library');void checkForUpdates();","show('library');");
  html=one(html,'id="checkUpdates" class="alt"','id="checkUpdates" class="alt hidden"');
  html=one(html,'BUHARDILLA FIT · v2.7','GG MOBILE iOS · prototipo Bluetooth');
  const scriptMarker="<script>\n'use strict';";
  if(!html.includes(scriptMarker))throw Error('No se ha encontrado el script principal');
  // Se inserta delante del script principal para inicializar el puente de Capacitor.
  const safelyEmbedded=bundledJs.replaceAll('</script','<\\/script');
  html=one(html,scriptMarker,'<script>'+safelyEmbedded+'</script>'+scriptMarker);
  return html;
}
