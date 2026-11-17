# GG Mobile iOS · Privacidad y límites de la versión de pruebas

**Documento técnico provisional, no política de privacidad para publicar en App Store.**

## Datos
La aplicación puede registrar:
- Pulsaciones recibidas de un sensor BLE compatible mientras el entrenamiento está activo.
- FC media por lecturas, máxima, segundos con señal válida y tiempo en zonas configuradas.
- Puntos de una curva de FC almacenados con muestreo reducido.
- Rutinas, resultados y anotaciones de entrenamiento.

## Tratamiento actual
- Los datos se guardan **localmente** en la instalación de la aplicación, mediante el almacenamiento de la WebView.
- El código preparado no los envía a HPS, Coach, Garmin ni servidores de terceros.
- Las copias de seguridad JSON son **archivos sin cifrar** y pueden contener datos fisiológicos. Guardarlas en un lugar privado y no compartirlas.
- Desinstalar la aplicación puede eliminar los registros locales. Antes, exportar una copia y comprobarla.
- La conexión Bluetooth usa el servicio estándar de FC; no recopila geolocalización.
- No se ha desarrollado lectura continua en segundo plano, cuentas de usuario ni sincronización entre dispositivos.

## Limitaciones y decisiones
- Datos ausentes no deben sustituirse por valores supuestos.
- El tiempo medido incluye solamente intervalos de lecturas válidas consecutivas, descartando pausas y huecos superiores a 10 segundos.
- Las zonas necesitan FC máxima configurada por el usuario; los umbrales iniciales son 60/70/80/90 % y pueden modificarse.
- Este sistema es para registro deportivo, no para diagnóstico ni alertas médicas.
- Antes de distribución pública, revisar protección de datos, información a los usuarios, condiciones de Apple y mecanismo de eliminación/exportación.

## Controles de aceptación antes de difundir
- Permisos Bluetooth explicados, aceptados y revocables por iOS.
- No se muestran las pulsaciones de un usuario en otra instalación.
- Restauración de copias históricas sin perder sesiones previas.
- Cierre y reapertura no atribuyen segundos ficticios a las zonas.
- Prueba real con Polar y al menos otro dispositivo BLE compatible.
