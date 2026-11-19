// GG FAMILY: experimental browser client, not loaded by production.
// No service_role keys. Requires GG RLS and REST grants verification.
import { GG_SUPABASE_CONFIG as cfg } from "../config/gg-supabase.js";

const headers = () => ({ apikey: cfg.publishableKey, "Content-Type": "application/json" });
async function request(path, { method = "GET", token, body, extraHeaders = {} } = {}) {
  const res = await fetch(cfg.url + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { ...headers(), ...(token ? { Authorization: "Bearer " + token } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) {
    const code = typeof data === "object" && data ? data.code || data.error_code : null;
    const serverMessage = typeof data === "object" && data ? data.msg || data.message || data.error_description || data.error : null;
    if (res.status === 429) {
      const retry = res.headers.get("retry-after");
      const hint = retry && /^\\d+$/.test(retry) ? " Espera al menos " + retry + " segundos antes de volver a intentarlo." : " No pulses repetidamente; revisa si has recibido el correo de confirmación.";
      throw new Error("Límite temporal de Supabase (" + (code || "429") + ")." + hint);
    }
    throw Object.assign(new Error(serverMessage || ("GG Supabase HTTP " + res.status)), { status: res.status, code });
  }
  return data;
}
function assertSession(session) {
  if (!session?.access_token || !session?.user?.id) throw new Error("Inicia sesión en GG antes de sincronizar");
}
function assertWorkout(workout) {
  if (!workout || typeof workout.name !== "string" || !workout.name.trim() || workout.name.length > 200 ||
      !Array.isArray(workout.blocks)) throw new Error("Rutina GG inválida");
}
// Supabase Auth (email/password). Signup may require email confirmation.
export async function registerGG(email, password) {
  return request("/auth/v1/signup", { method: "POST", body: { email, password } });
}
export async function loginGG(email, password) {
  return request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
}
export async function refreshGG(refreshToken) {
  return request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
}
const table = "/rest/v1/" + cfg.workoutsTable;
const fields = "id,name,blocks,hr_limit,revision,updated_at";

export async function listGGWorkouts(session) {
  assertSession(session);
  const results = [];
  let lastId;
  while (true) {
    const rows = await request(table + "?select=" + fields + "&order=id.asc&limit=100" +
      (lastId ? "&id=gt." + encodeURIComponent(lastId) : ""), { token: session.access_token });
    if (!rows.length) return results;
    results.push(...rows);
    lastId = rows.at(-1).id;
  }
}

export async function saveGGWorkout(session, id, revision, payload) {
  assertSession(session);
  assertWorkout(payload);
  const isNew = revision === null;
  const filter = isNew ? "" : "&id=eq." + encodeURIComponent(id) + "&revision=eq." + encodeURIComponent(revision);
  const rows = await request(table + "?select=" + fields + filter, {
    method: isNew ? "POST" : "PATCH",
    token: session.access_token,
    extraHeaders: { Prefer: "return=representation" },
    body: isNew ? { id, user_id: session.user.id, ...payload } : payload
  });
  return rows[0];
}

export async function logoutGG(session) {
  if (session?.access_token) await request("/auth/v1/logout?scope=local",
    { method: "POST", token: session.access_token });
}
