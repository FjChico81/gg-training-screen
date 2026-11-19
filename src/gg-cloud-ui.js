// Experimental GG-only cloud panel. Does not change the existing workout engine.
// Cloud imports are explicit, backed up, and GG-only; never auto-overwrite.
import { registerGG, loginGG, listGGWorkouts, createGGWorkout } from "./gg-cloud-client.js";
const el = id => document.getElementById(id);
const status = msg => { el("ggCloudStatus").textContent = msg; };
let session = null;
let cloudRows = [];
const localKey = "gg-training-screen-workouts-v1";
const demoForFirstSync = {
  name: "HYBRID POWER · Ejemplo",
  blocks: [
    { name: "Calentamiento", items: ["5 min bicicleta", "Movilidad dinámica"] },
    { name: "Fuerza", items: ["3 × 10 sentadillas", "3 × 12 press"] },
    { name: "Híbrido", items: ["15 burpees", "20 wall balls"] },
    { name: "Cardio", items: ["400 m carrera", "20 zancadas"] },
    { name: "Vuelta a la calma", items: ["3 min bicicleta", "Movilidad suave"] }
  ]
};
function localWorkouts() {
  const value = JSON.parse(localStorage.getItem(localKey) || "[]");
  if (!Array.isArray(value)) throw new Error("La biblioteca local no tiene formato válido");
  return value.filter(w => w && typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.blocks));
}
function renderLocal() {
  const select = el("ggCloudLocal");
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = ""; blank.textContent = "Selecciona una rutina local";
  select.append(blank);
  for (const w of localWorkouts()) {
    const option = document.createElement("option");
    option.value = w.id; option.textContent = w.name;
    select.append(option);
  }
}
function validRemote(w) {
  return w && typeof w.id === "string" && typeof w.name === "string" &&
    w.name.trim().length > 0 && Array.isArray(w.blocks) &&
    w.blocks.every(b => b && typeof b.name === "string" && Array.isArray(b.items) &&
      b.items.every(x => typeof x === "string"));
}
function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "GG-local-backup-before-cloud-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function importCloudWorkout(w) {
  if (!validRemote(w)) throw new Error("La rutina en la nube no tiene el formato esperado");
  const existing = localWorkouts();
  if (existing.some(x => x.id === w.id)) {
    throw new Error("Ya existe una rutina con este identificador. No se ha sobrescrito");
  }
  const copy = { id: w.id, name: w.name, blocks: w.blocks };
  if (!confirm("¿Descargar «" + w.name + "» a este dispositivo? Se conservarán las rutinas existentes y se descargará una copia de seguridad.")) return;
  downloadBackup(existing);
  const original = localStorage.getItem(localKey);
  try {
    const current = localWorkouts();
    if (current.some(x => x.id === w.id)) throw new Error("Rutina ya existente");
    localStorage.setItem(localKey, JSON.stringify([...current, copy]));
  } catch (e) {
    if (original === null) localStorage.removeItem(localKey);
    else localStorage.setItem(localKey, original);
    throw e;
  }
  status("Rutina descargada y guardada. Actualizando la biblioteca para poder entrenar.");
  location.reload();
}
function renderRemote() {
  const list = el("ggCloudRemote");
  list.replaceChildren();
  for (const w of cloudRows) {
    const item = document.createElement("li");
    item.textContent = w.name + " · " + new Date(w.updated_at).toLocaleString("es-ES");
    const download = document.createElement("button");
    download.type = "button";
    download.className = "alt";
    download.textContent = "Descargar a este dispositivo";
    download.addEventListener("click", () => perform(async () => importCloudWorkout(w)));
    item.append(" ", download);
    list.append(item);
  }
  if (!cloudRows.length) {
    const item = document.createElement("li");
    item.textContent = "Todavía no hay rutinas en la nube";
    list.append(item);
  }
}
async function perform(fn) {
  try { await fn(); } catch (e) { status("Error: " + e.message); }
}
el("ggCloudLogin").addEventListener("click", () => perform(async () => {
  session = await loginGG(el("ggCloudEmail").value.trim(), el("ggCloudPassword").value);
  el("ggCloudPassword").value = "";
  status("Sesión iniciada. Pulsa Consultar nube.");
}));
el("ggCloudRegister").addEventListener("click", () => perform(async () => {
  await registerGG(el("ggCloudEmail").value.trim(), el("ggCloudPassword").value);
  el("ggCloudPassword").value = "";
  status("Registro solicitado. Revisa tu correo si Supabase exige confirmación.");
}));
el("ggCloudList").addEventListener("click", () => perform(async () => {
  if (!session) throw new Error("Inicia sesión primero");
  cloudRows = await listGGWorkouts(session);
  renderRemote();
  status("Rutinas consultadas. Tu biblioteca local no se ha modificado.");
}));
el("ggCloudUpload").addEventListener("click", () => perform(async () => {
  if (!session) throw new Error("Inicia sesión primero");
  const id = el("ggCloudLocal").value;
  const w = localWorkouts().find(x => x.id === id);
  if (!w) throw new Error("Selecciona una rutina");
  // Never reuse a legacy local ID for a cloud record; do not silently overwrite.
  if (!confirm("¿Subir una COPIA de «" + w.name + "» a GG FAMILY? No se borrará la rutina local.")) return;
  const created = await createGGWorkout(session, { name: w.name, blocks: w.blocks });
  status("Copia subida: " + created.name + ". Original local conservado.");
  cloudRows = await listGGWorkouts(session);
  renderRemote();
}));
el("ggCloudDemoUpload").addEventListener("click", () => perform(async () => {
  if (!session) throw new Error("Inicia sesión primero");
  if (!confirm("¿Subir a GG FAMILY una copia de la rutina de EJEMPLO para probar la sincronización? No se modificará ningún entrenamiento local.")) return;
  const created = await createGGWorkout(session, demoForFirstSync);
  cloudRows = await listGGWorkouts(session);
  renderRemote();
  status("Rutina de ejemplo subida correctamente: " + created.name + ". Ya puedes abrir esta URL en la Samsung e iniciar sesión.");
}));
el("ggCloudLogout").addEventListener("click", () => {
  session = null; cloudRows = []; renderRemote();
  status("Sesión de este panel cerrada. La biblioteca local no cambia.");
});
document.getElementById("ggCloudPanel")?.addEventListener("toggle", event => { if (event.target.open) { try { renderLocal(); } catch (e) { status("Error local: " + e.message); } } });
try { renderLocal(); } catch (e) { status("Error local: " + e.message); }
renderRemote();
