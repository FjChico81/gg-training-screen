import {decodeHeartRate} from './heart-rate-codec.js';
// Puente Bluetooth nativo, incorporado únicamente en la compilación iOS.
// Se incorporará al bundle de la app iOS, nunca a la versión pública sin validar.
import {BleClient} from '@capacitor-community/bluetooth-le';
const HR_SERVICE='0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT='00002a37-0000-1000-8000-00805f9b34fb';
let connectedId=null;
export async function connectHeartRate(onReading,onDisconnected=()=>{}){
  if(typeof onReading!=='function')throw Error('Falta callback de pulsaciones');
  await BleClient.initialize();
  const device=await BleClient.requestDevice({services:[HR_SERVICE]});
  await BleClient.connect(device.deviceId,()=>{connectedId=null;onDisconnected()});
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
