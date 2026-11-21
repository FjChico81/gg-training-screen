# HF WEB · Rediseño de la navegación móvil

Fecha: 21/11/2026

Versión: **HF v2.9.65**.

## Problema detectado

En las capturas del móvil la pantalla inicial de HF muestra consecutivamente el encabezado, una explicación larga, el selector de clase, favoritos, plantillas, historial colectivo, perfil, creación de entrenamientos, historial individual, biblioteca de ejercicios, sincronización y lista de rutinas. La jerarquía dificulta llegar rápidamente a la función deseada y mezcla información individual con funciones de entrenador.

## Estructura propuesta e implementada

La portada tiene **tres pestañas principales**, en una barra táctil compacta bajo el logotipo HF:

1. **Inicio**: una sola pregunta breve «¿Qué quieres hacer hoy?» y dos accesos grandes a **Mis entrenamientos** y **Impartir una clase**. El acceso **Continuar clase** solo aparece aquí cuando existe una recuperación pendiente del perfil. El perfil activo se muestra en texto discreto.
2. **Mis entrenamientos**: acceso a **Preparar entrenamiento** y **Historial de sesiones** individual, filtros de búsqueda y tipo, y lista completa de rutinas guardadas con botones de abrir, presentar, favorito y opciones. **No** se muestran estas sesiones ni su estado vacío en Inicio.
3. **Clases**: **Clase guiada**, **Circuito por estaciones** y organizador colectivo en pestañas internas **Favoritos / Plantillas / Historial**. Las clases no se confunden con sesiones individuales.

**Ajustes (engranaje):** recoge Perfil, Añadir perfil, Sincronización HF y Biblioteca de ejercicios, junto con las herramientas técnicas originales (avisos, pantalla activa, pulsómetro, actualizaciones y copias de datos). El panel es desplazable, con anchura y resumen de sincronización adaptados a móvil.

## Implementación técnica

- Módulo aislado \`src/hf-mobile-navigation.mjs\` que se invoca **solo desde \`setupHF()\`**, protegido con \`if(!isHF)return;\`.
- El módulo **reubica nodos DOM existentes**: conserva IDs, enlaces, eventos, bibliotecas, datos y rutinas. No duplica el editor ni reemplaza el motor de entrenamiento.
- Si falta un componente necesario, el montaje se detiene sin mover nada y la distribución original sigue disponible (mejora progresiva).
- Los perfiles HF adicionales pueden carecer de sincronización en nube, por lo que ese apartado es **opcional**. La navegación no falla cuando se elimina del DOM en esos perfiles.
- Pestañas con roles \`tablist/tab/tabpanel\`, \`aria-controls\`, \`aria-selected\`, navegación con flechas y Home/End, y objetivos táctiles grandes.
- Pantalla móvil con una sola sección principal visible; en tablet/ordenador se aprovecha el espacio con cuadrículas y controles más amplios.
- Las plantillas e historial colectivo conservan sus pestañas internas dentro de la pestaña principal Clases.
- Estilos exclusivamente bajo \`html[data-edition="hf"]\` en \`assets/hf-association.css\`.
- No se modifica la lógica Bluetooth, las zonas cardíacas, los cronómetros, el contenido de las rutinas, las claves de almacenamiento ni Supabase.
- **GG/VECTOR** conserva su propia distribución y funcionalidades, sin utilizar este módulo.
- **HPS intocable**: ningún recurso HPS se ha consultado o modificado.

## Comportamiento de las páginas originales

Al abrir una rutina, editor, historial individual o biblioteca de ejercicios, se usa el sistema de vistas original. Al volver a \`library\`, permanece seleccionada la última pestaña de la navegación HF; no se reinicia necesariamente en Inicio.

El montaje es asíncrono y no bloquea la carga del motor: si el módulo no se puede descargar o ejecutar, HF conserva la antigua pantalla en lugar de impedir el uso.

## Validaciones

- \`tests/hf-mobile-navigation-smoke.mjs\`: estructura de tres pestañas, navegación por teclado, enlaces, movimiento no destructivo, separación de entrenamientos y clases, herramientas en Ajustes y compatibilidad con perfiles sin nube.
- Workflow \`.github/workflows/hf-mobile-navigation.yml\`: ejecuta también las baterías HF anteriores de entrenamiento, clases, recuperación, favoritos, plantillas e historial colectivo.

**Pendiente:** validación visual en Safari real/iOS, tablet Samsung y ordenador. No afirmar que esos dispositivos han sido probados si no hay evidencias.

## Estado de publicación

- HF v2.9.65 se publica mediante GitHub Pages al integrar el PR en `main`, con autorización de Chico.
- La versión anterior de HF es la v2.9.64. La numeración de VECTOR se mantiene en v2.9.71.
- La revisión visual en iPhone y tablet físicos queda pendiente.
