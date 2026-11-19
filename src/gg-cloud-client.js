import { GG_SUPABASE_CONFIG } from "../config/gg-supabase.js";

export function createWorkoutCloudClient(cfg) {
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
      throw Object.assign(new Error(serverMessage || ("Supabase HTTP " + res.status)), { status: res.status, code });
    }
    return data;
  }
  function assertSession(session) {
    if (!session?.access_token || !session?.user?.id) throw new Error("Inicia sesión antes de sincronizar");
  }
  function assertWorkout(workout) {
    if (!workout || typeof workout.name !== "string" || !workout.name.trim() || workout.name.length > 200 ||
        !Array.isArray(workout.blocks)) throw new Error("Rutina inválida");
  }
  // Supabase Auth (email/password). Signup may require email confirmation.
  async function registerGG(email, password) {
    return request("/auth/v1/signup", { method: "POST", body: { email, password } });
  }
  async function loginGG(email, password) {
    return request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  }
  async function refreshGG(refreshToken) {
    return request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
  }
  const table = "/rest/v1/" + cfg.workoutsTable;
  const fields = "id,name,blocks,hr_limit,revision,updated_at";

  async function listGGWorkouts(session) {
    assertSession(session);
    const results = [];
    let lastId;
    let selected = fields + ",deleted_at";
    while (true) {
      const query = "&order=id.asc&limit=100" + (lastId ? "&id=gt." + encodeURIComponent(lastId) : "");
      let rows;
      try {
        rows = await request(table + "?select=" + selected + query, { token: session.access_token });
      } catch (error) {
        if (lastId || error.code !== "42703" || !error.message.includes("deleted_at")) throw error;
        selected = fields;
        rows = await request(table + "?select=" + selected + query, { token: session.access_token });
      }
      if (!rows.length) return results;
      results.push(...rows);
      lastId = rows.at(-1).id;
    }
  }

  async function saveGGWorkout(session, id, revision, payload) {
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

  async function logoutGG(session) {
    if (session?.access_token) await request("/auth/v1/logout?scope=local",
      { method: "POST", token: session.access_token });
  }

  async function archiveGGWorkout(session, id, revision) {
    assertSession(session);
    const filter = "&id=eq." + encodeURIComponent(id) + "&revision=eq." + encodeURIComponent(revision);
    try {
      const rows = await request(table + "?select=id,revision,deleted_at&deleted_at=is.null" + filter, {
        method: "PATCH",
        token: session.access_token,
        extraHeaders: { Prefer: "return=representation" },
        body: { deleted_at: new Date().toISOString() }
      });
      return rows[0];
    } catch (error) {
      if ((error.code === "42703" || error.code === "PGRST204") && error.message.includes("deleted_at")) {
        throw Error("El borrado sincronizado está pendiente de activación en este proyecto.");
      }
      throw error;
    }
  }
  return { registerGG, loginGG, refreshGG, logoutGG, listGGWorkouts, saveGGWorkout, archiveGGWorkout };
}

export const ggWorkoutCloud = createWorkoutCloudClient(GG_SUPABASE_CONFIG);
