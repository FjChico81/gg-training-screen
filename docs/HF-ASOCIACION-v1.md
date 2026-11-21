# HF · Asociación · Experiencia de clases colectivas

Estado general: **prototipo funcional aislado en rama de desarrollo**. No publicado, no integrado con las rutinas de producción, ni verificado en pantalla física.

## Objetivo

HF es el software específico de una asociación de entrenamiento híbrido que combina fuerza, carrera, ergómetros y trabajo funcional. El usuario de la pantalla es **el grupo**, mientras que el entrenador configura y controla la sesión desde un panel privado.

**Diferenciación GG/VECTOR:** GG/VECTOR no usa estas pantallas; los cambios se limitan a HF y al prototipo `hf-class-prototype.html`. No se modifica HPS, su código ni su infraestructura.

## Dos formatos de sesión

### A. Clase guiada

- Secuencia ordenada de ejercicios.
- TV: gran ejercicio actual, objetivo (reps, metros, tiempo), GIF cuando existe, cuenta atrás o cronómetro, ejercicio siguiente y progreso.
- Ejercicios de duración definida: avance automático al vencer el tiempo.
- Ejercicios por repeticiones o distancia: el entrenador marca el paso completado; no se presupone cuánto se tarda.
- Un descanso aparece exclusivamente como **paso explícito** con nombre DESCANSO y duración >0. No se insertan pausas automáticas por defecto.
- El ejemplo incluye carrera, fuerza, SkiErg, burpees y descanso programado.

### B. Circuito por estaciones

- Entre 2 y 8 estaciones en el prototipo, un grupo por estación, identificados A-H.
- Pantalla general: **todas las estaciones simultáneamente**, nombre del ejercicio, dosis, GIF cuando existe y grupo actual.
- Cronómetro **común** para el intervalo de trabajo.
- Al terminar el intervalo, si se ha programado un cambio >0 s, aparece la fase `CAMBIO DE ESTACIÓN`. En ella cada tarjeta indica qué grupo llega.
- Si el cambio =0, se pasa directamente al siguiente intervalo, sin pausa ni descanso ficticio.
- Después de cada intervalo los grupos se desplazan a la estación siguiente, con retorno de la última a la primera.
- Cada grupo completa todas las estaciones en cada vuelta. La sesión termina al cabo de `vueltas × número de estaciones` intervalos de trabajo.
- No se muestran biometrías individuales en la TV.

### Política temporal

- Diferenciar con claridad un tiempo **programado** (avance automático), un objetivo sin duración (avance del entrenador) y un **descanso explícito**.
- En la vista por estaciones, la transición programada es un periodo de desplazamiento. El sistema no la confunde con una fase de ejercicio.
- Pausar congela el tiempo y el cursor del ejercicio. Reanudar conserva ambos.
- Evitar saltos por doble pulsación o reanudaciones remotas duplicadas en la futura integración con base de datos.

## Prototipo realizado

Archivo: `hf-class-prototype.html`

Incluye:
- Selector de formato 01/02.
- Configurador de clase guiada con pasos `nombre | objetivo | segundos`, aceptando 0 para paso manual.
- Configurador de circuito `nombre | objetivo`, vueltas, tiempo de trabajo y cambio entre estaciones.
- Pantalla adaptativa oscura/naranja HF, modo presentación y botón de salida.
- Iniciar, pausar/reanudar, avanzar, reiniciar, aviso sonoro de transición.
- GIFs autorizados del repositorio compartido cuando corresponden; si no existe coincidencia, aparece un icono, nunca una supuesta demostración inventada.
- Cálculo del tiempo total y de los cambios de estación. Sin almacenamiento, acceso a cuentas ni comunicación con producción.

### Prueba simulada realizada (2026-11-21)

**12/12 comprobaciones de lógica superadas**, usando reloj simulado y DOM mínimo:
- Inicio guiado y cuenta atrás de 90 s.
- Vencimiento de fase, avance único y ausencia de descanso inventado.
- Descanso programado de 30 s y salida hacia SkiErg.
- Pausa/reanudación sin cambiar de ejercicio.
- Cambio de formato que reinicia su estado.
- Circuito trabajo 60 s → cambio 20 s → siguiente rotación.
- 4 estaciones × 3 vueltas = 12 intervalos, **940 s** de duración programada total (12 × 60 + 11 × 20).
- Validaciones de entrada, incluida prohibición de descanso a 0 s.
- Revisión sintáctica JS y ausencia de conectores a datos en el prototipo.

**Estas pruebas no sustituyen** un ensayo del navegador real en TV, iOS y Android. Son verificaciones de comportamiento en simulación, no evidencia de publicación ni de conectividad remota.

## Modelo de datos propuesto para la integración real

