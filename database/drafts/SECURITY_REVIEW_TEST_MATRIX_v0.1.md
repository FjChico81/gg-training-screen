# GG/HF · Revisión de seguridad de esquemas v0 y matriz de pruebas v0.1
Estado: REVISIÓN ESTÁTICA. No ejecutado, no probado en Supabase.
Destinos exclusivos:
- GG FAMILY: xnvnlmmwfpdlkolukhyh
- HF TRAINING: ydaqsmrfuwhqwqojrxyr

## Alcance y restricción
HPS intocable: no consultar ni utilizar ningún recurso de HPS. Este documento solo analiza los dos archivos de borrador en este repositorio GG/HF.
Archivos revisados: database/drafts/GG_FAMILY_schema_v0.sql y database/drafts/HF_TRAINING_schema_v0.sql.

## Hallazgos
S1 ALTO · Edición y sincronización aún no implementadas. Los dos borradores revocan UPDATE/DELETE. La primera entrega requiere una operación de actualización con control optimista de revision y comprobación de propietario. No conceder UPDATE directo indiscriminado: el cliente podría cambiar revision, owner_user_id o datos de control. Preparar una función transaccional específica con privilegios mínimos, verificar permisos EXECUTE y controles negativos, o una API de servidor autorizada.
S2 MEDIO · Integridad de asignaciones GG. workout_assignments comprueba por política RLS que el workout pertenece al usuario al insertar, pero la FK workout_id por sí sola no fuerza la coincidencia de propietario. Reforzar con clave única (id,owner_user_id) en workouts y FK compuesta (workout_id,owner_user_id) en assignments. Mantener RLS.
S3 ALTO · Falta de pruebas negativas de RLS. No dar por seguro el esquema sin simular dos usuarios distintos y anónimo para SELECT, INSERT, UPDATE y DELETE, además de accesos cruzados a perfiles y asignaciones.
S4 MEDIO · Separación de cuentas adultas y perfiles menores aún simplificada: el esquema GG v0 solo contempla un propietario adulto. No afirmar que existe acceso familiar multiadulto ni autenticación supervisada hasta diseñarlos.
S5 MEDIO · Persistencia y migración local. Antes de activar sincronización hay que exportar copia verificable del almacenamiento de Samsung, conservar identificadores, resolver duplicados y permitir rollback.
S6 MEDIO · Falta contrato de formato de blocks JSON y validación de tamaño; definir esquema compatible con editor v2.9.11 y límites de payload antes de permitir importación masiva.
S7 MEDIO · El borrador no incorpora sesiones, historial ni registros de FC. No presentarlos como operativos.
S8 MEDIO · Crear tablas no implica acceso REST: el asistente de creación de proyecto tenía opción de concesión automática desactivada. Verificar grants, exposición Data API y RLS exclusivamente en los dos destinos autorizados.

## Matriz de pruebas obligatorias
T01 Usuario A crea workout y puede leerlo: PASS esperado.
T02 Usuario B no puede leer workout de A: 0 filas esperado.
T03 Anónimo no puede leer workout de A: acceso denegado.
T04 Usuario B no puede crear workout con owner_user_id=A: denegado.
T05 Usuario A no puede alterar propietario ni revision arbitrariamente: denegado.
T06 Dos dispositivos con revision N: solo una actualización de N a N+1 se acepta; la otra recibe conflicto sin sobrescritura.
T07 Reintento de creación offline con mismo UUID no duplica rutina.
T08 GG: asignación a perfil de otro propietario denegada.
T09 GG: asignación de workout ajeno a perfil propio denegada.
T10 GG: menor sin credenciales adultas no accede a administración.
T11 HF: usuario B no ve rutinas de usuario A.
T12 GG y HF utilizan endpoints, claves publicables y sesiones de Auth diferentes.
T13 Backup local Samsung restaurable en entorno aislado.
T14 Aplicación GG/HF actual v2.9.11 permanece operativa sin cambios.
T15 Ninguna consulta, migración o cambio dirigido a HPS.

## Próxima implementación aislada
1. Revisar esquema de edición segura (función o API de servidor) y claves compuestas GG.
2. Preparar pruebas reproducibles en entorno de pruebas propio GG/HF, nunca HPS.
3. Validar permisos y datos de destino antes de cualquier operación.
4. Solo tras pruebas, solicitar autorización de migración inicial a GG y HF.
5. Primer hito: crear rutina iPhone y verla en Samsung. Luego perfiles, asignaciones, historial y offline robusto.

## Estado
Documento preparado en GitHub; sin SQL ejecutado, sin migraciones, sin cambios en producción.
