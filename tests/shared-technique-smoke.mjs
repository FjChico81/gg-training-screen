import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const library=readFileSync(new URL('../src/exercise-library.js',import.meta.url));
const files={
 'dominada-neutra.gif':1948363,
 'remo-unilateral-mancuerna.gif':341642,
 'elevacion-lateral-mancuernas.gif':256173,
 'curl-alterno-mancuernas.gif':214057,
 'triceps-polea-cuerda.gif':275191
};
for(const [file,bytes] of Object.entries(files)){
 const data=readFileSync(new URL('../assets/technique/'+file,import.meta.url));
 assert.equal(data.length,bytes,'tamaño íntegro '+file);
 assert.match(data.subarray(0,6).toString('ascii'),/^GIF8[79]a$/,'GIF válido '+file);
}
const resources=new ResourceLoader();
resources.fetch=url=>new URL(url).pathname==='/gg-training-screen/src/exercise-library.js'
 ? Promise.resolve(library)
 : null;

const editions=[
 {name:'GG',query:'',storagePrefix:'',title:()=> 'GG / BUHARDILLA FIT'},
 {name:'HF',query:'?app=hf',storagePrefix:'hf:personal:',title:version=> 'HF v'+version}
];

for(const edition of editions){
 const errors=[],virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',e=>errors.push(e.message));
 virtualConsole.on('error',e=>errors.push(String(e)));
 const dom=new JSDOM(html,{
  url:'https://example.test/gg-training-screen/index.html'+edition.query,
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,resources,
  beforeParse(w){
   w.indexedDB=new IDBFactory();
   w.URL.createObjectURL=()=> 'blob:https://example.test/override';
   w.URL.revokeObjectURL=()=>{};
   w.alert=()=>{};w.confirm=()=>true;
   w.localStorage.setItem(edition.storagePrefix+'gg-training-screen-workouts-v1',JSON.stringify([{id:'routine',name:'Torso',blocks:[{name:'Fuerza',items:[
    'Dominadas neutras | 2x10 | RIR 3 | descanso 4s',
    'Remo unilateral con mancuerna | 1x10 | 25kg | RIR 3 | descanso 5s',
    'Elevaciones laterales | 1x12 | 6kg | RIR 3 | descanso 5s',
    'Curl alterno con mancuernas | 1x10 | 12.5kg | RIR 3 | descanso 5s',
    'Tríceps con cuerda | 1x12 | 18.75kg | RIR 3 | descanso 5s'
   ]}]}]));
  }
 });
 const w=dom.window,d=w.document,id=name=>d.getElementById(name);
 try{
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const versionLabel=id('appVersion').textContent;
  assert.match(versionLabel,/^Versión \d+\.\d+\.\d+$/);
  assert.equal(d.title,edition.title(versionLabel.slice('Versión '.length)));
  assert.deepEqual(errors,[]);
  assert.equal(id('techniqueMedia').querySelector('img'),null,'no descarga GIF antes de pulsar Ver técnica');
  assert.equal(id('techniqueImport'),null,'no pide importar paquete');
  w.eval("active='routine';show('board')");
  id('start').click();
  const pairs=[
   ['Dominadas neutras','dominada-neutra.gif'],
   ['Remo unilateral con mancuerna','remo-unilateral-mancuerna.gif'],
   ['Elevaciones laterales','elevacion-lateral-mancuernas.gif'],
   ['Curl alterno con mancuernas','curl-alterno-mancuernas.gif'],
   ['Tríceps con cuerda','triceps-polea-cuerda.gif']
  ];
  for(let step=0;step<pairs.length;step++){
   w.eval('step='+step+';renderGuided()');
   id('techniqueToggle').click();
   await sleep(25);
   const src=id('techniqueMedia').querySelector('img')?.src||'';
   assert.ok(src.endsWith('/gg-training-screen/assets/technique/'+pairs[step][1]),'asset compartido del paso '+step+': '+src);
   assert.match(id('techniqueInfo').textContent,/disponible para todos/);
   id('techniqueClose').click();
   assert.equal(id('techniqueMedia').querySelector('img'),null,'GIF eliminado del DOM al cerrar');
  }
  w.eval("step=0;renderGuided()");
  id('techniqueToggle').click();
  await sleep(30);
  await w.eval("techniqueWrite({key:'dominada-neutra',name:'personal.gif',type:'image/gif',blob:new Blob(['GIF89a'],{type:'image/gif'})})");
  await w.eval('techniqueRender()');
  assert.equal(id('techniqueMedia').querySelector('img')?.src,'blob:https://example.test/override');
  assert.match(id('techniqueInfo').textContent,/Copia personal/);
  id('techniqueRemove').click();
  await sleep(50);
  assert.ok(id('techniqueMedia').querySelector('img')?.src.endsWith('/assets/technique/dominada-neutra.gif'),'vuelve al GIF compartido al quitar personalización');
  id('techniqueClose').click();
  await sleep(90);
  assert.deepEqual(errors,[],'Sin errores asíncronos');
  console.log(`${edition.name}: título, 5 GIFs compartidos bajo demanda y recuperación del GIF compartido tras eliminar la copia personal`);
 }finally{
  w.close();
 }
}