```ts
type Step = {
  id: string;
  kind: "exercise" | "rest";
  exerciseId?: string;
  name: string;
  target: string;
  durationSeconds: number | null; // null => avance manual
};
type GuidedClass = { id: string; title: string; type: "guided"; steps: Step[] };
type Station = { id: string; name: string; exerciseId?: string; target: string };
type StationsClass = {
  id: string;
  title: string;
  type: "stations";
  stations: Station[];
  rounds: number;
  workSeconds: number;
  transitionSeconds: number; // 0 => sin transición
};
type ClassRuntime = {
  sessionId: string;
  cursor: number;
  phase: "ready" | "work" | "rest" | "change" | "paused" | "finished";
  deadlineUtc: string | null;
  revision: number;
  updatedBy: string;
};
```

El modelo es **propuesto** y no se ha aplicado a la base de datos. El servidor será la fuente de verdad del control remoto; las órdenes se validarán y aplicarán de forma idempotente y con `revision` para evitar doble avance o escritura concurrente.

## Seguridad y sincronización pendiente

Para producción: pantalla pública con URL de solo lectura y token temporal limitado, separada de la administración; roles RLS exclusivos de HF; acceso del entrenador autenticado; sin claves de servicio en el navegador ni exposición de usuarios, correos o historiales. La pantalla debe ser capaz de reconectar y recuperar el estado desde HF, no de manejar la sesión como segundo escritor.

La futura sincronización TV ↔ móvil **no está implementada en este prototipo**. Tampoco lo están estaciones con número de grupos diferente del número de estaciones, bloques con descansos entre vueltas, variantes avanzadas, múltiples pantallas sincronizadas o informes individuales.

## Criterios previos a publicación

- [ ] Probar en televisor 16:9 la legibilidad desde el fondo de la sala.
- [ ] Probar en Samsung, iPhone y escritorio: iniciar, pausar, reiniciar, bloquear pantalla y reanudar.
- [ ] Comprobar volumen y permisos de audio, modo presentación y carga de GIFs con red lenta.
- [ ] Auditar reglas de cambios y descansos en límites (0 s, último intervalo, última vuelta).
- [ ] Implementar separación real de permisos y canal sincronizado exclusivo HF antes de permitir el control remoto.
- [ ] Integrar de forma controlada con la biblioteca y sesiones HF existentes sin alterar GG.
- [ ] Validar la separación GG/HF con tests de regresión.
- [ ] Solicitar autorización antes de cualquier despliegue en producción o migración de datos.

## Avance de la integración — 21/11/2026

- **Implementado en rama:** desde la portada HF (`index.html?app=hf`) se muestran dos accesos exclusivos de HF para abrir `hf-class-prototype.html?mode=guided` y `?mode=stations`. La portada GG/VECTOR no recibe esos accesos.
- **Implementado en rama:** navegación de regreso a HF desde el prototipo, controles locales del entrenador y GIFs alojados en `assets/technique/` dentro del mismo despliegue.
- **Probado por simulación:** 8/8 verificaciones de la lógica de modos, descanso programado, pausa/reanudación, cambio 0 s y 12 intervalos del circuito. También hay una suite de 7 pruebas Node en `tests/hf-class-prototype-smoke.cjs`, que aún debe ejecutarse en un entorno Node real.
- **Preparado, NO aplicado:** borrador de tabla HF para sesiones en directo en `db/hf-training/class-live-sessions-DRAFT-DO-NOT-APPLY.sql`. Incluye RLS para entrenador y cuenta específica de pantalla, revisión optimista y caducidad. Se requiere auditoría y prueba local de políticas antes de ejecución.
- **No implementado:** control entre iPhone y Samsung, autenticación y vinculación de la cuenta de pantalla, transmisión Realtime, recuperación multidispositivo, aislamiento definitivo del panel del entrenador, pruebas con TV real.
- **No publicado en producción:** las modificaciones permanecen fuera de `main`. Una preview automática del proyecto GG está disponible en Vercel para la rama; puede requerir inicio de sesión por protección del despliegue. Que Vercel indique `READY` no sustituye la validación visual ni funcional.

### Puertas de aceptación para sincronización real

1. Validar proyecto de destino **exclusivamente HF TRAINING**, esquema existente y copia de seguridad.
2. Crear un entorno aislado donde probar el SQL sin usar producción y ejecutar pruebas de permiso de entrenador, pantalla, terceros y usuarios anónimos.
3. Implementar una cuenta de pantalla de solo lectura distinta de la del entrenador, con vinculación revocable.
4. Usar `revision` y `last_command_id` para detectar conflictos. Un resultado de red incierto obliga a releer el estado, sin reenviar órdenes a ciegas.
5. Conectar la vista TV a eventos de solo lectura con reconsulta de instantánea tras reconexión.
6. Probar inicio, pausa, avance, pérdida de Wi-Fi, recuperación, latencia y caducidad entre iPhone y Samsung.
7. Integrar con la biblioteca HF y publicar solo después de la revisión y autorización correspondientes.
