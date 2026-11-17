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

## 2B. Perfil cardíaco y registro
- Antes de iniciar, entrar en ⚙ → Configurar FC máxima y zonas.
- Introducir la **FC máxima real del deportista**; en el caso del primer probador es 199 ppm, pero no se aplica a otras instalaciones.
- Comprobar que el porcentaje y la zona cambian conforme cambia la FC.
- Entrenar al menos diez minutos con el Polar conectado y finalizar normalmente.
- Revisar FC media, máxima, cobertura de señal y tiempo por zonas en el historial.
- Comprobar que el gráfico refleja las lecturas disponibles, sin atribuir puntos durante huecos.
- Repetir un tramo con la sesión pausada: esos segundos no deben sumarse a zonas.
- Hacer otra sesión sin sensor: debe guardarse sin FC y sin errores.

## 3. Robustez
- Desconectar manualmente; volver a conectar.
- Apagar el sensor durante una sesión: comprobar el aviso de pérdida de conexión.
- Volver a encender y reconectar.
- Probar en sesiones de fuerza y de circuito.
- Comprobar que la pantalla permanece activa durante el entrenamiento si la opción está habilitada; al pausar/terminar debe recuperar el bloqueo normal.
- Probar al bloquear/desbloquear la pantalla; no se garantiza lectura continua en segundo plano.

## 4. Datos
- En la app iOS, crear primero una **copia de seguridad de prueba**.
- Restaurar la copia JSON procedente de Safari solo después de comprobar la importación en la app nativa.
- Revisar que la importación no sustituye las rutinas existentes.
- No borrar datos originales de Safari.

## Criterio de aceptación mínimo
- Pulso real visible en entrenamiento al menos durante 10 minutos sin fallos.
- Desconexión y reconexión controladas; ningún fallo grave.
- Rutinas, historial y configuración cardíaca intactos tras cerrar y abrir.
- La copia JSON exportada después de registrar FC debe contener el resumen cardíaco del historial.
- No afecta a HPS/Coach ni a GitHub Pages.

**Todavía no se acredita:** lectura en segundo plano, métricas cardíacas históricas ni publicación en App Store.
