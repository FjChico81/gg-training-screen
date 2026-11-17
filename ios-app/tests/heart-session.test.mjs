import test from 'node:test';
import assert from 'node:assert/strict';
import {HeartSession,heartZone,validateHeartProfile} from '../src/heart-session.js';

test('sin sensor no inventa pulsaciones',()=>{
 const s=new HeartSession();assert.equal(s.summary(90).meanBpm,null);assert.equal(s.summary(90).coveredSeconds,0);
 assert.equal(s.summary(90).zonesConfigured,false);
});
test('configuración de zonas por usuario',()=>{
 assert.equal(heartZone(119,{maxHr:200,bounds:[60,70,80,90]}),1);
 assert.equal(heartZone(120,{maxHr:200,bounds:[60,70,80,90]}),2);
 assert.equal(heartZone(140,{maxHr:200,bounds:[60,70,80,90]}),3);
 assert.equal(heartZone(160,{maxHr:200,bounds:[60,70,80,90]}),4);
 assert.equal(heartZone(180,{maxHr:200,bounds:[60,70,80,90]}),5);
 assert.equal(heartZone(120,{maxHr:null}),null);
 assert.throws(()=>validateHeartProfile({maxHr:200,bounds:[60,50,80,90]}),/ordenados/);
});
test('FC media por muestras, máxima y cobertura real',()=>{
 const s=new HeartSession({maxHr:200});
 s.add(130,1000,0);s.add(150,3000,2);s.add(170,5000,4);
 const v=s.summary(10);
 assert.equal(v.meanBpm,150);assert.equal(v.maxBpm,170);
 assert.equal(v.coveredSeconds,4);assert.deepEqual(v.zoneSeconds,[0,2,2,0,0]);assert.equal(v.coveragePct,40);
});
test('las pausas no suman tiempo por zonas',()=>{
 const s=new HeartSession({maxHr:200});
 s.add(150,1000,0);s.pause();s.add(150,61000,2);s.add(150,63000,4);
 assert.equal(s.summary(4).coveredSeconds,2);
});
test('huecos de señal superiores a diez segundos quedan sin medir',()=>{
 const s=new HeartSession({maxHr:200});
 s.add(150,1000,0);s.add(150,21000,20);
 assert.equal(s.summary(20).coveredSeconds,0);
});
test('muestras recibidas fuera de sesión se ignoran',()=>{
 const s=new HeartSession({maxHr:200});
 assert.equal(s.add(130,1000,0,false),false);
 assert.equal(s.summary(10).samples,0);
});
test('restore no enlaza la lectura antigua con la nueva',()=>{
 const s=new HeartSession({maxHr:200});
 s.add(145,1000,0);s.add(147,3000,2);
 const other=new HeartSession().restore(s.snapshot());
 other.add(150,9000,8);
 assert.equal(other.summary(9).coveredSeconds,2);
 assert.equal(other.summary(9).samples,3);
});
test('rechaza snapshots truncados y manipulados',()=>{
 const s=new HeartSession({maxHr:200});
 assert.throws(()=>s.restore({version:2}),/no reconocido/);
 assert.throws(()=>s.restore({...s.snapshot(),points:[[2,500]]}),/Muestras/);
});
test('decima puntos para limitar el tamaño sin descartar estadística',()=>{
 const s=new HeartSession({maxHr:200});
 for(let i=0;i<20;i++)s.add(130,1000+i*1000,i);
 assert.equal(s.summary(20).samples,20);
 assert.equal(s.summary(20).points.length,4);
 assert.equal(s.summary(20).coveredSeconds,19);
});
test('no cuenta intervalos negativos ni duplicados',()=>{
 const s=new HeartSession({maxHr:200});
 s.add(130,1000,3);s.add(150,1000,3);s.add(150,2000,2);
 assert.equal(s.summary(3).coveredSeconds,0);
});
