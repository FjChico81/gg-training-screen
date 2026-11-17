import {connectHeartRate,disconnectHeartRate} from './heart-rate-bridge.js';
let connected=false;
let name='';
let onDisconnected=()=>{};
window.GGNativeHeart={
  get connected(){return connected},
  get name(){return name},
  async connect(onReading,onLost){
    if(connected)return {name};
    onDisconnected=typeof onLost==='function'?onLost:()=>{};
    const device=await connectHeartRate(reading=>{
      connected=true;
      onReading(reading);
    },()=>{
      connected=false;
      name='';
      onDisconnected();
    });
    connected=true;
    name=device.name;
    return device;
  },
  async disconnect(){
    try{await disconnectHeartRate()}finally{connected=false;name=''}
  }
};
