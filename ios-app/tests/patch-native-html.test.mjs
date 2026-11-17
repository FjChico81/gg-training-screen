import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {patchNativeHtml} from '../src/patch-native-html.js';

const base=resolve(import.meta.dirname,'../..');
const web=await readFile(resolve(base,'index.html'),'utf8');
const ui=await readFile(resolve(base,'ios-app/src/native-ui-fragment.js'),'utf8');

test('genera interfaz nativa sin editar el HTML público',()=>{
  const copy=web;
  const result=patchNativeHtml(web,ui,'window.GGNativeHeart={};');
  assert.equal(web,copy);
  assert.match(result,/GG MOBILE iOS · prototipo Bluetooth/);
  assert.match(result,/id="heartMax"/);
  assert.match(result,/hrRecording:window.GGNativeHeart.exportRecording\(\)/);
  assert.match(result,/heartRate:window.GGNativeHeart.summary\(elapsed\)/);
  assert.doesNotMatch(result,/navigator\.bluetooth\?\.requestDevice/);
  assert.doesNotMatch(result,/const GG_APP_VERSION=/);
});

test('el HTML generado conserva dos scripts con sintaxis válida',()=>{
  const result=patchNativeHtml(web,ui,'window.GGNativeHeart={};');
  const scripts=[...result.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.equal(scripts.length,2);
  for(const script of scripts)assert.doesNotThrow(()=>new Function(script));
});

test('falla si desaparecen los marcadores esperados',()=>{
  assert.throws(()=>patchNativeHtml(web.replace('let hrDevice=null,hrCharacteristic=null,hrLastReading=0,hrValue=null;',''),ui,''),/Bluetooth web original/);
});

test('no modifica el código web de actualización en origen',()=>{
  assert.match(web,/const GG_APP_VERSION='2.7'/);
  assert.doesNotMatch(patchNativeHtml(web,ui,''),/const GG_APP_VERSION='2.7'/);
});
