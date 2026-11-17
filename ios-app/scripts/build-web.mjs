import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {patchNativeHtml} from '../src/patch-native-html.js';

const app=resolve(import.meta.dirname,'..');
const root=resolve(app,'..');
const source=await readFile(resolve(root,'index.html'),'utf8');
const nativeUI=await readFile(resolve(app,'src/native-ui-fragment.js'),'utf8');
const bundled=await build({
  entryPoints:[resolve(app,'src/native-entry.js')],
  bundle:true,platform:'browser',format:'iife',write:false,target:'safari16',logLevel:'warning'
});
const html=patchNativeHtml(source,nativeUI,bundled.outputFiles[0].text);

// Fallar antes de publicar un HTML que no se pueda ejecutar.
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
if(scripts.length!==2)throw Error('Se esperaban dos scripts (puente nativo y aplicación).');
for(const script of scripts)new Function(script);
if(!html.includes('GG MOBILE iOS · prototipo Bluetooth'))throw Error('Marcador de aplicación iOS ausente');
const destination=resolve(app,'www');
await mkdir(destination,{recursive:true});
await writeFile(resolve(destination,'index.html'),html,'utf8');
console.log('GG Mobile iOS generada con Bluetooth, perfil de FC y registro local. Web pública intacta.');
