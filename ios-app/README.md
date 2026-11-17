# GG Mobile iOS · preparación (rama aislada)

**Estado:** integración Bluetooth nativa, registro cardíaco, zonas por usuario, historial y pantalla activa preparada. **Compila en la simulación iOS de GitHub Actions sin firmar**, pero todavía NO se ha instalado ni probado con el Polar real.

## Principios
- La versión web de GitHub Pages en `main` no se modifica.
- La app iOS reutilizará la interfaz web, pero el BLE nativo reemplazará al Web Bluetooth cuando se integre.
- Sin dependencias ni comunicación con HPS/Coach.
- No se envían pulsaciones a ningún servidor. FC media, máxima, cobertura de señal, tiempo por zonas y curva se guardan en el historial local.
- Perfil de zonas por instalación: FC máxima configurable y cuatro umbrales editables; sin FC máxima, las zonas no se calculan.
- Durante una pausa, pantalla oculta o pérdida de señal, no se inventan segundos de zonas.
- La pantalla activa usa un plugin nativo durante la sesión en marcha; al pausar/terminar se permite el bloqueo normal.
- Los datos locales de Safari no se transfieren automáticamente al contenedor iOS: usar copia/restauración JSON.

## Cuando esté disponible el Mac
1. Instalar **Xcode**, abrirlo y aceptar la licencia/componentes.
2. Instalar **Node.js 22 LTS** o versión compatible y comprobar `node --version`.
3. Clonar el repositorio y cambiar a `feature/gg-mobile-ios`.
4. Ejecutar en `ios-app`: `npm install` y después `npm test`.
5. Para crear el proyecto iOS por primera vez: `npm run ios:init` (genera `www`, añade iOS, configura el permiso Bluetooth en Info.plist y sincroniza).
6. Abrir con `npm run ios:open`, elegir el equipo de firma en Xcode y compilar primero en el iPhone propio.
7. Tras editar el código, usar `npm run ios:sync` antes de abrir o compilar de nuevo.
8. Seguir `docs/PRUEBAS_IPHONE.md` para validar Bluetooth, FC, zonas, pantalla activa, desconexión y restauración de datos.

El script `ios:configure` añade `NSBluetoothAlwaysUsageDescription` de forma idempotente. **No está previsto registrar pulsaciones en segundo plano**: la prioridad de esta fase es la lectura con la app abierta.

## Pruebas realizadas sin Mac
- Decodificador BLE separado y pruebas automatizadas sin hardware.
- Inyección del módulo nativo al HTML de compilación verificada a nivel de código.
- **Comprobado en GitHub Actions:** instalar dependencias, generar proyecto iOS, declarar permiso Bluetooth y compilar en simulador sin firma.
- **Pendiente:** configurar la firma propia en Xcode, instalar en iPhone, medir pulsaciones reales y probar comportamiento de pantalla, reconexión y persistencia.

## Notas
- Se usa Capacitor 7 como base inicial; comprobar compatibilidad de versiones de Node, Xcode y plugin antes de instalar.
- La firma gratuita de Apple puede limitar la duración de la instalación y no permite distribuir libremente a amigos.
- El identificador `es.ggtraining.mobile` es provisional y puede necesitar ajuste al firmar.
- No subir `node_modules`, `www` ni artefactos generados de Xcode.

## Documentos útiles
- `docs/PRIMER_ARRANQUE_MAC.md` — primera instalación con el Mac.
- `docs/PRUEBAS_IPHONE.md` — protocolo de aceptación con Polar.
- `docs/PRIVACIDAD_Y_DATOS.md` — tratamiento local de los datos fisiológicos.
- [Pruebas automáticas](https://github.com/FjChico81/gg-training-screen/actions/workflows/gg-ios-checks.yml) — JavaScript y compilación iOS sin firma.
