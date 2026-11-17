import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const messages=[],v=new VirtualConsole();
v.on('jsdomError',e=>messages.push(e.message));v.on('error',e=>messages.push(e));
const exerciseLabels=[
'Dominadas neutras · peso corporal · objetivo 10–12 rep | 3x10 | 0kg | RIR 3 | descanso 120s',
'Remo unilateral mancuerna · 10 por lado | 2x10 | 25kg | RIR 3 | descanso 90s',
'Elevaciones laterales · objetivo 12–15 rep | 2x12 | 6kg | RIR 3 | descanso 75s',
'Curl alterno con mancuernas · 10 por brazo | 2x10 | 12.5kg | RIR 3 | descanso 90s',
'Tríceps con cuerda · peso polea | 2x12 | 18.75kg | RIR 3 | descanso 75s',
'Sentadilla libre | 1x5 | 0kg | RIR 3 | descanso 60s'
];
const dom=new JSDOM(html,{url:'https://gg.example/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:v,beforeParse(w){w.localStorage.setItem('gg-training-screen-workouts-v1',JSON.stringify([{id:'test',name:'Prueba GIF',blocks:[{name:'Fuerza',items:exerciseLabels}]}]));w.alert=()=>{};w.confirm=()=>true;}});
const w=dom.window,d=w.document,e=id=>d.getElementById(id);
assert.equal(d.title,'GG Mobile v2.8.0');
w.eval("active='test';show('board')");e('start').click();
const expected=[
 '1lpeEbNGeo1FVM6Bi4yte58rrF9TpU6vV',
 '1EbAsXMy4EF-v68RIncw0jqp0ftmai_7S',
 '1p6SvuL6axhvExSxEVWCA3dPrfP2LdgZt',
 '1cypJiuJknLTQVB898EG2n8R6jF71wIUU',
 '1Uok__M0YB8yEUxmOeW389rQbLjBpIYhr'
];
for(let i=0;i<5;i++){
 w.eval('step='+i+';renderGuided()');
 assert.equal(e('techniqueButton').classList.contains('hidden'),false,'Debe existir GIF para ejercicio '+i);
 e('techniqueButton').click();
 assert.equal(e('techniqueOverlay').classList.contains('hidden'),false);
 assert.match(e('techniqueFrame').src,new RegExp(expected[i]+'/preview$'),'URL exacta de Drive');
 assert.match(e('techniqueLink').href,new RegExp(expected[i]+'/view$'),'Enlace alternativo');
 e('closeTechnique').click();
 assert.equal(e('techniqueOverlay').classList.contains('hidden'),true);
 assert.equal(e('techniqueFrame').getAttribute('src'),'about:blank');
}
w.eval('step=5;renderGuided()');
assert.equal(e('techniqueButton').classList.contains('hidden'),true,'Ejercicio sin GIF no debe mostrar botón');
w.eval('step=0;renderGuided()');e('techniqueButton').click();
w.eval("show('library')");
assert.equal(e('techniqueOverlay').classList.contains('hidden'),true,'Navegar cierra visor');
assert.equal(messages.length,0,messages.join(' / '));
await new Promise(resolve=>setTimeout(resolve,120));
assert.equal(messages.length,0,messages.join(' / '));
console.log('PASS: 5 GIFs catalogados, previsualización opcional, cierre y ejercicios sin GIF');
w.close();
