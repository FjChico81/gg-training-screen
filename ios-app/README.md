# GG Mobile iOS · preparación (rama aislada)

**Estado:** estructura inicial preparada; NO es todavía una aplicación compilada ni probada con el Polar.

## Principios
- La versión web de GitHub Pages en `main` no se modifica.
- La app iOS reutilizará la interfaz web, pero el BLE nativo reemplazará al Web Bluetooth cuando se integre.
- Sin dependencias ni comunicación con HPS/Coach.
- No se envían pulsaciones a ningún servidor.
- Los datos locales de Safari no se transfieren automáticamente al contenedor iOS: usar copia/restauración JSON.

## Cuando esté disponible el Mac
1. Instalar Xcode desde App Store, abrirlo una vez y aceptar sus componentes/licencia.
2. Instalar Node.js LTS (y herramientas de línea de comandos si las pide Xcode).
3. Clonar el repositorio y cambiar a `feature/gg-mobile-ios`.
4. `cd ios-app && npm install && npm run build:web`.
5. `npx cap add ios` (primera vez); `npm run ios:sync`; `npm run ios:open`.
6. Configurar en Xcode el equipo de firma y la descripción de uso de Bluetooth (`NSBluetoothAlwaysUsageDescription`: «GG Mobile utiliza Bluetooth para mostrar las pulsaciones de tu sensor durante el entrenamiento»).
7. **Pendiente antes de la prueba real:** conectar `src/heart-rate-bridge.js` con la UI web mediante un bundle y una interfaz común de FC, añadir permisos nativos y probar la compilación. No asumir que el módulo está activo simplemente por existir.
8. Probar primero conexión, desconexión, pérdida de señal, reanudación y segundo sensor; después registro de FC y zonas configurables.

## Notas
- Se usa Capacitor 7 como base inicial; comprobar compatibilidad de versiones de Node, Xcode y plugin antes de instalar.
- La firma gratuita de Apple puede limitar la duración de la instalación y no permite distribuir libremente a amigos.
- El identificador `es.ggtraining.mobile` es provisional y puede necesitar ajuste al firmar.
- No subir `node_modules`, `www` ni artefactos generados de Xcode.
