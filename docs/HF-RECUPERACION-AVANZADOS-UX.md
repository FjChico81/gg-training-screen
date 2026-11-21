# HF · Puntos 2, 3 y 4 · Recuperación, formatos avanzados y experiencia del entrenador

Fecha: 21/11/2026  
Estado: **IMPLEMENTADO EN RAMA DE DESARROLLO, NO FUSIONADO / NO PUBLICADO**.

## Alcance aprobado

Se priorizan:
- **Punto 2:** recuperación de clases interrumpidas.
- **Punto 3:** AMRAP, EMOM y FOR TIME en presentación colectiva.
- **Punto 4:** mejora de navegación y controles del entrenador.

El **punto 1 —pruebas físicas de iPhone → TV, iPad y tablet Android— queda expresamente aplazado** por decisión del usuario. Las comprobaciones automatizadas no sustituyen esos ensayos físicos.

## 2. Recuperación segura de sesiones

Implementación:
- \`src/hf-class-checkpoint.mjs\` realiza una copia de seguridad **exclusivamente local y de HF** mediante la clave \`hf:collective-class:checkpoint:v1\`.
- Al comenzar una sesión se genera un identificador aleatorio y se conserva una copia periódica (~2 segundos) y otra al pausar, ocultar pestaña o abandonar la página (según los eventos que alcance a emitir el navegador).
- Solo se conserva el estado de **una clase colectiva** por navegador/origen; si hay una copia previa distinta, no se sobrescribe silenciosamente.
- La copia contiene título, pantalla elegida, plan de ejercicios, rotaciones, resultados de bloques, cronómetros ya transcurridos y tiempo restante. **No contiene tokens, credenciales, datos de HR ni metadatos de nube**.
- Se valida formato, tamaño e índices; la copia tiene **caducidad de 36 horas**. Una copia inválida o caducada nunca se elimina automáticamente.
- Al volver a la página se ofrece **«Continuar clase en pausa»** o **«Descartar copia»**. La recuperación **nunca computa como entrenamiento el tiempo durante el cual la página estuvo cerrada**.
- El descarte exige confirmación explícita y elimina únicamente la clave local de la clase; no altera rutinas, historiales, perfiles, almacenamiento GG ni sincronización HF.
- En el inicio de HF aparece un acceso de recuperación cuando el navegador tiene una clase pendiente.
- Cuando la clase termina se retira su copia temporal; una clase finalizada no queda como sesión pendiente.

Limitaciones:
- La recuperación es **en el mismo navegador y dispositivo**, no entre móvil y tablet.
- En navegación privada, almacenamiento bloqueado o si el navegador descarta datos, **no se garantiza** recuperación; se muestra advertencia.
- Una clase colectiva no se incorpora aún al historial de entrenamiento personal ni sincroniza con servidores.
- En dispositivos compartidos, el título y la rutina de la copia local podrían ser visibles a la siguiente persona. Antes de cambiar de usuario, terminar la clase o descartar la copia local.

## 3. Motor avanzado colectivo

Se leen los **nombres de bloque generados por el editor original HF**, sin reescribir las rutinas:

- **AMRAP \`AMRAP 900s · Nombre\`:** los ejercicios se repiten por rondas; el reloj global jamás se reinicia al avanzar de ejercicio. Al alcanzar el límite se registran rondas completas y ejercicios parciales y se pasa al siguiente bloque.
- **EMOM \`EMOM · Nombre\`:** cada ronda contiene trabajo \`@segundos\` y recuperación explícita; se valida que sumen 60 segundos. El **descanso de la última ronda** se conserva porque así lo genera la versión existente de HF. Transiciones automáticas solo con tiempos programados.
- **FOR TIME \`FOR TIME 1200s · Nombre · Ronda 1/3\`:** se validan rondas consecutivas, un límite global compartido y la finalización por completar todos los ejercicios. \`0s\` equivale a **sin límite**; los ejercicios de distancia o repeticiones mantienen avance manual. Si expira el límite antes de completar, el bloque se marca incompleto.
- Se pueden combinar bloques avanzados y ejercicios convencionales dentro de una misma clase; segmentos especiales y límites se validan antes de mostrar.
- Las rutinas con títulos avanzados mal formados, rondas EMOM modificadas o descansos ambiguos **se rechazan**, con mensaje orientado a usar el editor/motor original HF.

Archivos:
- \`src/hf-advanced-class.mjs\`: conversión de bloques originales en segmentos con límites, validaciones de intervalos y protección ante datos manipulados.
- \`src/hf-workout-presenter.mjs\`: extensión del adaptador de solo lectura para transferir segmentos avanzados.
- \`hf-class-display.html\`: reloj global independiente del ejercicio actual, avance de rondas AMRAP, finalización FOR TIME, EMOM con intervalos exactos y resultados.

No se han modificado las rutinas guardadas, las revisiones de nube, las tablas ni el motor de ejecución individual.

## 4. Experiencia del entrenador

- Tarjeta «Continuar clase» en el inicio de HF **solo cuando hay una recuperación pendiente**.
- Mandos táctiles en pantalla, plegables para proyección HDMI, con controles de inicio/reanudación, pausa, siguiente y finalización **confirmada**.
- Resumen de sesión al finalizar; los bloques AMRAP y FOR TIME muestran sus resultados temporales.
- Atajos opcionales de ordenador: barra espaciadora para pausar/reanudar y flecha derecha para avanzar; se ignoran al escribir en formularios.
- La configuración de bloques avanzados no puede alterarse accidentalmente en la pantalla; debe editarse desde la rutina original HF.
- La recuperación se señala con claridad y el entrenador confirma su decisión antes de iniciar una clase diferente.

## Pruebas

Se añaden:
- \`tests/hf-class-checkpoint-smoke.mjs\`: validación de estado, caducidad, integridad, protección del almacenamiento independiente y prevención de sobrescrituras.
- \`tests/hf-recovery-ui-smoke.cjs\`: prueba de cierre y reapertura simulados, pausa obligatoria y descarte aislado.
- \`tests/hf-advanced-format-smoke.mjs\`: formatos exactos generados por el editor HF y rechazo de configuraciones ambiguas/manipuladas.
- \`tests/hf-advanced-runtime-smoke.cjs\`: simulación de límites globales AMRAP/FOR TIME, rotaciones, pausas, trabajo/descanso EMOM y cambios de bloque.
- \`.github/workflows/hf-advanced-recovery.yml\`: ejecución offline de estos y los tests previos de presentación y biblioteca.

Los resultados finales de CI se documentarán tras el último commit. No declarar pruebas en dispositivo real como superadas.

## Exclusiones y restricciones

- **HPS intocable.** Ningún acceso a repositorios, cuentas, Supabase, Google Drive, infraestructuras o documentos HPS.
- GG/VECTOR permanece con la misma funcionalidad; cambios en \`index.html\` exclusivamente dentro de \`setupHF\`, y módulos/estilos propios de HF.
- Sin migraciones, sin eliminación de rutinas/historiales, sin cambios de producción, sin gastos.
- La rama de desarrollo es \`feature/hf-recovery-advanced-ux-v1\`, derivada de \`main\`.
- No se publicará automáticamente en la aplicación oficial sin la autorización de lanzamiento correspondiente.

## Siguientes verificaciones

1. CI completo y revisión del diff exclusivo HF.
2. Ensayo de clases completas de los tres formatos, interrupciones y retorno en varios navegadores (manual/físico, pendiente).
3. Validación del punto 1 cuando el usuario decida retomarlo.
4. Numeración de versión HF nueva y autorización de publicación.
