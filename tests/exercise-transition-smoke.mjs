import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const errors=[],v=new VirtualConsole();
v.on('jsdomError',e=>errors.push(String(e.message)));
v.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(html,{
 url:'https://gg.example.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:v,
 beforeParse(w){
   w.localStorage.setItem('gg-training-screen-workouts-v1',JSON.stringify([{
     id:'routine',name:'Prueba dos ejercicios',
     blocks:[{name:'Fuerza',items:[
       'Press banca | 2x8 | 50kg | RIR 3 | descanso 5s',
       'Remo con mancuerna | 1x10 | 25kg | RIR 3 | descanso 4s',
       '8 flexiones'
     ]}]
   }]));
   w.alert=msg=>errors.push('ALERT: '+msg);w.confirm=()=>true;
 }
});
const w=dom.window,d=w.document,id=name=>d.getElementById(name);
const evalCode=code=>w.eval(code);
const assertNoErrors=()=>assert.deepEqual(errors,[],'Sin errores JavaScript inesperados');

assert.equal(d.title,'GG Mobile v2.7.2');
assertNoErrors();
evalCode("active='routine';show('board')");
id('start').click();
assert.match(id('seriesProgress').textContent,/SERIE 1 DE 2/);
assert.equal(id('betweenExerciseRest').value,'90');
assert.equal(id('strengthPanel').classList.contains('hidden'),false);

// Serie 1: descanso normal entre series (5 s).
id('logSet').click();
assert.match(id('restLabel').textContent,/ENTRE SERIES/);
assert.equal(id('restCountdown').textContent,'00:05');
assert.equal(id('logSet').disabled,true);
id('skipRest').click();
assert.equal(id('restCountdown').textContent,'LISTO');
assert.equal(id('logSet').disabled,false);

// Serie 2: descanso diferente antes del próximo ejercicio (90 s).
id('logSet').click();
assert.match(id('restLabel').textContent,/ENTRE EJERCICIOS/);
assert.equal(id('restCountdown').textContent,'01:30');
assert.match(id('restNext').textContent,/Remo/);
assert.equal(id('strengthPanel').classList.contains('hidden'),true);
assert.equal(id('quickAdvance').disabled,true);
assert.equal(evalCode('transitionTo'),1);
assert.equal(JSON.parse(w.localStorage.getItem('gg-active-session-v1')).transitionTo,1);

// Una pausa detiene el contador; al reanudar avanza solo tras la cuenta atrás.
id('pause').click();
assert.match(id('restLabel').textContent,/PAUSADO/);
const before=evalCode('restRemaining');
evalCode('clockAnchor=Date.now()-2000;tick()');
assert.equal(evalCode('restRemaining'),before);
id('pause').click();
evalCode('restRemaining=0.1;clockAnchor=Date.now()-1000;tick()');
assert.equal(evalCode('step'),1,'avance automático al nuevo ejercicio');
assert.equal(evalCode('transitionTo'),null);
assert.equal(id('strengthPanel').classList.contains('hidden'),false);
assert.equal(id('restCard').classList.contains('hidden'),true);
assert.equal(id('quickAdvance').disabled,true);

// El segundo ejercicio termina sin iniciar un descanso entre ejercicios
// cuando la actividad posterior no es un ejercicio de fuerza.
id('logSet').click();
assert.equal(evalCode('transitionTo'),null);
assert.equal(id('quickAdvance').disabled,false);
id('quickAdvance').click();
assert.equal(evalCode('step'),2);
assert.equal(id('restCard').classList.contains('hidden'),true);

// Restablecer rutina, configurar tiempo y comprobar botón de salto.
id('showBoard').click();
id('start').click();
id('betweenExerciseRest').value='7';
id('betweenExerciseRest').dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(w.localStorage.getItem('gg-between-exercise-rest-v1'),'7');
id('logSet').click();id('skipRest').click();id('logSet').click();
assert.equal(id('restCountdown').textContent,'00:07');
id('skipRest').click();
assert.equal(evalCode('step'),1);
assert.equal(evalCode('transitionTo'),null);
assert.equal(id('restCard').classList.contains('hidden'),true);

// Al reabrir una sesión con descanso, conserva el destino pendiente.
id('showBoard').click();id('start').click();id('logSet').click();id('skipRest').click();id('logSet').click();
const saved=JSON.parse(w.localStorage.getItem('gg-active-session-v1'));
assert.equal(saved.transitionTo,1);
assert.equal(saved.restRemaining,7);
assert.equal(saved.restRunning,true);
assertNoErrors();
await new Promise(resolve=>setTimeout(resolve,120));
assertNoErrors();
console.log('PASS: descansos de series y ejercicios, cronómetro, pausa, salto, persistencia y fin de bloque');
w.close();
