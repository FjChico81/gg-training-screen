# HF WEB · Sincronización móvil → Samsung · Contrato v3

Fecha: 21/11/2026. Estado: **PREPARADO EN DESARROLLO, SIN ACTIVACIÓN EN SUPABASE.**

## Alcance y norma de seguridad

Este contrato corresponde **solo a HF WEB**, con cuenta/organización, RLS y proyecto de base de datos independientes. No consultar, compartir, utilizar ni modificar recursos HPS. No intervenir GG/VECTOR salvo las comprobaciones necesarias de no regresión en su repositorio web autorizado.

No aplicar ningún SQL de la carpeta \`db/hf-training\` sin acreditar que el destino pertenece exclusivamente a HF y sin autorización explícita de cambio de infraestructura.

## A. Funcionamiento esperado

1. El entrenador inicia sesión con su cuenta HF y la pantalla con una **cuenta de visualización independiente**, nunca con credenciales del entrenador.
2. El entrenador solicita vincularse a la pantalla y **esa pantalla acepta**; el enlace es revocable y caduca.
3. El entrenador crea una sesión, ligada al vínculo aceptado, con plan público (ejercicios, objetivos, tiempos). No se envían datos individuales de participantes.
4. El entrenador ejecuta órdenes de inicio, pausa, reanudación, siguiente y reinicio. Cada escritura requiere revisión previa y UUID de comando.
5. La pantalla consulta el estado de la sesión **solo por lectura**. En el primer MVP se usaría REST polling autenticado (aprox. 1,5 s). Realtime no es requisito para la primera prueba, pero puede reducir latencia más adelante.
6. La pantalla reconstruye de modo determinista los tiempos a partir de fechas UTC. No escribe transiciones automáticas. El cliente puede mostrar qué ejercicio corresponde tras una desconexión, aunque el servidor conserve el último cursor confirmado.
7. Si el servidor revoca el acceso, expira el enlace o no devuelve la sesión, la pantalla cancela su suscripción. Si fallan varias consultas, marca el estado como no sincronizado.
8. Si una orden queda sin confirmación, se consulta la última revisión y el último identificador de comando. **No se reenvía automáticamente**.

## B. Componentes preparados

- \`src/hf-class-runtime.mjs\`: motor puro basado en UTC, sin efectos secundarios. \`createHFRuntime\`, \`commandHFRuntime\`, \`materializeHFRuntime\`, \`presentHFRuntime\`.
- \`src/hf-live-client.mjs\`: cliente HF anclado a destino aprobado, creación de sesión, consulta, actualización condicional y detección de resultados inciertos. No está conectado a la interfaz.
- \`src/hf-screen-watcher.mjs\`: lector de solo consulta. Evita llamadas simultáneas, avisa de estado obsoleto, descarta respuestas de una generación anterior, cierra al perder autorización. No puede escribir.
- \`src/hf-pairing-client.mjs\`: solicitudes de enlace, aceptación explícita y revocación, sin conectar al servidor aún.
- \`db/hf-training/class-access-v2-DRAFT-DO-NOT-APPLY.sql\`: diseño de permisos, vinculaciones y sesiones en directo **SIN EJECUTAR**.
- \`tests/hf-class-runtime-smoke.mjs\`: tiempos, pausas y rotaciones sin inventar descansos.
- \`tests/hf-screen-watcher-smoke.mjs\`: lectura, conexión obsoleta, recuperación y revocación.
- \`tests/hf-two-device-contract-smoke.mjs\`: dos clientes de dispositivo independientes contra **servidor falso**, sin llamadas al servidor real.
- \`tests/hf-rls-draft-static-guard.cjs\`: guardas textuales del SQL, **NO EQUIVALEN a pruebas reales de permisos**.

## C. Modelo de estado

El estado público persistido es:

\`\`\`json
{
  "mode": "guided",
  "phase": "work",
  "step": 0,
  "turn": 0,
  "paused": false,
  "deadlineUtc": "2026-11-21T14:40:30.000Z",
  "runningSinceUtc": "2026-11-21T14:40:00.000Z",
  "remainingMs": null,
  "elapsedMs": 0,
  "phaseElapsedMs": 0
}
\`\`\`

Los cambios automáticos por tiempo pueden calcularse para visualización sin escribir; el reloj local de la pantalla requiere verificación contra la hora del servidor antes de producción, especialmente si hay deriva de varios segundos.

## D. Problemas todavía abiertos

**Bloqueantes de seguridad:**
- No se ha acreditado un entorno HF de pruebas independiente de cualquier cuenta vinculada a HPS.
- Falta crear y probar realmente roles, emparejamiento, revocación y RLS PostgreSQL/pgTAP. En ningún caso ejecutar SQL directamente en HF producción.
- Falta un protocolo de órdenes totalmente transaccional/idempotente con registro duradero en el servidor. Comparar \`revision\` evita sobrescrituras concurrentes, pero no constituye una historia completa de comandos.
- Debe definirse quién materializa en la base los avances temporizados cuando no hay móvil conectado. La pantalla **no** debe convertirse en escritor por defecto.
- Verificar control de acceso de REST Data API (GRANT+RLS) y límites de frecuencia de solicitudes.

**Bloqueantes de producto:**
- La interfaz de HF todavía no invoca el cliente real de sesión; no hay mando iPhone ↔ Samsung operativo.
- El motor v3 y el prototipo anterior todavía requieren adaptación controlada para representar el mismo estado visual de forma consistente.
- Faltan ensayos en navegador real, dispositivos físicos, desfase horario, cortes de Wi-Fi, modo pantalla completa, audio y GIFs.
- Falta revisión de regresión GG/VECTOR y pruebas de experiencia con la asociación.

## E. Próxima puerta de aceptación — primera entrega

**Demostración necesaria:** desde iPhone del entrenador se crea una clase de prueba; la Samsung autenticada muestra la sesión, acepta su vinculación, ejecuta los cambios observados tras el avance, y vuelve a mostrar correctamente ejercicio y cronómetro después de apagar/encender Wi-Fi. La cuenta de pantalla no puede modificar el estado; una tercera cuenta no puede leerlo. Al revocar, cesa la lectura.

Solo después de test SQL en un proyecto HF aislado, autorización de infraestructura y pruebas de dispositivos se podrá marcar **IMPLEMENTADO Y VERIFICADO MULTIDISPOSITIVO**.

## Documentación oficial de seguridad
- [Supabase · Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase · Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [PostgreSQL · CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)


## Actualización 21/11/2026 · Interfaz de primera sincronización preparada y BLOQUEADA

Se han preparado módulos adicionales en la rama HF:

- \`src/hf-memory-auth.mjs\`: autenticación HF con sesión volátil, sin contraseñas ni tokens guardados en localStorage/sessionStorage; todavía no integrada con la versión publicada.
- \`src/hf-coach-controller.mjs\`: comprueba enlace aceptado y no revocado antes de crear la clase, transforma las órdenes al nuevo estado y aplica revisión CAS. Ante fallo incierto, lee el último UUID de comando y **no reenvía órdenes automáticamente**.
- \`hf-live-beta.html\`: dos modos visuales (entrenador iPhone y pantalla Samsung), vinculación, creación de clases, avance, estado, rechazo y visualización de estaciones. Incluye detección de una sola clase activa autorizada.
- \`src/hf-live-rollout.mjs\`: **HF_LIVE_ROLLOUT_APPROVED = false**. Impide inicializar clientes y contactar la API hasta verificar la propiedad y aprobar los pasos de seguridad. No existe bypass por parámetro URL.
- \`tests/hf-memory-auth-smoke.mjs\`, \`tests/hf-coach-controller-smoke.mjs\` y \`tests/hf-live-rollout-smoke.mjs\`: pruebas sin red del inicio de sesión, protección contra repetición y bloqueo de la interfaz.

**El enlace de esta beta NO autoriza la conexión real.** La pantalla muestra el motivo y mantiene deshabilitados los controles. La simulación independiente en dos pestañas sigue disponible.

### Evidencia de titularidad: BLOQUEANTE NO RESUELTO

El repositorio identifica el endpoint \`ydaqsmrfuwhqwqojrxyr.supabase.co\` como \`HF TRAINING\`, pero ese dato **no acredita la titularidad de la cuenta/organización**. En cumplimiento de la norma absoluta HPS:

- **No se ha utilizado ninguna herramienta Supabase ni se han listado proyectos de cuentas compartidas.**
- **No se ha consultado el contenido de ninguna base de datos.**
- No se ha realizado ningún cambio de Auth, RLS, esquema, Realtime, tablas, backups ni despliegue de producción.
- La conexión solo podrá habilitarse cuando se certifique que el proyecto HF pertenece a una cuenta u organización exclusiva GG/HF, **sin participación de la cuenta de Dionisio ni recursos HPS**.
- Para acreditar la titularidad basta un registro autorizado de la organización/propietario y la referencia exacta del proyecto HF, excluyendo claves, contraseñas o tokens. No se pedirán secretos.

### Criterios mínimos adicionales antes de activar

1. Cuenta organizativa inequívocamente separada de HPS, proyecto de pruebas HF exclusivo.
2. RLS de emparejamiento y sesiones probado con PostgreSQL real, no solo tests estáticos o servidor falso.
3. Privilegios de rol provisionados por administrador de HF; una cuenta ordinaria no debe elevarse a entrenador.
4. Decidir y validar token refresh durante sesiones de larga duración; la implementación actual usa tokens en memoria.
5. Sincronizar el reloj contra tiempo del servidor y acotar su desviación.
6. Resolver idempotencia durable de órdenes con servidor de referencia.
7. Validar permisos de revocación y lectura posterior a cierre, timeout, dos entrenadores y reconexión.
8. Probar iPhone y Samsung con una clase de prueba creada y controlada desde HF; pruebas de TV, audio y GIFs.
9. Mantener inactiva la bandera de conexión hasta completar pruebas y obtener autorización para cambios en infraestructura/producción.

### Referencias actuales

Supabase (noviembre 2026): se deben considerar **GRANT + RLS** como controles independientes; los canales Realtime requieren permisos específicos y la autorización privada se comprueba al establecer la conexión. En la primera prueba propuesta se mantiene polling REST autenticado para reducir complejidad.

- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/realtime/authorization
