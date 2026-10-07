# HALO MENU 0.2

### Actualización del editor · 7 de octubre de 2026

- **Organizar muchas acciones:** buscador del anillo por nombre, destino o tipo (Ctrl + F), sin distinguir tildes. Los resultados muestran su grupo; al limpiar la búsqueda se recupera el estado plegado. Cada grupo se puede plegar por separado o todos a la vez.
- **Selección múltiple:** «Seleccionar varias» o Ctrl + clic; marca desde la lista o el círculo. Agrupa acciones del mismo nivel, duplica con identificadores nuevos y sin repetir atajos directos, cambia sus colores o guarda el lote en la biblioteca. Un grupo seleccionado se mueve con su contenido; no se duplica una segunda vez por marcar también un hijo. «Marcar visibles» respeta la búsqueda. Ctrl + A marca las visibles en modo selección y Esc sale. Cada operación es un único paso de deshacer y se cancela entera si excede los límites.
- **Estudio fijo:** el círculo permanece visible; la lista y el inspector se desplazan por separado, también en una ventana de 1080 × 700.
- **Arrastrar desde el círculo:** suelta a un lado de otro círculo para insertar antes o después, siguiendo el orden del anillo: aparece una línea en el punto de inserción y un texto con el destino. Funciona también dentro de grupos y con el anillo girado. Suelta en el centro de otra acción para intercambiar sus posiciones; en el centro de un grupo para entrar en él (Mayús para intercambiar con el grupo). Alt + soltar sobre una acción crea un grupo con ambas. Para quitar del anillo, suelta en la biblioteca o en «Soltar aquí para quitar del anillo»; soltar en el fondo no retira acciones. Se mantienen los mínimos de dos acciones por anillo y una por grupo; Ctrl + Z deshace los movimientos.
- **Biblioteca desplegable:** ábrela desde el botón superior. Busca por nombre o destino, filtra por categoría y usa el doble clic o + para recuperar acciones. «Acciones preparadas» ofrece atajos y carpetas que puedes añadir y personalizar; el inspector de atajos también incluye combinaciones preparadas.
- **Paleta propia del círculo:** superficie, texto y selección independientes del editor, con cuatro paletas iniciales. Se conservan los colores individuales de cada acción. Los iconos a color mantienen sus tonos originales; el estilo Línea utiliza el color de texto elegido.
- **Movimiento:** grosor de borde, redondez, curva elástica/suave/lineal, secuencia de apertura y respuesta al apuntar independientes. El apuntado se agrupa por fotograma y la selección no reconstruye el círculo.
- **Más control:** mantener, un clic o doble clic con el botón del ratón; selección por dirección, precisión sobre el círculo o permanencia con tiempo configurable. La permanencia ejecuta automáticamente tras la espera, salvo al mantener un gesto o en la vista fijada. Rueda opcional para recorrer e Intro para elegir; espera de esquina configurable.

Los ajustes anteriores reciben los nuevos valores por defecto sin cambiar sus acciones, perfiles ni contenido del portapapeles. La aplicación que ya esté abierta necesita reiniciarse para cargar esta actualización.

Un anillo de acciones para el escritorio, con el lenguaje visual de LINDE y el gesto del Actions Ring de Logitech: **mantener, apuntar y soltar**.

## Abrir en Windows

Doble clic en el acceso directo **HALO MENU** de esta carpeta (abre `release/win-unpacked/HALO MENU.exe`). Para desarrollo usa **HALO MENU.bat**, que abre siempre el código fuente más reciente.

El atajo inicial es **Ctrl + Alt + Espacio** (⌘ + Alt + Espacio en macOS). «Probar el anillo» lo abre junto al cursor. La cruz del editor lo deja en la bandeja; «Salir de HALO» lo cierra del todo. Los ajustes de la versión 0.1 se migran solos.

## El anillo

- **Apuntar por dirección.** No hace falta llegar al círculo: basta con empujar el cursor hacia él. El sector entero se ilumina y una muesca en el centro marca la dirección. Un clic en cualquier punto del sector elige.
- **Mantener y soltar.** Con un botón del ratón (rueda o laterales) o manteniendo la combinación de teclado: el anillo aparece al pulsar, se apunta y se elige al soltar. Si se suelta sin moverse, se queda abierto para elegir con un clic. Volver al centro y soltar cancela.
- **Grupos y subgrupos.** Un círculo puede abrir un arco con hasta 12 acciones que brota de su sector (como en LINDE), y dentro, un subgrupo abre otro arco más afuera. Hasta 16 acciones en el anillo: con más, los sectores serían demasiado estrechos para apuntar.
- **Teclado.** Flechas o Tab para recorrer, Intro para elegir, 1–9 directo, Retroceso para volver del submenú, Esc para cerrar.
- **Cerca de los bordes**, el anillo se mete hacia dentro para caber entero; la etiqueta se coloca debajo o encima según haya sitio.

