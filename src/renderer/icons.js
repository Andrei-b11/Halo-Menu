import { ICONS, COLOR_ICONS, TONES } from './linde-icons.js';

// Colores de cada familia en la versión «Linde color» (los del tema oscuro de LINDE). Los
// temas claros los oscurecen desde style.css con --li-<familia>.
const TONE = { doc: '#5aa2f0', canvas: '#a987ed', folder: '#e0a44f', kraft: '#d39a5f', task: '#6cbb95', link: '#4cc0bd', media: '#d786ba', star: '#e6c468', danger: '#ec6a5e', tools: '#8fa3c0', edit: '#f0955a', nav: '#8e9cf5' };
// Nombres que usa la interfaz y que en el juego de LINDE se llaman de otra forma.
const ALIAS = { close: 'x', up: 'chevron-up', down: 'chevron-down', left: 'chevron-left', right: 'chevron-right', arrow: 'arrow-right', orbit: 'radar', app: 'app-window', duplicate: 'copy-plus', back: 'arrow-left' };
const OWN = {
  // Dibujos que no están en LINDE, con su mismo trazo.
  ring: '<circle cx="11.25" cy="11.25" r="2.25"/><circle cx="11.25" cy="4.5" r="1.5"/><circle cx="17.1" cy="7.9" r="1.5"/><circle cx="17.1" cy="14.6" r="1.5"/><circle cx="11.25" cy="18" r="1.5"/><circle cx="5.4" cy="14.6" r="1.5"/><circle cx="5.4" cy="7.9" r="1.5"/>',
  power: '<path d="M11.25 3.75v6.75"/><path d="M6.65 6.4a6.75 6.75 0 1 0 9.2 0"/>',
  'grip':'<circle cx="8.25" cy="6" r=".75"/><circle cx="14.25" cy="6" r=".75"/><circle cx="8.25" cy="11.25" r=".75"/><circle cx="14.25" cy="11.25" r=".75"/><circle cx="8.25" cy="16.5" r=".75"/><circle cx="14.25" cy="16.5" r=".75"/>'
};
const resolve = name => (OWN[name] || ICONS[name]) ? name : (ALIAS[name] && (ICONS[ALIAS[name]] || OWN[ALIAS[name]]) ? ALIAS[name] : 'circle');

export function icon(name, variant = 'linea') {
  const key = resolve(name);
  const inner = OWN[key] || (variant === 'color' ? COLOR_ICONS[key] : ICONS[key]) || ICONS[key];
  const tone = TONES[key] || 'nav';
  const ink = variant === 'color' && !OWN[key] ? ' data-tone="' + tone + '" style="color:var(--li-' + tone + ',' + TONE[tone] + ')"' : '';
  return '<svg viewBox="1.25 1.25 20 20" overflow="visible" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + ink + '>' + inner + '</svg>';
}

export const iconNames = Object.keys(ICONS);

// Palabras en español para el buscador de iconos. El nombre en inglés también se busca.
const WORDS = {
  folder: 'carpeta', 'folder-open': 'carpeta abierta', folders: 'carpetas', download: 'descargas bajar', 'file-text': 'documento archivo texto', file: 'archivo', files: 'archivos',
  monitor: 'escritorio pantalla', globe: 'web navegador internet mundo', image: 'imagen foto', images: 'imágenes fotos', music: 'música audio', video: 'vídeo', film: 'película cine',
  settings: 'ajustes configuración engranaje', 'settings-2': 'ajustes', copy: 'copiar', 'clipboard-paste': 'pegar portapapeles', clipboard: 'portapapeles edición', scissors: 'cortar tijeras',
  undo: 'deshacer', redo: 'rehacer', search: 'buscar lupa', mail: 'correo email', calendar: 'calendario agenda', clock: 'reloj hora', timer: 'temporizador', terminal: 'terminal consola',
  code: 'código programar', 'code-xml': 'código html', camera: 'cámara foto captura', scan: 'captura escanear', 'app-window': 'aplicación ventana programa', home: 'inicio casa', house: 'casa inicio',
  star: 'estrella favorito', heart: 'corazón favorito', bookmark: 'marcador', trash: 'papelera borrar', 'trash-2': 'papelera', lock: 'bloquear candado', unlock: 'desbloquear', key: 'llave clave',
  user: 'usuario persona', users: 'usuarios equipo', phone: 'teléfono', 'message-circle': 'mensaje chat', send: 'enviar', printer: 'imprimir impresora', save: 'guardar', 'hard-drive': 'disco unidad',
  keyboard: 'teclado atajo', mouse: 'ratón', command: 'comando atajo', zap: 'rayo rápido', rocket: 'cohete lanzar', sparkles: 'magia ia brillo', lightbulb: 'idea bombilla', coffee: 'café pausa',
  'shopping-cart': 'compras carrito', wallet: 'cartera dinero', map: 'mapa', 'map-pin': 'ubicación lugar', plane: 'avión viaje', car: 'coche', gift: 'regalo', trophy: 'trofeo', flag: 'bandera',
  play: 'reproducir play', pause: 'pausa', sun: 'sol claro', moon: 'luna oscuro', palette: 'paleta color', paintbrush: 'pincel pintar', pen: 'bolígrafo escribir', pencil: 'lápiz editar',
  'sticky-note': 'nota', notebook: 'cuaderno', book: 'libro', 'book-open': 'libro leer', library: 'biblioteca', 'graduation-cap': 'estudios', briefcase: 'trabajo maletín', package: 'paquete caja',
  box: 'caja', archive: 'archivo guardar', inbox: 'bandeja entrada', link: 'enlace', 'external-link': 'abrir enlace externo', share: 'compartir', 'share-2': 'compartir', cloud: 'nube',
  database: 'base de datos', server: 'servidor', cpu: 'procesador', 'git-branch': 'git rama', bug: 'error bicho', wrench: 'herramienta llave', 'sliders-horizontal': 'ajustes controles',
  'layout-grid': 'cuadrícula apps', layers: 'capas', 'list-todo': 'tareas lista', 'square-check': 'tarea hecha', 'circle-check': 'hecho correcto', eye: 'ver ojo', 'eye-off': 'ocultar',
  'refresh-cw': 'actualizar recargar', 'rotate-ccw': 'girar', maximize: 'maximizar', minimize: 'minimizar', 'zoom-in': 'acercar zoom', 'zoom-out': 'alejar', type: 'texto escribir', text: 'texto',
  'text-cursor-input': 'escribir texto pegar', smile: 'emoji sonrisa', 'thumbs-up': 'me gusta', bell: 'notificación campana', radar: 'radar anillo', 'mouse-pointer-click': 'clic ratón'
};
export function searchIcons(query) {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!q) return iconNames;
  const plain = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return iconNames.filter(name => name.includes(q) || plain(WORDS[name] || '').includes(q));
}

// Lo que se dibuja en el círculo de una acción: imagen propia, después el icono del sistema
// (lo pide quien llama), y si no, el dibujo elegido.
export const glyph = (item, variant) => icon(item.icon || 'circle', variant);
