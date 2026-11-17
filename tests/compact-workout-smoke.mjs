import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const virtualConsole=new VirtualConsole();
const errors=[];
virtualConsole.on('jsdomError',e=>errors.push(String(e.message)));
virtualConsole.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(html,{
 url:'https://gg.example.test/',
 runScripts:'dangerously',
 pretendToBeVisual:true,
 virtualConsole,
 beforeParse(win){
  win.localStorage.setItem('gg-training-screen-workouts-v1',JSON.stringify([{id:'routine',name:'Prueba fuerza',blocks:[{name:'Fuerza',items:['Press banca | 2x8 | 50kg | RIR 3 | descanso 5s']}]}]));
  win.alert=()=>{};
  win.confirm=()=>true;
 }
});
const {window:w}=dom,doc=w.document;
assert.equal(errors.length,0,'JS no debe fallar al inicializar: '+errors.join(', '));
assert.equal(doc.querySelector('title').textContent,'GG Mobile v2.7.1');
assert.equal(doc.getElementById('strengthPanel').parentElement.id,'guided','el registro debe estar a la vista');
assert.ok(doc.getElementById('restCard').classList.contains('hidden'));
w.eval("active='routine';show('board')");
doc.getElementById('start').click();
assert.equal(errors.length,0,'JS no debe fallar al iniciar: '+errors.join(', '));
assert.equal(doc.getElementById('strengthPanel').classList.contains('hidden'),false);
assert.match(doc.getElementById('seriesProgress').textContent,/SERIE 1 DE 2/);
doc.getElementById('logSet').click();
assert.equal(errors.length,0,'JS no debe fallar al completar serie: '+errors.join(', '));
assert.equal(doc.getElementById('restCard').classList.contains('hidden'),false,'descanso visible');
assert.match(doc.getElementById('restCountdown').textContent,/00:05/,'descanso programado automático');
assert.equal(doc.getElementById('logSet').disabled,true,'no se registra serie durante el descanso');
assert.match(doc.getElementById('seriesProgress').textContent,/SERIE 2 DE 2/);
w.eval('restRemaining=0.1;clockAnchor=Date.now()-1000;tick()');
assert.equal(errors.length,0,'JS no debe fallar al concluir descanso: '+errors.join(', '));
assert.equal(doc.getElementById('restCountdown').textContent,'LISTO','estado de descanso listo');
assert.equal(doc.getElementById('logSet').disabled,false);
doc.getElementById('logSet').click();
assert.match(doc.getElementById('seriesProgress').textContent,/2\/2 series completadas/);
assert.equal(doc.getElementById('quickAdvance').disabled,false);
assert.equal(doc.getElementById('restCard').classList.contains('hidden'),true);
doc.getElementById('moreSession').click();
assert.equal(doc.getElementById('sessionExtras').classList.contains('hidden'),false);
assert.ok(doc.getElementById('strengthExtras').contains(doc.getElementById('seriesList')));
assert.equal(errors.length,0,'Sin errores inesperados: '+errors.join(', '));
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(errors.length,0,'Errores asíncronos inesperados: '+errors.join(', '));
console.log('PASS: vista compacta, series, descanso automático, señalización y correcciones');
w.close();
