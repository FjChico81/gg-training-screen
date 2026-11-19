import { registerGG, loginGG, refreshGG, logoutGG, listGGWorkouts, saveGGWorkout, archiveGGWorkout } from "./gg-cloud-client.js?v=2.9.15";
import { workoutPayload, sameWorkout, linkWorkout, markWorkout, planWorkout } from "./gg-cloud-sync.js";

const authKey = "gg-family-auth-v1";
const ownerKey = "gg-family-browser-owner-v1";
const el = id => document.getElementById(id);
const status = message => { el("ggCloudStatus").textContent = message; };
const readAuth = () => JSON.parse(localStorage.getItem(authKey) || "null");
const lock = action => navigator.locks ? navigator.locks.request(authKey, action) : action();

export function startGGCloud(library) {
  let running = false;
  let requested = false;
  let retryAt = 0;
  let failures = 0;

  function replace(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return true;
    return library.replace(before, after);
  }

  async function sync() {
    if (!navigator.onLine) return;
    let auth = readAuth();
    if (!auth) {
      status("Inicia sesión para sincronizar. Las rutinas guardadas siguen disponibles en este navegador.");
      return;
    }
    if (auth.user.id !== localStorage.getItem(ownerKey)) throw Error("Cuenta GG no vinculada a este navegador.");
    if (library.busy()) {
      status("Sesión iniciada. La sincronización se reanudará al terminar el entrenamiento o salir del editor.");
      return;
    }
    if (auth.expiresAt <= Date.now() + 60_000) {
      const oldToken = auth.refresh_token;
      const refreshed = await refreshGG(oldToken);
      if (readAuth()?.refresh_token !== oldToken) return;
      auth = remember(refreshed);
    }
    const owner = auth.user.id;
    const isCurrent = () => readAuth()?.access_token === auth.access_token;
    const rows = await listGGWorkouts(auth);
    if (!isCurrent() || library.busy()) return;

    const rowsById = new Map(rows.map(row => [row.id, row]));
    const before = library.read();
    const next = before.filter(local => {
      const meta = local.ggCloud;
      const remote = rowsById.get(meta?.id ?? local.id);
      if (!remote?.deleted_at) return true;
      // Preserve an unsent edit or an unrelated local routine with an identical ID.
      const base = meta?.base ?? remote;
      return !sameWorkout(local, base);
    });
    const linkedIds = new Set(next.map(w => w.ggCloud?.id));
    const localById = new Map(next.map(w => [w.id, w]));
    const conflicts = [];
    const pending = [];

    for (const remote of rows) {
      if (remote.deleted_at || linkedIds.has(remote.id)) continue;
      const exact = next.findIndex(w => !w.ggCloud && (w.id === remote.id || w.id === "demo") &&
        sameWorkout(w, remote));
      if (exact >= 0) {
        next[exact] = linkWorkout(next[exact], remote, owner);
      } else if (!localById.has(remote.id)) {
        next.push(linkWorkout(null, remote, owner));
      } else {
        conflicts.push({ name: remote.name });
      }
    }

    next.forEach((local, index) => {
      const meta = local.ggCloud;
      if (meta?.owner !== owner) return;
      const remote = rowsById.get(meta.id);
      if (remote?.deleted_at) {
        conflicts.push({ name: local.name, local, remote });
        return;
      }
      switch (planWorkout(local, remote)) {
        case "accept": next[index] = linkWorkout(local, remote, owner); break;
        case "conflict": conflicts.push({ name: local.name, local, remote }); break;
        case "insert":
        case "update": pending.push(local); break;
      }
    });
    if (!replace(before, next)) return;

    for (const local of pending) {
      if (!isCurrent() || library.busy()) return;
      const current = library.read();
      const found = current.find(w => w.id === local.id);
      if (found !== local) continue;
      const meta = local.ggCloud;
      let saved;
      try {
        saved = await saveGGWorkout(auth, meta.id, meta.revision, workoutPayload(local));
      } catch (error) {
        if (error.code !== "23505") throw error;
      }
      if (!saved) {
        requested = true;
        return;
      }
      if (!isCurrent() || library.busy()) return;
      const latest = library.read();
      const currentWorkout = latest.find(w => w.id === local.id);
      if (currentWorkout?.ggCloud?.id !== meta.id) continue;
      const acknowledged = linkWorkout(currentWorkout, saved, owner);
      // An edit made during the request remains queued against the acknowledged revision.
      if (currentWorkout !== local) {
        acknowledged.name = currentWorkout.name;
        acknowledged.blocks = currentWorkout.blocks;
        acknowledged.hrLimit = currentWorkout.hrLimit;
      }
      if (!replace(latest, latest.map(w => w === currentWorkout ? acknowledged : w))) return;
    }

    showConflicts(conflicts, owner);
    status(conflicts.length ? "Hay cambios en conflicto. Se han conservado las versiones." : "Rutinas sincronizadas.");
  }

  function showConflicts(conflicts, owner) {
    const list = el("ggCloudRemote");
    list.replaceChildren();
    for (const { name, local, remote } of conflicts) {
      const item = document.createElement("li");
      item.textContent = remote?.deleted_at ? name + " · eliminada en otro dispositivo" : name;
      if (local && remote) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = remote.deleted_at ? "Recuperar mi edición como copia" : "Conservar ambas versiones";
        button.onclick = () => perform(async () => {
          if (library.busy() || readAuth()?.user.id !== owner) return;
          const before = library.read();
          const found = before.find(w => w.id === local.id);
          if (found !== local) return schedule(true);
          const id = crypto.randomUUID();
          const copy = markWorkout({ ...local, id, ggCloud: undefined }, null, owner);
          const updated = remote.deleted_at ? before.filter(w => w !== local)
            : before.map(w => w === local ? linkWorkout(w, remote, owner) : w);
          if (replace(before, [...updated, copy])) {
            schedule(true);
          }
        });
        item.append(" ", button);
      }
      list.append(item);
    }
  }

  function remember(session) {
    if (!session.user?.id || !session.access_token || !session.refresh_token ||
        !Number.isFinite(session.expires_in)) throw Error("Respuesta de inicio de sesión incompleta.");
    const owner = localStorage.getItem(ownerKey);
    if (owner && owner !== session.user.id) {
      throw Error("Usa otro perfil del navegador para una cuenta GG diferente.");
    }
    const auth = {
      user: { id: session.user.id },
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expiresAt: Date.now() + session.expires_in * 1000
    };
    localStorage.setItem(ownerKey, auth.user.id);
    localStorage.setItem(authKey, JSON.stringify(auth));
    return auth;
  }

  async function perform(action) {
    try { await action(); } catch (error) { status(error.message); }
  }

  function schedule(force = false) {
    if (force) retryAt = 0;
    if (running) { requested = true; return; }
    if (Date.now() < retryAt || document.hidden || !navigator.onLine) return;
    running = true;
    requested = false;
    void lock(sync).then(() => { failures = 0; }).catch(error => {
      failures += 1;
      retryAt = Date.now() + Math.min(300_000, 5_000 * 2 ** Math.min(failures, 6));
      status(error.status === 401 || error.code === "refresh_token_not_found"
        ? "Vuelve a iniciar sesión para enviar los cambios pendientes."
        : "Sincronización pendiente. Los cambios siguen guardados en el dispositivo. " + error.message);
    }).finally(() => {
      running = false;
      if (requested && Date.now() >= retryAt) setTimeout(schedule, 2000);
    });
  }

  const loginButton = el("ggCloudLogin");
  loginButton.onclick = () => perform(async () => {
    const email = el("ggCloudEmail").value.trim();
    const password = el("ggCloudPassword").value;
    if (!email || !password) throw Error("Introduce el correo y la contraseña de GG WEB.");
    if (!navigator.onLine) throw Error("La tablet no tiene conexión. Conéctala a internet y vuelve a pulsar Entrar.");
    loginButton.disabled = true;
    status("Conectando con GG FAMILY…");
    try {
      await lock(async () => {
        remember(await loginGG(email, password));
        el("ggCloudPassword").value = "";
      });
      status("Sesión iniciada. Comprobando rutinas…");
      schedule(true);
    } catch (error) {
      if (error.code === "invalid_credentials") throw Error("El correo o la contraseña de GG WEB no son correctos.");
      if (error.code === "email_not_confirmed") throw Error("Confirma tu correo antes de iniciar sesión.");
      if (error.name === "TimeoutError" || error instanceof TypeError) {
        throw Error("No se ha podido conectar con GG FAMILY. Comprueba tu conexión y vuelve a intentarlo.");
      }
      throw error;
    } finally {
      loginButton.disabled = false;
    }
  });
  loginButton.disabled = false;
  el("ggCloudRegister").onclick = () => perform(async () => {
    await registerGG(el("ggCloudEmail").value.trim(), el("ggCloudPassword").value);
    el("ggCloudPassword").value = "";
    status("Registro solicitado. Revisa el correo de confirmación.");
  });
  el("ggCloudLogout").onclick = () => perform(async () => {
    const auth = readAuth();
    localStorage.removeItem(authKey);
    el("ggCloudRemote").replaceChildren();
    status("Sesión cerrada en este navegador.");
    await lock(async () => {
      if (navigator.onLine && auth) await logoutGG(auth);
    });
  });
  el("ggCloudList").onclick = () => schedule(true);
  window.addEventListener("online", () => schedule(true));
  window.addEventListener("offline", () => status("Sin conexión. Los cambios quedan guardados en este dispositivo."));
  window.addEventListener("focus", () => schedule());
  document.addEventListener("visibilitychange", () => schedule());
  setInterval(schedule, 30_000);
  if (!navigator.onLine) status("Sin conexión. Conéctate a internet para sincronizar.");
  schedule();

  return {
    schedule,
    async archive(workout) {
      if (!navigator.onLine) throw Error("Conéctate a internet para eliminar esta rutina de tus dispositivos.");
      await lock(async () => {
        let auth = readAuth();
        const meta = workout.ggCloud;
        if (!auth || auth.user.id !== meta.owner) throw Error("Inicia sesión en la cuenta propietaria de la rutina.");
        if (library.busy() || !library.read().includes(workout)) {
          throw Error("La rutina ha cambiado o hay un entrenamiento activo. Vuelve a intentarlo desde la biblioteca.");
        }
        if (meta.revision === null) throw Error("Espera a que se guarde la rutina en la nube y vuelve a intentarlo.");
        if (auth.expiresAt <= Date.now() + 60_000) {
          const token = auth.refresh_token;
          const refreshed = await refreshGG(token);
          if (readAuth()?.refresh_token !== token) throw Error("La sesión ha cambiado. Vuelve a iniciar sesión.");
          auth = remember(refreshed);
        }
        const archived = await archiveGGWorkout(auth, meta.id, meta.revision);
        if (!archived) throw Error("La rutina ha cambiado en otro dispositivo. Revisa la versión actual antes de eliminarla.");
        const current = library.read();
        replace(current, current.filter(item => item !== workout));
      }).finally(() => schedule(true));
    },
    mark(workout, previous) {
      return markWorkout(workout, previous, readAuth()?.user.id);
    }
  };
}
