import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeHeartRate} from '../src/heart-rate-codec.js';

test('lectura BLE de 8 bits',()=>assert.equal(decodeHeartRate(new DataView(Uint8Array.from([0,78]).buffer)),78));
test('lectura BLE de 16 bits little-endian',()=>assert.equal(decodeHeartRate(new DataView(Uint8Array.from([1,201,0]).buffer)),201));
test('ignora campos BLE adicionales',()=>assert.equal(decodeHeartRate(new DataView(Uint8Array.from([0x10,154,0xff,0x01]).buffer)),154));
test('respeta el desplazamiento del DataView',()=>assert.equal(decodeHeartRate(new DataView(Uint8Array.from([99,0,133,99]).buffer,1,2)),133));
test('rechaza una lectura incompleta',()=>assert.throws(()=>decodeHeartRate(new DataView(Uint8Array.from([1,80]).buffer)),/incompleta/));
test('rechaza entradas sin DataView',()=>assert.throws(()=>decodeHeartRate(new Uint8Array([0,80])),/inválida/));
test('rechaza lecturas fisiológicamente improbables',()=>{for(const bpm of [0,24,241,255])assert.throws(()=>decodeHeartRate(new DataView(Uint8Array.from([0,bpm]).buffer)),/fuera de rango/)});
