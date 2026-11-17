# GG Mobile iOS · Primera sesión con el MacBook

Esta guía es para el propietario del proyecto. **No necesitas hacerlo antes de tener el Mac.**

## Preparar el equipo
1. Instala **Xcode** desde la App Store y ábrelo una vez para aceptar la licencia.
2. Instala **Node.js 22 LTS** desde https://nodejs.org/ si no está instalado.
3. Confirma que Xcode incluye las herramientas de línea de comandos y CocoaPods.
4. Abre Terminal. Comprueba `node --version`, `xcodebuild -version` y `pod --version`.

## Traer el código
1. Abre Visual Studio Code o Terminal.
2. Clona `https://github.com/FjChico81/gg-training-screen.git`.
3. Selecciona la rama **feature/gg-mobile-ios**; la rama principal es la aplicación web estable.
4. Abre la carpeta `ios-app` de esa rama.
5. Ejecuta `npm install`, después `npm test` y después `npm run ios:init` (**solo la primera vez**).
6. Ejecuta `npm run ios:open` para abrir Xcode.

## Primera instalación en el iPhone
1. Conecta el iPhone al Mac por cable y desbloquéalo.
2. En Xcode, selecciona el destino iPhone y configura tu equipo de firma en **Signing & Capabilities**.
3. Si el identificador `es.ggtraining.mobile` no está disponible, cámbialo a un identificador propio.
4. Compila e instala desde Xcode. iOS puede requerir confiar en el desarrollador o activar el modo de desarrollador.
5. La app debe mostrar **GG MOBILE iOS · prototipo Bluetooth**. Comprueba que no estás abriendo Safari.
6. Antes de restaurar datos personales, crea una rutina de prueba para verificar el almacenamiento nativo.
7. Configura tu FC máxima y zonas en ⚙, conecta el sensor y sigue el protocolo `docs/PRUEBAS_IPHONE.md`.
8. Restaura la copia JSON de Safari y confirma el historial. **No borres la copia original.**

## Desarrollo posterior
- Para reconstruir después de cambiar el código: `npm run ios:sync` y recompila desde Xcode.
- La firma gratuita de Apple puede caducar y no sirve para una distribución general entre amigos.
- La compilación automática de GitHub comprueba el código iOS sin firma, pero **no instala nada en tu teléfono**.
- Si algo falla, conserva la salida literal de Terminal/Xcode y no borres directorios ni datos sin analizar el error.
