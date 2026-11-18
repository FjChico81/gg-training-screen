# GG / HF · Arquitectura de sincronización v0.1 (propuesta, sin despliegue)

Estado: DISEÑO. No ejecutar migraciones ni cambiar producción sin revisión.

## Restricción absoluta
HPS es intocable: no leer ni modificar su proyecto Supabase, sus repositorios GitHub ni sus carpetas Drive para implementar GG/HF. El proyecto Supabase ya existente en la cuenta queda excluido por defecto.

## Límites de infraestructura
- GG: proyecto Supabase nuevo, exclusivo, cuentas familiares gestionadas por adultos.
- HF: segundo proyecto Supabase nuevo, exclusivo, usuarios independientes.
- Frontend puede compartir código; variables de entorno, claves publicables y tablas son distintas.
- Nunca publicar claves secretas/service_role en GitHub Pages ni en cliente.
- No crear recursos hasta comprobar propiedad, costes y permisos.

## Modelo propuesto por proyecto
- households (solo GG): id, owner_user_id, created_at.
- memberships (GG): household_id, auth_user_id, role; roles adultos autorizados.
- profiles (GG): id, household_id, display_name, managed_by_user_id, is_minor.
- profiles (HF): id, auth_user_id, display_name.
- workouts: id, owner_scope_id, title, blocks_json, revision, updated_at, deleted_at.
- workout_assignments (GG): id, workout_id, profile_id, assigned_by, assigned_at.
- sessions: id, profile_id, workout_id, workout_snapshot_json, started_at, finished_at, status.
- session_events: id, session_id, client_event_id UNIQUE, event_json, occurred_at.
- imports: id, import_batch_id, source_device, source_checksum, imported_at.

## Seguridad
- Activar RLS en toda tabla expuesta; denegar por defecto.
- GG: miembros adultos autorizados gestionan rutinas y perfiles de su familia; perfiles menores sin acceso autónomo a administración.
- HF: cada usuario solo accede a sus propios registros.
- Verificar políticas SELECT/INSERT/UPDATE/DELETE y aislamiento cruzado con pruebas negativas.
- Separar datos de ejercicio de cualquier dato médico sensible; minimizar datos personales de menores.

## Sincronización y migración
1. Exportar copia local original de Samsung y verificar que puede restaurarse.
2. Autenticación y esquema nuevo en entornos GG/HF aislados.
3. Subida inicial en modo previsualización: detectar duplicados mediante identificadores y checksum; no sobrescribir.
4. Conflictos de edición: revision + control optimista; ofrecer conservar ambas versiones.
5. Sesiones offline: cola local de eventos con client_event_id para reintentos idempotentes.
6. Confirmar en iPhone y Samsung lectura/escritura y restauración antes de activar sincronización.
7. Mantener rollback y no borrar datos locales hasta aceptación.

## Criterios de aceptación
- iPhone crea rutina; Samsung la ve tras sincronizar.
- Cada familiar ejecuta sesión sin alterar el historial de otro.
- HF no puede leer GG, ni viceversa.
- Dos ediciones simultáneas no se pisan silenciosamente.
- Sin conexión: sesión local recuperable y posterior sincronización sin duplicados.
- La versión estable 2.9.11 sigue operativa hasta aceptación explícita.
