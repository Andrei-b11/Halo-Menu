# Validación de la entrega · 6 de octubre de 2026

Versión 0.1.0. Entorno comprobado: Windows x64, Electron 44.3.0.

- `npm test`: 6 pruebas superadas. Persistencia atómica, recuperación sin perder el archivo dañado, validación de importaciones, límites de pantalla con coordenadas negativas, doble pulsación y rechazo de repetición o secuencias caducadas.
- `npm run test:ui`: 10 comprobaciones superadas en Electron real. Arranque, aislamiento del renderer, obtención de iconos nativos, edición, reordenación, tema, grabación del atajo, overlay y navegación, rechazo IPC y persistencia tras reiniciar. Sin errores JavaScript del renderer.
- `npm run pack`: ejecutable Windows x64 generado en `release/win-unpacked/HALO MENU.exe`.
- `npm run test:native`, ejecutado también contra el ejecutable empaquetado: 4 comprobaciones superadas. Atajo global real, conflicto que conserva el anterior, doble pulsación nativa con rechazo de repetición al mantener la tecla y aviso recuperable de archivo inexistente.

Las pruebas de teclado inyectan Ctrl + Alt + F10/F11/F12 y emplean perfiles temporales. No modifican los ajustes de LINDE ni los del perfil habitual de HALO.

La interfaz se ha inspeccionado visualmente mediante capturas de Electron. Las capturas de `artifacts/` son material de prueba y pueden mostrar una animación en curso.

No verificado en dispositivos macOS ni Linux. No se han medido percentiles de latencia, uso prolongado de memoria ni rendimiento bajo carga. El diseño mantiene el overlay preparado, utiliza transiciones CSS, limita el número de acciones y cachea iconos; esto no sustituye las futuras mediciones de rendimiento. No se incluyen instaladores firmados ni actualizador automático.
