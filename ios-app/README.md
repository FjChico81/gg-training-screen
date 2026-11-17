# GG Mobile iOS · preparación (rama aislada)

**Estado:** puente Bluetooth conectado a la interfaz en la compilación iOS; todavía NO se ha compilado en Xcode ni probado con el Polar real.

## Principios
- La versión web de GitHub Pages en `main` no se modifica.
- La app iOS reutilizará la interfaz web, pero el BLE nativo reemplazará al Web Bluetooth cuando se integre.
- Sin dependencias ni comunicación con HPS/Coach.
- No se envían pulsaciones a ningún servidor.
- Los datos locales de Safari no se transfieren automáticamente al contenedor iOS: usar copia/restauración JSON.

## Cuando esté disponible el Mac
1. Instalar **Xcode**, abrirlo y aceptar la licencia/componentes.
2. Instalar **Node.js 22 LTS** o versión compatible y comprobar `node --version`.
3. Clonar el repositorio y cambiar a `feature/gg-mobile-ios`.
4. Ejecutar en `ios-app`: `npm install` y después `npm test`.
5. Para crear el proyecto iOS por primera vez: `npm run ios:init` (genera `www`, añade iOS, configura el permiso Bluetooth en Info.plist y sincroniza).
6. Abrir con `npm run ios:open`, elegir el equipo de firma en Xcode y compilar primero en el iPhone propio.
7. Tras editar el código, usar `npm run ios:sync` antes de abrir o compilar de nuevo.
8. Seguir `docs/PRUEBAS_IPHONE.md` para validar Bluetooth, cambios de pantalla, desconexión y restauración de datos.

El script `ios:configure` añade `NSBluetoothAlwaysUsageDescription` de forma idempotente. **No está previsto registrar pulsaciones en segundo plano**: la prioridad de esta fase es la lectura con la app abierta.

## Pruebas realizadas sin Mac
- Decodificador BLE separado y pruebas automatizadas sin hardware.
- Inyección del módulo nativo al HTML de compilación verificada a nivel de código.
- **Pendiente:** instalar dependencias, generar proyecto de Xcode, compilar y comprobar con el Polar.

## Notas
- Se usa Capacitor 7 como base inicial; comprobar compatibilidad de versiones de Node, Xcode y plugin antes de instalar.
- La firma gratuita de Apple puede limitar la duración de la instalación y no permite distribuir libremente a amigos.
- El identificador `es.ggtraining.mobile` es provisional y puede necesitar ajuste al firmar.
- No subir `node_modules`, `www` ni artefactos generados de Xcode.
