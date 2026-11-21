# HF · Asociación · Modelo de uso y primera personalización

Estado: **implementación visual inicial en rama de desarrollo**. No publicada ni validada en una pantalla real.

## 1. Qué es HF

HF es la aplicación independiente de una asociación de entrenamiento funcional híbrido. Una clase puede combinar fuerza, carrera, ergómetros (SkiErg, remo, bici, etc.), movimientos funcionales y descansos PROGRAMADOS. Una pantalla colectiva permite que los asistentes conozcan el trabajo actual y el siguiente paso.

La clase la administra una persona autorizada. Los datos personales, accesos de administrador y ajustes de usuario no deben mostrarse en la televisión pública.

## 2. Roles y superficies

| Superficie | Uso |
| --- | --- |
| Panel del entrenador | Preparar clases, elegir sesión, iniciar, pausar, avanzar, editar, consultar resultados |
| Pantalla de clase | Ejercicio actual, dosis o distancia, GIF, tiempo o cuenta atrás, siguiente ejercicio, descanso explícito y avisos sonoros |
| Usuarios participantes | Seguir la sesión sin necesidad de identificarse ante la pantalla pública |

**No confundir** "pantalla de clase" (interfaz de presentación) con el modo TV individual actual. Tampoco confundir una sesión grupal con guardar pulsaciones de un individuo.

## 3. Funcionalidad de la primera etapa

- Diferenciar la identidad de HF, la biblioteca de clases y el editor respecto a VECTOR.
- Adaptar el modo TV existente a una disposición de grupo, con ejercicio actual a mayor tamaño y tarjeta de próximo ejercicio.
- Mantener cronómetros, botones, GIFs y descansos existentes sin modificar la lógica del motor compartido.
- Ocultar la tarjeta de frecuencia cardíaca individual en la composición pública HF.
- Todos los cambios de estilo se limitan a `html[data-edition="hf"]`.

## 4. Limitaciones que continúan

- Todavía NO existe un canal de control remoto desde un teléfono hacia la pantalla. Cambiar la rutina en el móvil no significa controlar en vivo la sesión de la TV.
- La pantalla pública todavía utiliza la misma ruta de app; ocultar visualmente ajustes no constituye aislamiento de permisos. Se requiere una ruta/página de presentación con permisos separados antes del uso público real.
- No hay programación de varias estaciones simultáneas en esta etapa. El motor sigue un recorrido de ejercicios.
- El histórico actual no equivale a un registro individual por participante, ni está sincronizado en todas las superficies.
- Sin pruebas en un televisor real no puede declararse experiencia validada.

## 5. Siguientes entregas propuestas

1. **Pantalla pública aislada** con URL de solo presentación, sin gestión ni datos personales.
2. **Mando del entrenador** desde iPhone/Android con roles y sincronización HF exclusiva, sin duplicar estados al reconectar.
3. **Modo circuito por estaciones**, para grupos que rotan simultáneamente, y modo clase secuencial.
4. **Plantillas de entrenamientos HF** por objetivos, material disponible y tipo de clase.
5. **Ensayos** en TV 16:9 y 4K, tablet Samsung, iPhone y escritorio; volumen de avisos, visibilidad a distancia, reanudación y sin conexión.

## 6. Aceptación de esta rama visual

- [ ] HF muestra textos de asociación y llamada a "Pantalla de clase".
- [ ] En HF apaisado, el ejercicio actual destaca sobre el siguiente y el cronómetro.
- [ ] El modo de presentación de HF no muestra la FC individual.
- [ ] En GG/VECTOR no cambian textos ni aspecto visual.
- [ ] Se prueban temporizadores, descansos y GIFs en ambos productos.
- [ ] Se prueba la presentación en la pantalla física de la asociación.

No fusionar con `main` ni desplegar hasta completar las pruebas correspondientes.
