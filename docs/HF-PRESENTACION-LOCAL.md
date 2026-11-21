# HF WEB · Presentación local de clases colectivas (v1)

Estado: **PREPARADO EN RAMA AISLADA, SIN PUBLICAR**, con pruebas automatizadas y validación visual física pendiente.

## Decisión de producto · 21/11/2026

HF admite dos usos del mismo motor de entrenamientos:

1. **Móvil con cable → TV:** HF corre en el móvil; la televisión duplica la pantalla del móvil por una conexión compatible (HDMI/USB-C según dispositivo). Se recomienda colocar el móvil horizontal y activar «Presentar clase». Los botones son compactos y se pueden ocultar/mostrar.
2. **iPad/tablet directamente:** HF corre en la tablet, sin teléfono emparejado. Los controles táctiles de iniciar, pausar, reanudar y avanzar están disponibles durante la presentación.

No se desarrolla vinculación de mando remoto ni sincronización en vivo entre móviles y pantallas para este caso. El trabajo anterior en la PR #22 queda **archivado como histórico, no fusionado**. Las decisiones de sincronización de **datos guardados** entre cuentas/dispositivos son otro objetivo y no son requisito para proyectar una clase.

## Implementación

Rama exclusiva: \`feature/hf-local-presentation-v1\`, creada desde \`main\` para evitar arrastrar tablas, roles, SQL o código del enlace remoto descartado.

- \`index.html?app=hf\` muestra dos entradas claras: **Clase guiada** y **Circuito por estaciones**. Tras elegir formato, se decide cómo mostrarlo. Solo se modifica \`setupHF()\` y la etiqueta condicional HF del modo TV; GG/VECTOR conserva el comportamiento.
- \`hf-class-display.html\` es la pantalla independiente y autocontenida: ejercicio actual y siguiente, GIF cuando exista, temporizador, objetivos, descansos solo si están programados, circuito de estaciones con grupos y rotaciones, sonido opcional, progreso.
- Modo espejo: layout compacto horizontal y mandos flotantes que pueden recogerse. La TV y el móvil muestran el **mismo contenido**; no se promete una interfaz privada distinta para el entrenador.
- Modo tablet: panel a pantalla completa o CSS equivalente y mandos táctiles inferiores grandes. Puede usarse sin ningún móvil conectado.
- CSS para iPhone sin Fullscreen API de elementos, usando clases y \`100dvh\`; se intenta Fullscreen cuando el navegador lo admite. En Safari del iPhone pueden verse barras del navegador. El usuario puede añadir HF a la pantalla de inicio según soporte de Safari.
- Diseño adaptativo para formato horizontal bajo, vertical y pantallas grandes; controles de salida visibles y avisos de audio configurables.
- Los GIFs se cargan desde copias alojadas en el repositorio autorizado \`assets/technique/\`. No acceder ni modificar la carpeta original de Google Drive.
- Sin necesidad de Supabase, Bluetooth, credenciales, cuenta especial de pantalla, servidor Realtime ni red entre dispositivos para ejecutar la clase en un único navegador.

## Limitaciones honestas

- Esta página de clase es todavía un **prototipo local**: al cerrarla o recargarla, la sesión no conserva el progreso. No confundirlo con el historial de entrenamientos guardados de la app.
- No se ha conectado aún el editor de rutinas guardadas de HF a la nueva pantalla colectiva. Es el siguiente paso de producto.
- No se ha probado la salida HDMI físicamente, ni tamaños de TV, orientación, Safari iPhone, iPadOS o tablet Android en dispositivos reales.
- Una pantalla conectada puede añadir bordes por la relación de aspecto del iPhone; la aplicación no controla el escalado del televisor.
- En iPhone Safari, \`Element.requestFullscreen()\` para elementos arbitrarios sigue sin estar plenamente disponible según WebKit. La vista CSS es el fallback; no afirmamos ausencia total de barras.
- Una tablet abierta con su propio navegador no recibe automáticamente datos del móvil salvo que se desarrolle aparte sincronización de rutinas en una cuenta HF.
- Mantener la pantalla despierta y una conexión estable de vídeo depende del dispositivo, ahorro energético, adaptador y navegador. No hay un bloqueo de pantalla despierta garantizado.

## Pruebas

- \`tests/hf-class-display-smoke.cjs\`: clase guiada, avance manual, cuenta atrás, pausas, descansos y 4×3 estaciones.
- \`tests/hf-device-modes-smoke.cjs\`: modos por URL, cambio de vista sin reiniciar sesión, mandos recogibles, fallback sin Fullscreen API y controles en ambos formatos.
- \`.github/workflows/hf-local-presentation.yml\`: ejecuta ambos módulos sin tocar datos personales, servicios externos o Supabase.
- Pendiente: capturas reales iPhone/TV/iPad/Android, legibilidad desde el fondo de la sala, audio y carga de GIFs a red lenta.

## Lista de aceptación antes de publicar

- [ ] Probar cable USB-C/HDMI o adaptador concreto con móvil y TV de la asociación.
- [ ] En iPhone, comprobar orientación horizontal, margen de barras de Safari, tocar mandos, ocultarlos y seguir leyendo el ejercicio en TV.
- [ ] En tablet, verificar control táctil con pantalla vertical y horizontal y cambios de modalidad.
- [ ] Verificar 2–8 estaciones, grupos, transición 0 segundos, descansos explícitos, alertas sonoras y GIF.
- [ ] Integrar la biblioteca de rutinas HF guardadas de forma aislada; no borrar ni sobrescribir datos locales.
- [ ] Ejecutar regresión GG/VECTOR y pruebas independientes HF.
- [ ] Publicar solo con autorización expresa de cambios de producción.

## Protección de proyectos

- **HPS absolutamente intocable**: no consultar, usar ni modificar ninguno de sus recursos (incluida Supabase de Dionisio).
- GG/VECTOR no debe sufrir alteraciones funcionales.
- No ejecutar migraciones SQL, cambios de producción, contratación, despliegues definitivos ni eliminación de datos.
- No eliminar los recursos de la PR anterior hasta acreditar que no afectan al producto. Los nuevos cambios están en rama limpia.

## Fuentes técnicas relevantes
- Apple, conexión de iPhone a HDMI por USB-C: https://support.apple.com/en-gb/105099
- Apple, adaptador HDMI con duplicación del dispositivo: https://www.apple.com/shop/product/mw5m3am/a/usb-c-digital-av-multiport-adapter
- WebKit, estado de Fullscreen API para elementos en iPhone: https://bugs.webkit.org/show_bug.cgi?id=fullscreen-ios
