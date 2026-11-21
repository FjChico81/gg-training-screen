# HF WEB · Etapa B · Organización de clases, plantillas, favoritos e historial colectivo

Fecha: 21/11/2026. Estado: **IMPLEMENTADO EN DESARROLLO · SIN FUSIONAR NI PUBLICAR**.

## Alcance

Etapa B solicitada: simplificar el trabajo del entrenador mediante clases favoritas, plantillas reutilizables y organización del historial de clases colectivas. Se mantienen las decisiones anteriores: móvil→TV mediante duplicación por cable o uso directo en iPad/tablet; sin emparejamiento obligatorio entre dispositivos.

## Funcionalidades preparadas

**Favoritos.** Cada rutina guardada de HF incluye estrella ☆/★. Es un acceso directo no destructivo basado en el ID de la rutina ya existente; no se duplican sus ejercicios ni se altera su revisión de sincronización. La biblioteca permite ver únicamente las favoritas, y el panel HF ofrece accesos rápidos para presentarlas o abrirlas. Las favoritas se guardan por perfil HF local.

**Plantillas.** Desde el menú ⋯ de una rutina guardada se puede guardar una plantilla independiente, con nombre y categoría (Fuerza, Híbrido, Cardio, Movilidad, AMRAP, EMOM, FOR TIME, Intervalos, Otros). La plantilla conserva solo \`name\` y \`blocks[{name,items[]}]\`; excluye deliberadamente IDs de rutina, claves, credenciales, FC, metadatos de usuario y revisiones de nube. La plantilla mantiene una copia de los ejercicios originales, por lo que editar o eliminar la rutina original no transforma silenciosamente la plantilla. Se puede:

- Presentar una clase guiada desde la plantilla.
- Intentar adaptarla a estaciones con las mismas restricciones de compatibilidad/confirmación del motor HF.
- Usarla como base de **una rutina nueva** en el editor HF que ya existe. Nada se guarda en la biblioteca original hasta que el entrenador pulse «Guardar entrenamiento».
- Renombrar/reclasificar desde un formulario en línea.
- Eliminar **solo la plantilla**, mediante confirmación explícita; jamás se elimina automáticamente una rutina de origen o su historial.

**Historial colectivo.** Cuando termina una clase colectiva, se registra fecha/hora, título, modalidad, dispositivo/presentación, duración, progreso, si terminó normalmente o por orden manual y resultados globales de AMRAP/FOR TIME. No incluye nombres de alumnos ni datos personales de sus pulsómetros. Un \`runId\` UUID permite impedir duplicados si se intenta registrar dos veces el mismo resultado. Se guarda en un contenedor independiente del historial personal.

**Resiliencia del registro.** Al finalizar, la aplicación **guarda primero el resultado colectivo** y **solo tras confirmar el guardado elimina el checkpoint local** de la clase interrumpida. Si falla el almacenamiento, la copia de recuperación se mantiene y se muestra «Reintentar guardar». No se borra contenido antiguo por caducidad ni por un límite de tamaño: cuando se alcanza el límite, se informa y se mantiene el contenido existente.

**Exportación.** Botón «Exportar datos HF» para obtener un archivo JSON con favoritos, plantillas e historial colectivo **de ese perfil y navegador**. Esta exportación es independiente de la copia antigua de rutinas/historial personal de HF; **para conservar ambos conjuntos se necesitan ambas copias**. Aún no hay un importador automático de esta copia colectiva, por lo que no debe considerarse una solución integral de recuperación ante pérdida del dispositivo.

## Infraestructura y privacidad

- \`src/hf-class-organization.mjs\`: API pura de favoritos, plantillas, registro y exportación. Acepta un objeto \`Storage\` inyectado, sin conexión a redes ni Supabase.
- \`src/hf-organization-ui.mjs\`: interfaz HF con botones grandes, búsqueda, categorías, edición y consulta. Se usan nodos y \`textContent\`, nunca HTML insertado desde nombres de usuario.
- La página principal usa el \`appStorage\` existente del perfil HF; la presentación usa el prefijo equivalente \`hf:<perfil>:\`.
- La copia de recuperación de HF también lleva desde esta etapa el identificador del perfil que inició la clase. Se siguen admitiendo las copias antiguas de v2.9.63 (atribuidas al perfil Principal), **sin borrarlas ni migrarlas de manera destructiva**.
- Si una sesión interrumpida pertenece a otro perfil, se bloquea el acceso y el descarte desde ese perfil. La pantalla no debe revelar su título.
- **Una sola sesión colectiva recuperable por dispositivo/navegador**, sin sincronización en segundo plano entre perfiles o dispositivos.
- Las plantillas, favoritas y registros colectivos son exclusivamente **locales al navegador actual**. No se afirma que estén sincronizados mediante el servicio de rutinas personales HF.
- No se modifica ninguna tabla, RLS, credencial o infraestructura de Supabase.
- HPS absolutamente intocable; ninguna consulta/acceso/modificación de sus recursos.
- GG/VECTOR permanece aislado: la nueva interfaz se carga únicamente tras la guardia \`if(!isHF)return;\`; estilos con \`html[data-edition="hf"]\`.
- No se modifica la carpeta original de GIFs; la pantalla usa exclusivamente copias aprobadas.

## Seguridad y límites

- Máximo de 500 favoritos, 80 plantillas y 1000 entradas de historial; al llegar a los límites se rechazan las nuevas escrituras **sin eliminar las anteriores**.
- Se comprueban estructura, identificadores, categorías, longitud de texto y registros duplicados.
- Si un archivo local está dañado, no se inicializa de cero ni se reemplaza; la interfaz avisa.
- Se comprueba si hubo otra modificación local antes de guardar, pero \`localStorage\` **no proporciona transacciones atómicas entre pestañas**. Queda pendiente una solución formal a conflictos si HF llega a ofrecer edición compartida en vivo.
- Si el almacenamiento local se desactiva, alcanza la cuota o el usuario borra los datos del navegador, pueden perderse las plantillas y el historial no exportados. Debe mostrarse el error y conservarse la copia de sesión cuando sea posible.
- Los datos por perfil en un mismo navegador no equivalen a una separación criptográfica entre personas con acceso físico al dispositivo.

## Pruebas automáticas

- \`tests/hf-class-organization-smoke.mjs\`: aislamiento por perfil, no mutación de rutinas, plantillas, favoritos, idempotencia de historiales, errores no destructivos y exportación.
- \`tests/hf-organization-ui-smoke.mjs\`: selección de favoritas, acceso a plantillas, filtros, editor en línea y sintaxis de scripts de la página principal.
- \`tests/hf-stage-b-integration-smoke.cjs\`: simulación del cierre de una sesión con almacenamiento del historial **antes** de retirar la copia de recuperación; control de duplicados, errores, y aislamiento entre perfiles.
- \`.github/workflows/hf-stage-b.yml\` vuelve a ejecutar también todas las pruebas anteriores de formatos y recuperación.
- Los números definitivos de CI deberán contrastarse contra el último SHA; no se publicará alegando pruebas no ejecutadas.

## Estado antes de publicación

**Pendiente:**
1. Verificar CI del último commit y regresión completa de GG/VECTOR.
2. Probar manualmente el aspecto en móvil/tablet, incluido el ajuste de tarjetas y botones.
3. Probar el uso con rutinas reales representativas, almacenamiento lleno, exportación y varios perfiles.
4. Decidir formato de importación/restauración colectiva si se requiere una copia integral HF.
5. Solicitar autorización específica para fusionar y publicar la etapa B. No inferir autorización a partir del inicio del desarrollo.
6. Se mantiene aplazada la prueba física de conexión HDMI→TV hasta indicación del usuario.

**Versión oficial vigente al comenzar:** HF v2.9.63. Esta etapa no incrementa versión ni cambia producción.
