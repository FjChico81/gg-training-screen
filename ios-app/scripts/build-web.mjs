import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const source=await readFile(resolve(root,'index.html'),'utf8');
const destination=resolve(import.meta.dirname,'../www');
await mkdir(destination,{recursive:true});
await writeFile(resolve(destination,'index.html'),source,'utf8');
console.log('GG Mobile web copiada para compilación iOS.');
