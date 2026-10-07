# Validación de la entrega · 6 de octubre de 2026

## Actualización del estudio · 7 de octubre de 2026

- `npm test`: 39 pruebas superadas, incluidas migración de configuraciones v2 anteriores, validación de los nuevos límites, tres modos de ratón mediante eventos simulados del detector y organización en lote sin pérdidas ni cambios parciales.
- `npm run test:ui`: 23 comprobaciones de regresión en Electron, sin errores JavaScript. Acciones, grupos, perfiles, persistencia, biblioteca, anillo real y atajos configurados.
- `npm run test:studio`: paneles fijos, conservación del DOM radial al seleccionar, arrastre desde círculos, búsqueda/doble clic/catálogo, movimiento a grupos y deshacer, paleta independiente, persistencia de modos, selección precisa, permanencia y cancelación, soltar con un movimiento pendiente, y tamaño mínimo de ventana.
- `npm run test:clipboard`: superada la regresión del inspector, espacios individuales, archivos/carpetas y captura en el anillo; persisten tras reiniciar. El envío nativo de Ctrl + V es una prueba optativa no ejecutada en esta actualización.
- Capturas revisadas: `artifacts/studio-updated.png`, `artifacts/studio-compact.png` y `artifacts/library-updated.png`.
- `npm run pack`: ejecutable actualizado generado. `node tests/studio.cjs --packaged`: las comprobaciones del estudio también pasan sobre `release/win-unpacked/HALO MENU.exe`.
- Corrección de arrastre: prueba de ratón real entre dos círculos y eventos dirigidos al fondo en las coordenadas del borde de un botón. Se comprueban intercambio sin pérdidas, fondo sin efecto, Alt para agrupar, entrada en grupos y deshacer.
- Orden por arrastre lateral: inserción antes/después en varias posiciones del círculo, línea y texto de destino, conservación de la biblioteca y reordenación dentro de un grupo con el anillo girado 90°.
- `npm run test:organize`: búsqueda por nombre sin tildes, resultados dentro de grupos plegados, despliegue con teclado, selección en lista/círculo, color y agrupación en lote, duplicación, traslado a biblioteca, rechazo completo al superar límites y deshacer. Capturas revisadas en `artifacts/organize-selection.png` y `artifacts/organize-search.png`.
- `node tests/organize-ui.cjs --packaged`: las mismas pruebas de organización pasan en el ejecutable actualizado de Windows.

Las pruebas usan perfiles temporales. Los nuevos modos nativos del ratón se comprueban con eventos simulados; no se han inyectado clics globales en las aplicaciones del usuario. Se han eliminado retrasos heredados de la animación y trabajo repetido del apuntado, pero no se afirma una mejora cuantificada de latencia ni se ha probado con todos los ratones o frecuencias de pantalla.

## Entrega anterior

Versión 0.1.0. Entorno comprobado: Windows x64, Electron 44.3.0.

- `npm test`: 6 pruebas superadas. Persistencia atómica, recuperación sin perder el archivo dañado, validación de importaciones, límites de pantalla con coordenadas negativas, doble pulsación y rechazo de repetición o secuencias caducadas.
- `npm run test:ui`: 10 comprobaciones superadas en Electron real. Arranque, aislamiento del renderer, obtención de iconos nativos, edición, reordenación, tema, grabación del atajo, overlay y navegación, rechazo IPC y persistencia tras reiniciar. Sin errores JavaScript del renderer.
- `npm run pack`: ejecutable Windows x64 generado en `release/win-unpacked/HALO MENU.exe`.
- `npm run test:native`, ejecutado también contra el ejecutable empaquetado: 4 comprobaciones superadas. Atajo global real, conflicto que conserva el anterior, doble pulsación nativa con rechazo de repetición al mantener la tecla y aviso recuperable de archivo inexistente.

Las pruebas de teclado inyectan Ctrl + Alt + F10/F11/F12 y emplean perfiles temporales. No modifican los ajustes de LINDE ni los del perfil habitual de HALO.

La interfaz se ha inspeccionado visualmente mediante capturas de Electron. Las capturas de `artifacts/` son material de prueba y pueden mostrar una animación en curso.

No verificado en dispositivos macOS ni Linux. No se han medido percentiles de latencia, uso prolongado de memoria ni rendimiento bajo carga. El diseño mantiene el overlay preparado, utiliza transiciones CSS, limita el número de acciones y cachea iconos; esto no sustituye las futuras mediciones de rendimiento. No se incluyen instaladores firmados ni actualizador automático.
