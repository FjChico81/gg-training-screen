// GG FAMILY: experimental browser client, not loaded by production.
// No service_role keys. Requires GG RLS and REST grants verification.
import { GG_SUPABASE_CONFIG as cfg } from "../config/gg-supabase.js";

const headers = () => ({ apikey: cfg.publishableKey, "Content-Type": "application/json" });
async function request(path, { method = "GET", token, body, extraHeaders = {} } = {}) {
  const res = await fetch(cfg.url + path, {
    method,
    headers: { ...headers(), ...(token ? { Authorization: "Bearer " + token } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) throw new Error(typeof data === "object" && data?.message ? data.message : typeof data === "object" && data?.error_description ? data.error_description : "GG Supabase HTTP " + res.status);
  return data;
}
function assertSession(session) {
  if (!session?.access_token || !session?.user?.id) throw new Error("Inicia sesión en GG antes de sincronizar");
}
function assertWorkout(workout) {
  if (!workout || typeof workout.name !== "string" || !workout.name.trim() || workout.name.length > 120 ||
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
export async function listGGWorkouts(session) {
  assertSession(session);
  const rows = await request("/rest/v1/workouts?select=id,user_id,name,blocks,created_at,updated_at&order=updated_at.desc", {
    token: session.access_token
  });
  return rows.map(row => ({
    id: row.id, name: row.name, blocks: row.blocks,
    updated_at: row.updated_at, created_at: row.created_at
  }));
}
export async function createGGWorkout(session, workout) {
  assertSession(session);
  assertWorkout(workout);
  const id = workout.id && /^[0-9a-f-]{36}$/i.test(workout.id) ? workout.id : crypto.randomUUID();
  const rows = await request("/rest/v1/workouts?select=id,name,blocks,updated_at", {
    method: "POST", token: session.access_token,
    extraHeaders: { Prefer: "return=representation" },
    body: { id, user_id: session.user.id, name: workout.name.trim(), blocks: workout.blocks }
  });
  return rows[0];
}
// Deliberately no automatic import, delete or edit: localStorage remains authoritative
// until a user-confirmed backup and verified conflict-handling workflow.
