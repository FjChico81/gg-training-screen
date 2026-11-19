# GG + HF · ROADMAP MAESTRO v1.0
Fecha: 2026-11-18
Estado: planificación y fase 0 iniciada; sin despliegue ni migración.
Base: GG_HF_SYNC_ARCHITECTURE_v0.1.md

## Regla inviolable
HPS: no acceder, alterar ni reutilizar ningún proyecto Supabase, repositorio GitHub ni carpeta Drive de HPS. No asumir que el proyecto Supabase existente está disponible. No crear recursos con coste sin autorización.

## Meta
GG familiar: administrador adulto, perfiles familiares (incluidos menores gestionados por adulto), rutinas asignables, sesiones e historiales propios. HF: aplicación independiente para otros usuarios, con autenticación y datos separados. Código del motor reutilizable; versiones y despliegues independientes.

## Fases y puertas de aceptación
0. INVENTARIO Y RESGUARDO (en curso)
   - Identificar código desplegado, almacenamiento local, exportación/restauración y rutas GG/HF.
   - Obtener copia verificable de datos de Samsung ANTES de migrar.
   - Documentar dependencias y estrategia de rollback.
   - Aceptación: inventario y copia comprobada; ningún cambio HPS.
1. MOTOR + TV (rama feature/gg-tv-rest-v2-9-12; sin publicar)
   - Probar series, pausas, descansos cronometrados, híbridos, avisos y BLE.
   - Evitar insertar descansos no programados.
   - Aceptación: pruebas funcionales GG y HF en navegador y Samsung.
2. INFRAESTRUCTURA
   - Crear dos proyectos Supabase NUEVOS con autorización de costes y titularidad.
   - Diseñar y revisar esquema, RLS y pruebas negativas; claves secretas solo servidor.
   - Aceptación: usuarios cruzados no pueden leer/escribir datos ajenos.
3. IDENTIDAD
   - GG: cuenta(s) adultas y perfiles gestionados, sin login individual obligatorio para menores.
   - HF: cuentas individuales.
   - Aceptación: acceso correcto y aislamiento por rol y proyecto.
4. SINCRONIZACIÓN (primera entrega funcional)
   - Rutinas iPhone -> nube -> Samsung; revisiones optimistas y conflictos explícitos.
   - Sesiones offline con cola idempotente y reintentos seguros.
   - Aceptación: crear en iPhone, ver en Samsung, editar sin pérdidas y reconectar.
5. ASIGNACIÓN FAMILIAR GG
   - Asignar rutinas por perfil, registrar ejecuciones independientes.
   - Aceptación: dos familiares completan misma rutina y no mezclan historiales.
6. HISTORIAL + FC
   - Importación sin sobrescritura; FC media, máxima, tiempo por zonas, resumen.
   - Mantener límites y colores existentes salvo solicitud explícita.
   - Aceptación: métricas calculadas con muestras válidas y ausencia de datos indicada.
7. MODULARIZACIÓN Y EVOLUCIÓN INDEPENDIENTE
   - Motor compartido; configuraciones, UI, módulos y despliegues GG/HF separados.
   - Aceptación: publicar cambio exclusivo en GG sin alterar HF, y viceversa.
8. LANZAMIENTO CONTROLADO
   - Pruebas de restauración, privacidad, acceso, rendimiento y migración.
   - Aceptación: aprobación explícita y rollback probado.

## Secuencia de entregas
E0 inventario + respaldo; E1 TV estable; E2 login + sincronización de rutinas; E3 asignaciones e historial; E4 métricas + independencia modular.

## Riesgos
- El localStorage de Samsung no es accesible automáticamente desde iPhone.
- La duplicación Google Home muestra la misma pantalla, no una vista separada.
- iOS Chrome no garantiza BLE web.
- Dos proyectos Supabase pueden generar costes; confirmar plan antes de crearlos.
- El código actual de GG/HF comparte index.html; separación modular es trabajo pendiente.

## Acciones inmediatas (sin cambios de producción)
A. Auditar claves y formatos de exportación/restauración y alcance de perfiles HF.
B. Preparar matriz de pruebas para modo TV y descansos.
C. Pedir al usuario exportación de respaldo desde Samsung antes de cualquier migración.
D. No tocar HPS, Supabase existente, Drive original de GIFs ni main sin validación.
