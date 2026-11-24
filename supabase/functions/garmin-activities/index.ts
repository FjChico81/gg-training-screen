const garminOrigin = 'https://personal.connectapi.garmin.com';
const limit = 30;
const tokenPath = '/personalapitoken-service/personal-api/personal-api-key/token';
const archivePath = '/activitylist-service/activities/search/activities';

function numberInRange(value, min, max) {
 return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function activitySummary(activity) {
 const id = String(activity?.activityId ?? '');
 const dateGMT = String(activity?.startTimeGMT ?? '').replace(' ', 'T');
 const time = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/i.test(dateGMT) ? dateGMT : dateGMT + 'Z');
 const elapsed = numberInRange(activity?.duration, 1, 604800);
 if (!/^\d{1,20}$/.test(id) || !Number.isFinite(time) || elapsed === null || Number(activity.parentId) > 0) return null;

 return {
  id,
  name: String(activity.activityName || 'Actividad Garmin').trim().slice(0, 120) || 'Actividad Garmin',
  type: String(activity.activityType?.typeKey ?? '').slice(0, 64),
  date: new Date(time).toISOString(),
  elapsed,
  distanceMeters: numberInRange(activity.distance, 1, 10000000),
  averageHeartRate: numberInRange(activity.averageHR, 25, 240),
  peakHeartRate: numberInRange(activity.maxHR, 25, 240)
 };
}

export function createGarminHandler({supabaseUrl, publishableKey, owner, garminKey, webOrigin, fetchImpl = fetch}) {
 return async function handle(request) {
  const origin = request.headers.get('Origin');
  const cors = origin === webOrigin ? {
   'Access-Control-Allow-Origin': webOrigin,
   'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
   'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  } : {};
  const responseHeaders = {...cors, 'Cache-Control': 'no-store', 'Vary': 'Origin'};
  const reply = (body, status = 200) => Response.json(body, {status, headers: responseHeaders});
  if (origin && origin !== webOrigin) return reply({message: 'Origen no autorizado.'}, 403);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: responseHeaders});
  if (!['GET', 'POST'].includes(request.method)) return reply({message: 'Método no permitido.'}, 405);
  const bearer = request.headers.get('Authorization');
  if (!bearer?.startsWith('Bearer ')) return reply({message: 'Inicia sesión en BUHARDILLA.'}, 401);
  if (!owner || !garminKey || !supabaseUrl || !publishableKey)
   return request.method === 'GET' ? reply({enabled: false}) : reply({message: 'Garmin aún no está configurado.'}, 503);

  try {
   const verified = await fetchImpl(supabaseUrl + '/auth/v1/user', {
    headers: {apikey: publishableKey, Authorization: bearer}, redirect: 'error', signal: AbortSignal.timeout(5000)
   });
   if (verified.status >= 500) return reply({message: 'No se pudo verificar la cuenta de BUHARDILLA.'}, 502);
   if (!verified.ok) return reply({message: 'Vuelve a iniciar sesión en BUHARDILLA.'}, 401);
   const user = await verified.json();
   const allowed = user?.id === owner && user.is_anonymous !== true;
   if (request.method === 'GET') return reply({enabled: allowed});
   if (!allowed) return reply({message: 'Garmin no está habilitado para esta cuenta.'}, 403);

   const tokenReply = await fetchImpl(garminOrigin + tokenPath, {
    method: 'POST', headers: {Authorization: 'ApiKey ' + garminKey}, redirect: 'error', signal: AbortSignal.timeout(8000)
   });
   if (tokenReply.status === 401 || tokenReply.status === 403)
    return reply({message: 'La clave de Garmin ha caducado o fue revocada.'}, 502);
   if (!tokenReply.ok) return reply({message: 'Garmin Connect no está disponible en este momento.'}, 502);
   const raw = (await tokenReply.text()).trim();
   const token = raw.startsWith('{') ? JSON.parse(raw).access_token : raw.replace(/^"|"$/g, '');
   if (typeof token !== 'string' || !/^[\w.-]+$/.test(token))
    return reply({message: 'Garmin Connect devolvió una autorización inválida.'}, 502);

   const endpoint = new URL(archivePath, garminOrigin);
   endpoint.search = new URLSearchParams({start: '0', limit: String(limit)});
   const activities = await fetchImpl(endpoint, {
    headers: {Authorization: 'Bearer ' + token}, redirect: 'error', signal: AbortSignal.timeout(8000)
   });
   if (activities.status === 204) return reply({activities: []});
   if (!activities.ok) return reply({message: 'Garmin Connect no pudo devolver las actividades.'}, 502);
   const rows = await activities.json();
   if (!Array.isArray(rows)) return reply({message: 'Garmin Connect devolvió un historial inválido.'}, 502);
   return reply({activities: rows.slice(0, limit).map(activitySummary).filter(Boolean)});
  } catch {
   return reply({message: 'No se pudo completar la conexión con Garmin Connect.'}, 502);
  }
 };
}

if (import.meta.main) {
 Deno.serve(createGarminHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  owner: Deno.env.get('GARMIN_OWNER_USER_ID'),
  garminKey: Deno.env.get('GARMIN_PERSONAL_API_KEY'),
  webOrigin: Deno.env.get('GARMIN_WEB_ORIGIN') || 'https://fjchico81.github.io'
 }));
}
