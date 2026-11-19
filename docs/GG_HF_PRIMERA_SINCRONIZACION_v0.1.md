# GG/HF · Primera sincronización multidispositivo · Contrato técnico v0.1
Estado: PREPARADO / DISEÑO, no implementado ni probado.
Fecha: 2026-11-19.

## Restricciones
- HPS completamente intocable, incluyendo cuenta y organización de Dionisio, Supabase, GitHub y Drive. No acceder a recursos ambiguos.
- Trabajar solo en FjChico81/gg-training-screen, rama de desarrollo autorizada.
- No consultar ni alterar Supabase hasta acreditar IDs de GG FAMILY y HF TRAINING por evidencia de sus propias pantallas y conexión limitada/operación expresamente dirigida.
- No modificar producción, borrar datos locales ni contratar servicios.
- Z1 blanca y BLE intactos.

## Entrega E2 mínima
1. Cuenta adulta GG: registro/inicio de sesión.
2. Rutinas GG: lectura, creación y edición autenticadas; conservar el formato de bloques de v2.9.11.
3. Samsung: tras iniciar sesión en la misma familia, descarga la rutina creada desde iPhone.
4. HF: configuración y autenticación separadas; nunca usar credenciales GG en HF.
5. Migración posterior, no inmediata: previsualización de los datos locales antes de subirlos.

## Modelo mínimo propuesto (cada proyecto independiente)
- workouts: id uuid, owner_user_id uuid, title text, blocks jsonb, revision integer, updated_at timestamptz, deleted_at timestamptz nullable.
- GG: family_profiles (id, owner_user_id, display_name, is_minor), assignments (workout_id, profile_id).
- HF: workouts privados por usuario; ampliar perfiles solo cuando exista necesidad.
- No mezclar GG/HF en una misma tabla ni reutilizar claves.
- La identidad autorizada debe derivar de auth.uid(), nunca de metadatos editables por cliente.

## Políticas RLS (criterios)
- RLS activado en cada tabla expuesta.
- SELECT/INSERT/UPDATE/DELETE limitados al propietario autenticado; UPDATE exige USING y WITH CHECK.
- Ningún usuario anónimo puede consultar entrenamientos privados.
- Pruebas negativas: usuario A no puede leer ni modificar rutinas de B.
- La cuenta administradora adulta gestiona perfiles menores sin credenciales individuales para ellos.

## Protocolo de sincronización
- Al crear rutina, asignar UUID estable y revision=1.
- Edición: actualizar solo si coincide revision anterior; ante conflicto, no sobrescribir.
- No borrar físicamente rutinas durante fase inicial: deleted_at con recuperación.
- Sin conexión: conservar edición local y mostrar 'Pendiente de sincronizar'; reintentar sin duplicar.
- No presentar una rutina como sincronizada hasta recibir confirmación del servidor.
- El navegador conserva copia local para uso temporal y recuperación.

## Matriz de aceptación
A1. iPhone crea rutina A; Samsung autenticada la ve al recargar/sincronizar.
A2. Samsung edita A; iPhone recupera nueva revisión.
A3. iPhone y Samsung editan A a la vez: conflicto explícito, sin pérdida silenciosa.
A4. Desconectar red, crear B, reconectar: B aparece una sola vez.
A5. Usuario diferente no puede ver A ni B.
A6. HF no accede a GG ni a la inversa.
A7. Los datos locales previos de Samsung permanecen intactos.
A8. BLE, zonas de FC, modo TV y sesiones existentes mantienen comportamiento.

## Puertas de seguridad previas a implementar
G1. Verificar desde pantalla GG/HF los identificadores exactos de ambos proyectos, sin abrir HPS.
G2. Verificar conexión de ChatGPT: autorización por acción no equivale a aislamiento técnico; nunca listar proyectos indiscriminadamente.
G3. Preparar SQL con RLS y pruebas negativas, revisar sin ejecutarlo.
G4. Exportar copia de Samsung y comprobar integridad.
G5. Probar en rama antes de desplegar.

## Estado
Documento creado en GitHub; ninguna tabla, cuenta de usuario ni sincronización creada mediante este documento.
