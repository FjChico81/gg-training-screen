/**
 * HF TRAINING: optional browser auth adapter, kept in memory only.
 * Prepared but NOT enabled by HF production UI.
 * Never accepts a destination outside exclusively identified HF TRAINING.
 * No browser storage: closing/reloading requires signing in again.
 */
const HF_ORIGIN='https://ydaqsmrfuwhqwqojrxyr.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createHFMemoryAuth(config,{fetchImpl=(...args)=>fetch(...args)}={}){
  if(config?.url!==HF_ORIGIN ||
      typeof config?.publishableKey!=='string' ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)){
    throw Error('HF no dispone de un destino exclusivo autorizado');
  }
  let current=null;
  function credentials(data){
    if(!data || typeof data.access_token!=='string'||!data.access_token
      ||typeof data.refresh_token!=='string'||!data.refresh_token
      ||!UUID.test(data.user?.id))throw Error('Respuesta de autenticación HF inválida');
    return {
      access_token:data.access_token,refresh_token:data.refresh_token,
      user:{id:data.user.id},expires_at:Number.isFinite(data.expires_in)
        ?Date.now()+Number(data.expires_in)*1000:null
    };
  }
  async function post(path,body,token){
    let res;
    try{
      res=await fetchImpl(HF_ORIGIN+'/auth/v1/'+path,{
        method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{
          apikey:config.publishableKey,'Content-Type':'application/json',
          ...(token?{Authorization:'Bearer '+token}:{})
        },
        body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
      });
    }catch(e){throw Error('No se pudo conectar con la autenticación exclusiva HF');}
    let raw;try{raw=await res.text();}catch{throw Error('Respuesta incompleta de autenticación HF');}
    let data;try{data=raw?JSON.parse(raw):{};}catch{data={};}
    if(!res.ok){
      throw Error(res.status===429?'Demasiados intentos; respeta la espera de HF':
        'Credenciales no aceptadas o acceso no autorizado');
    }
    return data;
  }
  return Object.freeze({
    get session(){return current;},
    async login(email,password){
      if(typeof email!=='string'||!email.trim()||email.length>254
        ||typeof password!=='string'||!password)throw Error('Introduce correo y contraseña');
      const next=credentials(await post('token?grant_type=password',{
        email:email.trim(),password
      }));
      current=next;
      return {access_token:next.access_token,user:next.user}; // not refresh token
    },
    async refresh(){
      if(!current?.refresh_token)throw Error('La sesión HF ha caducado');
      const next=credentials(await post('token?grant_type=refresh_token',{
        refresh_token:current.refresh_token
      }));
      current=next;
      return {access_token:next.access_token,user:next.user};
    },
    async logout(){
      const token=current?.access_token;current=null;
      if(token)await post('logout?scope=local',{},token);
    },
    clear(){current=null;}
  });
}
