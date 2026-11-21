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
