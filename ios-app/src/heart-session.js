// Estadísticas de FC locales y separadas del motor de entrenamientos.
// Sin predicciones: solo medimos intervalos entre notificaciones válidas.
const DEFAULT_BOUNDS=[60,70,80,90];
const MAX_GAP_SECONDS=10;
const MAX_POINTS=12000;
const MIN_POINT_SPACING_SECONDS=5;
export function validateHeartProfile(profile){
  const maxHr=profile?.maxHr==null||profile?.maxHr===''?null:Number(profile.maxHr);
  if(maxHr!==null&&(!Number.isInteger(maxHr)||maxHr<80||maxHr>240))throw Error('La FC máxima debe estar entre 80 y 240 ppm');
  const bounds=profile?.bounds==null?DEFAULT_BOUNDS:profile.bounds;
  if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(x=>!Number.isInteger(x)||x<40||x>99)||bounds.some((x,i)=>i>0&&x<=bounds[i-1]))throw Error('Los cuatro límites de zona deben estar ordenados y entre 40 y 99 %');
  return {maxHr,bounds:bounds.slice()};
}
export function heartZone(bpm,profile){
  const p=validateHeartProfile(profile);
  if(p.maxHr===null||!Number.isFinite(bpm)||bpm<25||bpm>240)return null;
  const ratio=100*bpm/p.maxHr;
  return 1+p.bounds.filter(x=>ratio>=x).length;
}
export class HeartSession{
  constructor(profile={}){
    this.reset(profile);
  }
  reset(profile={}){
    this.profile=validateHeartProfile(profile);
    this.count=0;
    this.sum=0;
    this.maximum=null;
    this.coveredSeconds=0;
    this.zoneSeconds=[0,0,0,0,0];
    this.points=[];
    this.previous=null;
    return this;
  }
  pause(){this.previous=null;}
  add(bpm,atMs,workoutSeconds,active=true){
    if(!active){this.pause();return false}
    if(!Number.isInteger(bpm)||bpm<25||bpm>240||!Number.isFinite(atMs)||!Number.isFinite(workoutSeconds)||workoutSeconds<0)return false;
    if(this.previous){
      const delta=(atMs-this.previous.atMs)/1000;
      const workoutDelta=workoutSeconds-this.previous.workoutSeconds;
      // No se extrapolan huecos, pausas ni tiempo fuera de la pantalla.
      if(delta>0&&delta<=MAX_GAP_SECONDS&&workoutDelta>0&&workoutDelta<=MAX_GAP_SECONDS){
        const interval=Math.min(delta,workoutDelta);
        this.coveredSeconds+=interval;
        const zone=heartZone(this.previous.bpm,this.profile);
        if(zone!==null)this.zoneSeconds[zone-1]+=interval;
      }
    }
    this.previous={bpm,atMs,workoutSeconds};
    this.count++;
    this.sum+=bpm;
    this.maximum=this.maximum===null?bpm:Math.max(this.maximum,bpm);
    const lastPoint=this.points.at(-1);
    if(this.points.length<MAX_POINTS&&(!lastPoint||workoutSeconds-lastPoint[0]>=MIN_POINT_SPACING_SECONDS)){
      this.points.push([Math.round(workoutSeconds*10)/10,bpm]);
    }
    return true;
  }
  snapshot(){
    return {version:1,profile:validateHeartProfile(this.profile),count:this.count,sum:this.sum,maximum:this.maximum,coveredSeconds:this.coveredSeconds,zoneSeconds:this.zoneSeconds.slice(),points:this.points.map(p=>p.slice())};
  }
  restore(raw){
    if(!raw||raw.version!==1)throw Error('Registro de FC no reconocido');
    const profile=validateHeartProfile(raw.profile);
    const count=Number(raw.count),sum=Number(raw.sum),covered=Number(raw.coveredSeconds);
    if(!Number.isSafeInteger(count)||count<0||count>300000||!Number.isFinite(sum)||sum<0||sum>count*240||!Number.isFinite(covered)||covered<0||covered>604800)throw Error('Contadores de FC incorrectos');
    if(!Array.isArray(raw.zoneSeconds)||raw.zoneSeconds.length!==5||raw.zoneSeconds.some(v=>!Number.isFinite(v)||v<0||v>covered+0.01))throw Error('Tiempos de zonas no válidos');
    if(!Array.isArray(raw.points)||raw.points.length>MAX_POINTS||raw.points.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||p[0]<0||!Number.isInteger(p[1])||p[1]<25||p[1]>240))throw Error('Muestras de FC no válidas');
    if(count===0&&raw.maximum!==null||count>0&&(!Number.isInteger(raw.maximum)||raw.maximum<25||raw.maximum>240))throw Error('FC máxima registrada no válida');
    this.reset(profile);
    this.count=count;this.sum=sum;this.maximum=raw.maximum;this.coveredSeconds=covered;
    this.zoneSeconds=raw.zoneSeconds.slice();
    this.points=raw.points.map(p=>p.slice());
    // Tras reabrir la app nunca se computa el intervalo hasta una lectura antigua.
    this.previous=null;
    return this;
  }
  summary(durationSeconds=0){
    const duration=Number.isFinite(durationSeconds)&&durationSeconds>=0?durationSeconds:0;
    return {version:1,meanBpm:this.count?Math.round(this.sum/this.count):null,maxBpm:this.maximum,
      samples:this.count,coveredSeconds:Math.round(this.coveredSeconds),durationSeconds:Math.round(duration),
      coveragePct:duration?Math.min(100,Math.round(this.coveredSeconds/duration*100)):0,
      zonesConfigured:this.profile.maxHr!==null,
      profile:validateHeartProfile(this.profile),zoneSeconds:this.zoneSeconds.map(Math.round),
      points:this.points.map(p=>p.slice())};
  }
}
