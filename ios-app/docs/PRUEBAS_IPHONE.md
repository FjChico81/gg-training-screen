# GG Mobile iOS · Protocolo de primera prueba

**Prerequisito:** compilar desde Xcode e instalar en el iPhone. La app web de Safari no es la versión nativa.

## 1. Arranque
- Confirmar que se muestra **GG MOBILE iOS · prototipo BLE**.
- Abrir rutinas e historial sin cerrar inesperadamente.
- Crear una rutina de prueba y verificar que se conserva al cerrar y abrir.

## 2. Permisos y sensor
- Encender el Polar Verity Sense en modo frecuencia cardíaca.
- Abrir Ajustes ⚙ → **Conectar pulsómetro Bluetooth**.
- Aceptar el permiso Bluetooth solicitado por iOS.
- Seleccionar el sensor y comprobar que aparecen ppm reales en la vista guiada.
- Confirmar que las ppm cambian con el esfuerzo y quedan en «--» cuando deja de llegar señal.
- No dar por válida la conexión por el mero mensaje «Conectado»: deben llegar lecturas.

## 3. Robustez
- Desconectar manualmente; volver a conectar.
- Apagar el sensor durante una sesión: comprobar el aviso de pérdida de conexión.
- Volver a encender y reconectar.
- Probar en sesiones de fuerza y de circuito.
- Probar al bloquear/desbloquear la pantalla; no se garantiza lectura continua en segundo plano.

## 4. Datos
- En la app iOS, crear primero una **copia de seguridad de prueba**.
- Restaurar la copia JSON procedente de Safari solo después de comprobar la importación en la app nativa.
- Revisar que la importación no sustituye las rutinas existentes.
- No borrar datos originales de Safari.

## Criterio de aceptación mínimo
- Pulso real visible en entrenamiento al menos durante 10 minutos sin fallos.
- Desconexión y reconexión controladas; ningún fallo grave.
- Rutinas e historial intactos tras cerrar y abrir.
- No afecta a HPS/Coach ni a GitHub Pages.

**Todavía no se acredita:** lectura en segundo plano, métricas cardíacas históricas ni publicación en App Store.