## Qué hace cada acción

Carpeta del sistema · **aplicación instalada** (lista del menú Inicio con sus iconos reales) o cualquier archivo o carpeta · página web · **atajo de teclado** (se envía a la aplicación activa, p. ej. Ctrl + Shift + T) · **pegar texto** (lo copia al portapapeles y pega) · **submenú** · abrir HALO.

## Portapapeles persistente

En **Acciones → Añadir espacio individual** se añade una acción suelta al anillo y se elige un espacio libre, sin crear ningún grupo. **Crear 5 espacios** sigue disponible como opción para añadir un grupo con cinco círculos. También puedes elegir **Portapapeles** en «Qué hace» de cualquier acción y asignar uno de los **12 espacios**, compartidos entre perfiles.

- **Guardar:** escribe texto y pulsa «Guardar texto», usa «Guardar portapapeles», «Elegir archivos…» o «Elegir carpetas…». También puedes arrastrar texto, archivos y carpetas a la zona del inspector, a la fila o al círculo de la vista previa. En el anillo real, apunta al círculo y pulsa **Ctrl + V**, haz **clic derecho** o suelta el contenido encima. Guardar reemplaza el contenido de ese espacio.
- **Usar:** pulsa el círculo para pegar en la aplicación anterior. Puedes configurar «Solo copiar» para pegar después con Ctrl + V, o «Copiar las rutas como texto». El botón «Copiar ahora para probar» permite recuperarlo desde el editor sin enviar teclas. La aplicación de destino debe aceptar ese contenido; fuera de Windows, el pegado automático necesita el módulo nativo.
- **Configuración ordenada:** «Contenido guardado» muestra lo asignado y permite elegir archivos, carpetas o texto. «Al pulsar el círculo» explica el modo actual y ofrece «Copiar ahora para probar» y «Pegar en una carpeta…». El número de espacio y el modo copia/referencia están en «Opciones avanzadas».
- **Pegar archivos en Windows:** coloca el ratón sobre la carpeta abierta del Explorador o el escritorio, invoca el anillo con tu atajo y pulsa el círculo. HALO conserva la ubicación bajo el ratón al abrir el menú; no usa la posición del círculo elegido. Si no reconoce una carpeta, solicita el destino. La copia se espera hasta terminar y los errores se muestran en un aviso. Si ya existe el nombre, crea «- copia» sin sobrescribir. No permite copiar una carpeta dentro de sí misma. Una carpeta guardada se pega completa, no solo su contenido. «Pegar en una carpeta…» permite elegir el destino desde el editor. Para pegar en otras aplicaciones, elige «Solo copiar» y usa Ctrl + V en la aplicación que acepte ese contenido.
- **Copia en HALO (recomendado):** conserva la versión del archivo o carpeta en el momento de guardarlo, aunque se mueva o borre el original. Las carpetas incluyen todos sus archivos, subcarpetas y carpetas vacías. Hasta 100 elementos seleccionados, 200 MB y 10.000 elementos interiores por operación. Para carpetas con enlaces o uniones, usa referencias al original.
- **Referencia al original:** guarda su ubicación y usa su versión actual. Si se mueve o desaparece, HALO pide volver a elegirlo. Cambiar el modo solo afecta a los archivos que guardes después.
- **Texto:** se guarda como texto plano, con saltos de línea, hasta 1.048.576 caracteres. «Cargar texto guardado» permite editarlo antes de volver a guardar.

El contenido sobrevive a los reinicios y se guarda en la carpeta `clipboard` junto a `settings.json`. Vaciar un espacio afecta a todos los círculos que lo usan; eliminar una acción o deshacer cambios del anillo no borra su contenido. Las copias anteriores se conservan en `clipboard/files` para no romper rutas que otras aplicaciones todavía tengan en su portapapeles; esta carpeta puede crecer. La exportación JSON de ajustes **no incluye los contenidos**: para una copia de seguridad completa conserva también la carpeta `clipboard`. Los textos y archivos se guardan localmente, sin cifrado adicional. La captura y copia de archivos al portapapeles está disponible en Windows; en otros sistemas puedes guardar referencias/copias y copiar sus rutas.

## Biblioteca y perfiles

- **Biblioteca**: acciones y aplicaciones preparadas fuera del anillo (hasta 40). «Añadir aplicaciones» deja elegir varias seguidas. Se meten en el anillo arrastrándolas a la lista o a la vista previa, con el botón + o con doble clic; la × de cada acción del anillo la devuelve a la biblioteca sin perderla.
- **Perfiles**: hasta 8 anillos distintos (por ejemplo, Trabajo, Juegos, Diseño). Uno nuevo empieza como copia del actual. Cada perfil puede tener su atajo, que lo activa y abre su anillo; hay además un atajo para pasar al siguiente perfil, y la bandeja del sistema permite cambiar de perfil. El aspecto y los gestos son comunes a todos.

