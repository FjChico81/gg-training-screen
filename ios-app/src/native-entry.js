// Interfaz única entre la app web embebida, Core Bluetooth y el registro local.
import {connectHeartRate,disconnectHeartRate} from './heart-rate-bridge.js';
import {HeartSession,validateHeartProfile} from './heart-session.js';

const PROFILE_KEY='gg-ios-heart-profile-v1';
const DEFAULT_PROFILE={maxHr:null,bounds:[60,70,80,90]};
let profile=DEFAULT_PROFILE;
try{profile=validateHeartProfile(JSON.parse(localStorage.getItem(PROFILE_KEY))||DEFAULT_PROFILE)}catch{profile=DEFAULT_PROFILE}
const recording=new HeartSession(profile);
let connected=false;
let name='';
let onDisconnected=()=>{};

window.GGNativeHeart={
  get connected(){return connected},
  get name(){return name},
  getProfile(){return validateHeartProfile(profile)},
  saveProfile(value){
    const next=validateHeartProfile(value);
    localStorage.setItem(PROFILE_KEY,JSON.stringify(next));
    profile=next;
    // La configuración de una sesión ya iniciada permanece congelada.
    if(recording.count===0)recording.reset(next);
    return next;
  },
  resetRecording(){recording.reset(profile)},
  restoreRecording(snapshot){recording.restore(snapshot)},
  pauseRecording(){recording.pause()},
  recordReading(bpm,atMs,workoutSeconds,active){
    return recording.add(bpm,atMs,workoutSeconds,active);
  },
  exportRecording(){return recording.snapshot()},
  summary(durationSeconds){return recording.summary(durationSeconds)},
  async connect(onReading,onLost){
    if(connected)return {name};
    onDisconnected=typeof onLost==='function'?onLost:()=>{};
    const device=await connectHeartRate(reading=>{
      connected=true;
      onReading(reading);
    },()=>{
      connected=false;
      name='';
      recording.pause();
      onDisconnected();
    });
    connected=true;
    name=device.name;
    return device;
  },
  async disconnect(){
    recording.pause();
    try{await disconnectHeartRate()}finally{connected=false;name=''}
  }
};
