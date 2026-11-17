// Preparación para integración nativa; NO está conectada todavía al index.html.
// Se incorporará al bundle de la app iOS, nunca a la versión pública sin validar.
import {BleClient} from '@capacitor-community/bluetooth-le';
const HR_SERVICE='0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT='00002a37-0000-1000-8000-00805f9b34fb';
let connectedId=null;
export function decodeHeartRate(data){
  if(!(data instanceof DataView)||data.byteLength<2)throw Error('Notificación de FC inválida');
  const wide=!!(data.getUint8(0)&1);
  if(wide&&data.byteLength<3)throw Error('Notificación de FC incompleta');
  const bpm=wide?data.getUint16(1,true):data.getUint8(1);
  if(bpm<25||bpm>240)throw Error('Valor de FC fuera de rango');
  return bpm;
}
export async function connectHeartRate(onReading){
  if(typeof onReading!=='function')throw Error('Falta callback de pulsaciones');
  await BleClient.initialize();
  const device=await BleClient.requestDevice({services:[HR_SERVICE]});
  await BleClient.connect(device.deviceId,()=>{connectedId=null});
  try{
    await BleClient.startNotifications(device.deviceId,HR_SERVICE,HR_MEASUREMENT,(data)=>{
      try{onReading({bpm:decodeHeartRate(data),at:Date.now(),deviceName:device.name||'Pulsómetro'});}catch(error){console.warn('Lectura FC descartada',error);}
    });
    connectedId=device.deviceId;
    return {deviceId:device.deviceId,name:device.name||'Pulsómetro'};
  }catch(error){await BleClient.disconnect(device.deviceId).catch(()=>{});throw error;}
}
export async function disconnectHeartRate(){
  if(!connectedId)return;
  const id=connectedId;connectedId=null;
  await BleClient.stopNotifications(id,HR_SERVICE,HR_MEASUREMENT).catch(()=>{});
  await BleClient.disconnect(id).catch(()=>{});
}