## Personalización

- **Temas de LINDE**: Carbón, Medianoche, Papel, más Claro y Sistema. Acento con paleta o color libre.
- **Iconos**: los 418 iconos propios de LINDE, en versión línea o a color, con buscador en español; icono real del sistema para aplicaciones y archivos; o una **imagen propia** (se reduce a 128 px y viaja dentro de la configuración). **Color propio** por acción.
- **Estilo**: *Burbujas* (LINDE), *Anillo* (Logitech), *Tarta* (disco en sectores), *Cristal* o *Mínimo*; botones circulares o redondeados, con o sin bordes; tamaño del centro y cuánto crece el círculo al apuntar.
- **Medidas**: separación, tamaño de círculos e iconos, giro del anillo, opacidad, velo de fondo y sombra. Con muchas acciones el anillo se abre lo justo para que no se toquen.
- **Nombres**: al apuntar, en el centro, siempre visibles u ocultos; tamaño del texto. **Centro**: cerrar, logotipo o punto.
- **Movimiento**: Espiral (LINDE), Expansión, Florecer, Cascada, Rebote, Órbita, Caída, Zoom, Fundido o ninguno; duración de 0 a 800 ms. Respeta «reducir movimiento».
- **Activación**: una pulsación, doble pulsación o mantener y soltar; botón del ratón (rueda o laterales); doble toque de Ctrl, Alt o Mayús; esquina activa de la pantalla; y **atajo directo** por acción o grupo (un grupo se abre como anillo propio).
- **Pruébalo al momento**: todo se aplica al instante. «Ver en vivo» deja el anillo real abierto junto al editor y lo redibuja con cada cambio; en Atajo y gesto, el probador ilumina cada gesto que llega.

El editor guarda cada cambio al momento (Ctrl + S fuerza el guardado) y tiene **deshacer y rehacer** (Ctrl + Z / Ctrl + Y). La lista se reordena arrastrando; una acción se puede soltar dentro de un submenú. Si una acción está a medias (una dirección incompleta, una app sin elegir), se marca en la lista y el anillo sigue usando su última versión, pero **todo lo demás se aplica igualmente**. Si el sistema no acepta un atajo, se conserva el anterior.

## Gestos nativos

La doble pulsación, mantener y soltar, el botón del ratón y el envío de teclas usan `uiohook-napi` en procesos aislados: si fallan, el editor sigue abierto y muestra un aviso. El detector es pasivo: la aplicación activa también recibe la combinación o el botón (la rueda puede activar el desplazamiento automático en algunos navegadores; los laterales, «atrás» y «adelante»). Al enviar un atajo con «mantener», suelta también los modificadores antes de soltar la tecla. No se registra ni se envía nada de lo que escribes. En macOS necesita permiso de Accesibilidad; en Linux, X11. Esta entrega se valida en Windows.

## Desarrollo

```sh
npm start
npm test            # configuración, migración, submenús, geometría
npm run test:ui     # Electron real: editor, guardado, submenús, deshacer, anillo
npm run test:clipboard # Electron real: espacios, archivos de Windows y persistencia
npm run test:paste  # Transferencia real de archivos y carpetas al Explorador
npm run test:native # Windows: envía pulsaciones reales; ejecútalo sin usar el equipo
npm run pack        # regenera release/win-unpacked
npm run dist:win
```

`node scripts/import-linde-icons.cjs` vuelve a importar los iconos desde `Desktop/Linde`.

## Arquitectura

- `src/main/config.cjs`: modelo validado (versión 2), migración desde la 0.1, persistencia atómica y doble pulsación.
- `src/shared/geometry.js`: radios del anillo y de los arcos, compartidos por la ventana y la interfaz.
- `src/main/index.cjs`: ventanas, atajos, gesto mantener-y-soltar, acciones, iconos e IPC con origen verificado.
- `src/main/native-hook.cjs` / `native-keys.cjs`: detector de gestos y envío de teclas, aislados.
- `src/renderer/radial.js` + `ring.css`: el anillo (el mismo para el menú real y las vistas previas).
- `src/renderer/index.html`, `editor.js`, `style.css`: el editor con el diseño de Preferencias de LINDE.
- `backup/`: copia de la versión 0.1.

Fuente Outfit con licencia OFL (`src/renderer/assets/outfit-OFL.txt`). Iconos propios de LINDE. Los iconos del sistema se extraen en tiempo de ejecución.
# Halo-Menu
