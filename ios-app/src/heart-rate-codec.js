// Decodificador del servicio estándar BLE Heart Rate Measurement (0x2A37).
// No depende del plugin ni del sistema operativo, por lo que se puede probar sin Mac.
export function decodeHeartRate(data){
  if(!(data instanceof DataView)||data.byteLength<2)throw new Error('Notificación de FC inválida');
  const flags=data.getUint8(0);
  const is16Bit=(flags&0x01)!==0;
  if(is16Bit&&data.byteLength<3)throw new Error('Notificación de FC incompleta');
  const bpm=is16Bit?data.getUint16(1,true):data.getUint8(1);
  if(bpm<25||bpm>240)throw new Error('Valor de FC fuera de rango');
  return bpm;
}
