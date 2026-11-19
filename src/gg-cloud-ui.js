// Experimental GG-only cloud panel. Does not change the existing workout engine.
// No automatic imports, no localStorage mutations, no HF cloud access.
import { registerGG, loginGG, listGGWorkouts, createGGWorkout } from "./gg-cloud-client.js";
const el = id => document.getElementById(id);
const status = msg => { el("ggCloudStatus").textContent = msg; };
let session = null;
let cloudRows = [];
const localKey = "gg-training-screen-workouts-v1";
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
function renderRemote() {
  const list = el("ggCloudRemote");
  list.replaceChildren();
  for (const w of cloudRows) {
    const item = document.createElement("li");
    item.textContent = w.name + " · " + new Date(w.updated_at).toLocaleString("es-ES");
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
el("ggCloudLogout").addEventListener("click", () => {
  session = null; cloudRows = []; renderRemote();
  status("Sesión de este panel cerrada. La biblioteca local no cambia.");
});
try { renderLocal(); } catch (e) { status("Error local: " + e.message); }
renderRemote();
