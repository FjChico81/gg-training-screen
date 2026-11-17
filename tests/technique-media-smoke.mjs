import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(e.message));
vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(html,{url:'https://gg.example.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.indexedDB=indexedDB;
 w.URL.createObjectURL=()=> 'blob:https://gg.example.test/mock';
 w.URL.revokeObjectURL=()=>{};
 w.alert=()=>{};w.confirm=()=>true;
 w.localStorage.setItem('gg-training-screen-workouts-v1',JSON.stringify([{id:'routine',name:'Torso',blocks:[{name:'Fuerza',items:['Dominadas neutras | 2x8 | RIR 3 | descanso 5s','Remo unilateral con mancuerna | 1x10 | 25kg | RIR 3 | descanso 5s']}]}]));
}});
const w=dom.window,d=w.document,id=n=>d.getElementById(n);
assert.equal(d.title,'GG Mobile v2.8.1');
assert.deepEqual(errors,[]);
assert.equal(w.eval("techniqueKey('Dominadas neutras')"),'dominada-neutra');
assert.equal(w.eval("techniqueKey('Dominada con agarre neutro cerrado')"),'dominada-neutra');
assert.equal(w.eval("techniqueKey('Remo unilateral en polea')"),'ejercicio-remo unilateral en polea');
assert.equal(w.eval("techniqueKey('Curl alterno con mancuernas de pie')"),'curl-alterno-mancuernas');
assert.equal(w.eval("techniqueKey('Tríceps cuerda')"),'triceps-polea-cuerda');
w.eval("active='routine';show('board')");
id('start').click();
assert.equal(id('techniqueOverlay').classList.contains('hidden'),true);
id('techniqueToggle').click();
assert.equal(id('techniqueOverlay').classList.contains('hidden'),false);
assert.match(id('techniqueTitle').textContent,/Dominadas neutras/);
await new Promise(resolve=>setTimeout(resolve,40));
assert.match(id('techniqueMedia').textContent,/No hay archivo/);
assert.deepEqual(errors,[]);
await w.eval("techniqueWrite({key:'dominada-neutra',name:'dominadas.gif',type:'image/gif',blob:new Blob(['GIF89a'],{type:'image/gif'}),lastModified:Date.now()})");
await w.eval("techniqueRender()");
assert.equal(id('techniqueMedia').querySelector('img')?.getAttribute('src'),'blob:https://gg.example.test/mock');
assert.match(id('techniqueInfo').textContent,/dominadas.gif/);
id('techniqueClose').click();
assert.equal(id('techniqueOverlay').classList.contains('hidden'),true);
assert.equal(id('techniqueMedia').children.length,0);
id('techniqueToggle').click();
await new Promise(resolve=>setTimeout(resolve,40));
assert.ok(id('techniqueMedia').querySelector('img'));
assert.equal(w.eval('step'),0);
// Importa el paquete en bloque con dos GIFs sin tocar Drive.
const sample='GIF89a'+'xxxxxxxxxxxx';
const encoded=Buffer.from(sample,'ascii').toString('base64');
w.__techniqueTestFile={
 size:800,text:async()=>JSON.stringify({format:'GG-Technique-Pack',version:1,items:[
  {key:'dominada-neutra',name:'dominadas-prueba.gif',type:'image/gif',size:sample.length,base64:encoded},
  {key:'remo-unilateral-mancuerna',name:'remo-prueba.gif',type:'image/gif',size:sample.length,base64:encoded}
 ]})
};
assert.equal(await w.eval('techniqueImportPack(window.__techniqueTestFile)'),2);
const imported=await w.eval("techniqueRead('remo-unilateral-mancuerna')");
assert.equal(imported.name,'remo-prueba.gif');
await w.eval("techniqueRender()");
assert.match(id('techniqueInfo').textContent,/dominadas-prueba.gif/);
w.__techniqueBadFile={
 size:200,text:async()=>JSON.stringify({format:'GG-Technique-Pack',version:1,items:[{key:'x',name:'falso.gif',type:'image/gif',size:4,base64:encoded}]})
};
await assert.rejects(w.eval('techniqueImportPack(window.__techniqueBadFile)'),/Tamaño/);
assert.equal((await w.eval("techniqueRead('x')")),null);

assert.deepEqual(errors,[]);
await w.eval("techniqueDelete('dominada-neutra')");
await w.eval('techniqueRender()');
assert.match(id('techniqueMedia').textContent,/No hay archivo/);
id('techniqueClose').click();
await new Promise(resolve=>setTimeout(resolve,120));
assert.deepEqual(errors,[]);
console.log('PASS: GIF local, alias, vista técnica, borrado y entrenamiento intacto');
w.close();
