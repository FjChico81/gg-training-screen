// Ejecutar después de "npx cap add ios" y de cada sincronización iOS.
// Añade permiso Bluetooth en el Info.plist generado por Capacitor.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const file=resolve(import.meta.dirname,'../ios/App/App/Info.plist');
let xml;
try{xml=await readFile(file,'utf8')}
catch{throw new Error('No existe Info.plist. Ejecuta primero "npx cap add ios".')}
const key='<key>NSBluetoothAlwaysUsageDescription</key>';
if(xml.includes(key)){
  console.log('Permiso Bluetooth iOS ya configurado.');
}else{
  const position=xml.lastIndexOf('</dict>');
  if(position<0||!xml.includes('<plist'))throw new Error('Info.plist no reconocido. No se modifica.');
  const entry='\t'+key+'\n\t<string>GG Mobile utiliza Bluetooth para conectar tu pulsómetro y mostrar las pulsaciones durante el entrenamiento.</string>\n';
  xml=xml.slice(0,position)+entry+xml.slice(position);
  await writeFile(file,xml,'utf8');
  console.log('Permiso Bluetooth iOS añadido a Info.plist.');
}
