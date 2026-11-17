import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(e.message));
vc.on('error',e=>errors.push(String(e)));
const workout=[
 'Bicicleta suave @240',
 'Movilidad hombros',
 'Dominadas cómodas · 3 repeticiones (aproximación)',
 '8 remos/lado con 12,5 kg (aproximación)',
 'Elevaciones laterales con 3 kg/mano (aproximación)',
 'Dominadas neutras | 3x10 | RIR 3 | descanso 120s',
 'Remo unilateral con mancuerna | 2x10 | 25kg | RIR 3 | descanso 90s',
 'Elevaciones laterales | 2x12 | 6kg | RIR 3 | descanso 75s',
 'Curl alterno con mancuernas | 2x10 | 12.5kg | RIR 3 | descanso 90s',
 'Tríceps con cuerda | 2x12 | 18.75kg | RIR 3 | descanso 75s'
];
const dom=new JSDOM(html,{url:'https://gg.example.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.localStorage.setItem('gg-training-screen-workouts-v1',JSON.stringify([{id:'torso',name:'Fuerza torso',blocks:[{name:'Calentamiento',items:workout.slice(0,5)},{name:'Fuerza',items:workout.slice(5)}]}]));
 w.alert=()=>{};w.confirm=()=>true;
}});
const w=dom.window,d=w.document,id=name=>d.getElementById(name);
const ev=code=>w.eval(code);
assert.equal(d.title,'GG Mobile v2.9.1');
assert.deepEqual(errors,[]);

ev("active='torso';show('board')");
assert.equal(ev("techniqueKey('Dominadas cómodas · 3 repeticiones (aproximación)')"),'dominada-neutra');
assert.equal(ev("techniqueKey('8 remos/lado con 12,5 kg (aproximación)')"),'remo-unilateral-mancuerna');
assert.equal(ev("techniqueKey('Elevaciones laterales con 3 kg/mano')"),'elevacion-lateral-mancuernas');
assert.equal(ev("techniqueKey('Dominadas neutras')"),'dominada-neutra');
assert.equal(ev("techniqueKey('Curl alterno con mancuernas')"),'curl-alterno-mancuernas');
assert.equal(ev("techniqueKey('Tríceps con cuerda')"),'triceps-polea-cuerda');
assert.notEqual(ev("techniqueKey('Dominadas supinas')"),'dominada-neutra');
assert.notEqual(ev("techniqueKey('Remo unilateral en polea')"),'remo-unilateral-mancuerna');
id('start').click();
ev('step=2;renderGuided()');
id('techniqueToggle').click();
await new Promise(resolve=>setTimeout(resolve,70));
assert.equal(id('techniqueOverlay').classList.contains('hidden'),false);
assert.equal(id('techniqueMedia').querySelector('img')?.getAttribute('src'),'https://gg.example.test/assets/technique/dominada-neutra.gif');
assert.match(id('techniqueInfo').textContent,/El calentamiento no especifica el agarre/);
id('techniqueClose').click();
ev('step=3;renderGuided()');
id('techniqueToggle').click();
await new Promise(resolve=>setTimeout(resolve,70));
assert.equal(id('techniqueMedia').querySelector('img')?.getAttribute('src'),'https://gg.example.test/assets/technique/remo-unilateral-mancuerna.gif');
assert.match(id('techniqueInfo').textContent,/ejercicio principal/);
id('techniqueClose').click();

ev("workouts.push({id:'solo-pronas',name:'Pronas',blocks:[{name:'Calentamiento',items:['Dominadas cómodas · 3 repeticiones']},{name:'Fuerza',items:['Dominadas pronas | 2x8 | RIR 3 | descanso 120s']} ]});active='solo-pronas'");
assert.notEqual(ev("techniqueKey('Dominadas cómodas · 3 repeticiones')"),'dominada-neutra','sin dominadas neutras no asignar agarre neutro');
assert.deepEqual(errors,[]);
await new Promise(resolve=>setTimeout(resolve,70));
console.log('PASS: cinco ejercicios, dos calentamientos, cautela de agarre, exclusión de variantes y GIF compartido');
w.close();
