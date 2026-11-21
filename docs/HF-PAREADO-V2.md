# HF WEB · Vinculación de entrenador y pantalla · V2

**Estado: DISEÑADO + CÓDIGO PREPARADO + PRUEBAS SIMULADAS. NO PUBLICADO NI VALIDADO CON SUPABASE.**

Fecha: 21/11/2026. Proyecto exclusivo HF TRAINING. No acceder ni utilizar recursos GG ajenos a esta app ni recursos HPS.

## 1. Experiencia prevista

1. La asociación prepara una cuenta **exclusiva de pantalla**, distinta de las cuentas personales. Un administrador de HF le asigna el rol \`screen\`.
2. El entrenador usa su cuenta HF con rol \`trainer\` asignado por el administrador. Un usuario cualquiera de HF **no** puede declararse entrenador desde el navegador.
3. La pantalla muestra su identificador público de pantalla (para copiar o escanear), **nunca sus credenciales**.
4. Desde su móvil, el entrenador solicita el vínculo con esa pantalla. La solicitud caduca a los 10 minutos; el borrador SQL acepta hasta 15 minutos.
5. En la pantalla aparece una solicitud pendiente que necesita **aceptación manual**. Identificar correctamente al entrenador antes de aceptar requiere un paso de verificación en UI (no suponer su identidad por UUID).
6. Si se aprueba, el vínculo se mantiene durante 48 horas como máximo en la configuración propuesta del cliente (la base admite hasta 7 días). El entrenador puede crear y dirigir una sesión.
7. La pantalla muestra solo el plan público y el estado de la sesión. El entrenador es el único que puede modificar el estado; el servidor valida el rol y el emparejamiento.
8. La pantalla o el entrenador pueden **revocar** el vínculo. La revocación es permanente para ese vínculo; una nueva conexión requiere nueva solicitud y aceptación.

No se deben mostrar correos, contraseñas, FC personal, histórico ni datos de menores en la pantalla común.

## 2. Lo que existe en la rama

| Ruta | Estado | Uso |
| --- | --- | --- |
| \`hf-pair-preview.html\` | Implementado (demo) | Abrir mando/pantalla en dos pestañas del mismo navegador |
| \`hf-class-prototype.html\` | Implementado (demo) | Pantalla TV; necesita confirmar o rechazar el mando de prueba |
| \`hf-coach-preview.html\` | Implementado (demo) | Mando, confirmación de órdenes, conexión caducada |
| \`src/hf-preview-link.js\` | Implementado (demo) | BroadcastChannel **solo mismo navegador** y deduplicación local |
| \`src/hf-pairing-client.mjs\` | Preparado, NO conectado | Solicitar, aceptar, rechazar/revocar y consultar el estado con sesión HF autenticada |
| \`src/hf-live-client.mjs\` | Preparado, NO conectado | Leer sesiones y proponer PATCH CAS usando revisión y UUID de comando |
| \`db/hf-training/class-access-v2-DRAFT-DO-NOT-APPLY.sql\` | Borrador, NO EJECUTADO | Roles, solicitudes pendientes, aceptación y revocación, RLS, sesiones |
| \`db/hf-training/class-live-sessions-DRAFT-DO-NOT-APPLY.sql\` | SUPERADO, NO EJECUTAR | Borrador v1 conservado solo como historial |

El destino del cliente HF está anclado al proyecto HF TRAINING previsto en la configuración. No puede cambiarse a una URL de un proyecto ajeno sin fallar las validaciones locales. **Esto no sustituye el control de acceso en el servidor.**

## 3. Evidencia y limitaciones

Pruebas ejecutadas mediante el evaluador aislado con clientes simulados:

- 11 comprobaciones de integración de la simulación de pantalla: sin control previo, aceptación, inicio, avance, revocación, pausa y bloqueo del mando.
- 7/7 pruebas del cliente de emparejamiento con respuestas HTTP simuladas: destino HF, sesión, caducidad, aceptación, revocación y pérdidas de respuesta.
- 6/6 guardas estáticas del borrador SQL: roles, grants, RLS, aceptación y revocación.
- Pruebas previas del motor de clases, canal local y cliente de sesiones, todas con datos falsos.

**No equivalen a ensayos del servidor**. No se ha ejecutado ningún SQL, pgTAP, auditoría RLS sobre un proyecto real, ni pruebas multidispositivo. Se ha creado un workflow aislado \`.github/workflows/hf-association-smoke.yml\` para ejecutarlas con Node en GitHub Actions; confirmar su resultado antes de afirmar CI PASS.

## 4. Bloqueantes de seguridad y funcionamiento

1. **Acreditar el entorno HF:** conocer un identificador de proyecto no autoriza usar una cuenta Supabase compartida o vinculada con HPS. Sólo utilizar un entorno bajo una cuenta/organización exclusiva GG/HF y recursos inequívocos de HF. Cualquier duda -> detener.
2. **RLS en servidor:** testear política por política con usuarios auténticos de prueba (anónimo, alumno, entrenador, pantalla propia/ajena, pares pendientes/aceptados/caducados/revocados). Confirmar grants y configuración de exposición de Data API.
3. **Vinculación legible:** pantalla debe mostrar información suficiente para reconocer quién solicita controlar la clase, sin exponer datos privados. Implementar limitación de solicitudes y protección contra spam.
4. **Idempotencia completa:** \`revision\` más último UUID reduce conflictos, pero no prueba la historia de todos los comandos. Añadir y validar registro duradero de órdenes o RPC transaccional antes de producción.
5. **Avance de pasos cronometrados con móvil bloqueado:** la pantalla sólo puede leer en el diseño actual. Definir cómo el servidor o una función verificada materializa los avances automáticos cuando el móvil se duerme; no permitir que cualquier pantalla modifique la sesión.
6. **Reloj confiable y offline:** normalizar a tiempo UTC del servidor y probar desfase de reloj, reconexiones, pérdida de Wi-Fi, sesión caducada y reinicios. Tras reconectar, recuperar snapshot autorizado, no repetir comandos a ciegas.
7. **Realtime seguro:** elegir Broadcast privado con políticas explícitas \`realtime.messages\` o polling inicial; los eventos solo anuncian cambios, el estado definitivo se consulta en la base.
8. **No publicar ni migrar sin autorización expresa:** pruebas en un proyecto HF de TEST primero; separar la pantalla pública del panel con rutas, sesiones y permisos reales.

## 5. Entrega útil de la siguiente fase

El primer ensayo integral pendiente consiste en iniciar una clase desde el iPhone y observar el mismo estado en una Samsung conectada a una **base de datos de pruebas HF**, con ambas cuentas de ensayo autorizadas y la pantalla capaz de aceptar/revocar la conexión. Solo después evaluar el despliegue estable.

## Documentación de referencia

- Supabase, Data API grants y RLS: https://supabase.com/docs/guides/api/securing-your-api
- Supabase, Broadcast privado y Postgres Changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- PostgreSQL, CREATE POLICY: https://www.postgresql.org/docs/current/sql-createpolicy.html
