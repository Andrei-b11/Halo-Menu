const fs = require('node:fs');
const path = require('node:path');

// Todo lo que se puede elegir, con sus límites. La validación, la migración y los valores
// por defecto salen de estas tablas: añadir un ajuste es añadir una línea.
const CHOICES = {
  theme: ['carbon', 'midnight', 'paper', 'light', 'system'],
  style: ['bubbles', 'ring', 'pie', 'glass', 'minimal'],
  shape: ['circle', 'squircle'],
  animation: ['spiral', 'expand', 'bloom', 'cascade', 'pop', 'orbit', 'drop', 'zoom', 'fade', 'none'],
  labels: ['hover', 'always', 'center', 'none'],
  iconStyle: ['linea', 'color'],
  hub: ['close', 'logo', 'dot'],
  position: ['cursor', 'center'],
  mouse: ['none', 'middle', 'back', 'forward'],
  modifierTap: ['none', 'Control', 'Alt', 'Shift'],
  hotCorner: ['none', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
};
const RANGES = {
  duration: [0, 800], radius: [60, 220], size: [36, 80], iconScale: [30, 80], opacity: [30, 100],
  veil: [0, 100], shadow: [0, 100], rotation: [-180, 180], labelSize: [9, 16], hubSize: [28, 96], aimScale: [100, 135]
};
const SWITCHES = ['nativeIcons', 'closeOnBlur', 'pointer', 'itemBorder'];
const TYPES = ['system', 'folder', 'path', 'url', 'settings', 'keys', 'text', 'group'];
const SYSTEM_FOLDERS = ['home', 'downloads', 'desktop', 'documents', 'pictures', 'music', 'videos'];
// Límites pensados para que el anillo siga siendo cómodo: con más de 16 los sectores son tan
// estrechos que apuntar deja de ser un gesto, y más de dos niveles de grupos se pierden.
const MAX_ITEMS = 16, MAX_CHILDREN = 12, MAX_LEVEL = 2, MAX_IMAGE = 400000, MAX_PROFILES = 8, MAX_LIBRARY = 40;
const MODIFIER = '(?:CommandOrControl|Control|Command|Alt|Shift|Super)';
const KEY = '(?:[A-Z0-9]|Space|F(?:[1-9]|1[0-9]|2[0-4]))';
const GLOBAL_SHORTCUT = new RegExp('^(?:' + MODIFIER + '\\+)+' + KEY + '$');
// Las teclas que una acción puede simular: con nombre de uiohook para poder enviarlas.
const SEND_KEYS = new RegExp('^(?:' + MODIFIER + '\\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PrintScreen)$');

function defaults() {
  return {
    version: 2, theme: 'carbon', accent: '#ed4c50',
    style: 'bubbles', shape: 'circle', animation: 'spiral', duration: 320,
    radius: 96, size: 50, iconScale: 46, opacity: 96, veil: 80, shadow: 55, rotation: 0,
    labels: 'hover', labelSize: 11, iconStyle: 'color', hub: 'close', hubSize: 42, aimScale: 112,
    pointer: true, itemBorder: true, nativeIcons: true, closeOnBlur: true, position: 'cursor',
    shortcut: { accelerator: 'CommandOrControl+Alt+Space', mode: 'single', interval: 350 },
    mouse: 'none', modifierTap: 'none', hotCorner: 'none', nextProfileKey: '',
    // Perfiles: anillos guardados. El activo vive en `items`; los demás guardan los suyos.
    profiles: [{ id: 'main', name: 'Principal', icon: 'ring', hotkey: '', items: null }], activeProfile: 'main',
    // Biblioteca: acciones preparadas que no están en el anillo, para meterlas cuando haga falta.
    library: [
      { id: 'lib-music', label: 'Música', type: 'system', target: 'music', icon: 'music', color: '' },
      { id: 'lib-videos', label: 'Vídeos', type: 'system', target: 'videos', icon: 'video', color: '' },
      { id: 'lib-capture', label: 'Captura de pantalla', type: 'keys', target: 'Super+Shift+S', icon: 'scan', color: '' },
      { id: 'lib-newtab', label: 'Nueva pestaña', type: 'keys', target: 'CommandOrControl+T', icon: 'square-plus', color: '' },
      { id: 'lib-closetab', label: 'Cerrar pestaña', type: 'keys', target: 'CommandOrControl+W', icon: 'x', color: '' }
    ],
    items: [
      { id: 'files', label: 'Explorador', type: 'system', target: 'home', icon: 'folder', color: '' },
      { id: 'downloads', label: 'Descargas', type: 'system', target: 'downloads', icon: 'download', color: '' },
      { id: 'documents', label: 'Documentos', type: 'system', target: 'documents', icon: 'file-text', color: '' },
      { id: 'web', label: 'Navegador', type: 'url', target: 'https://www.google.com', icon: 'globe', color: '' },
      { id: 'edit', label: 'Edición', type: 'group', target: '', icon: 'clipboard', color: '', items: [
        { id: 'copy', label: 'Copiar', type: 'keys', target: 'CommandOrControl+C', icon: 'copy', color: '' },
        { id: 'paste', label: 'Pegar', type: 'keys', target: 'CommandOrControl+V', icon: 'clipboard-paste', color: '' },
        { id: 'undo', label: 'Deshacer', type: 'keys', target: 'CommandOrControl+Z', icon: 'undo', color: '' },
        { id: 'redo', label: 'Rehacer', type: 'keys', target: 'CommandOrControl+Y', icon: 'redo', color: '' }
      ] },
      { id: 'desktop', label: 'Escritorio', type: 'system', target: 'desktop', icon: 'monitor', color: '' },
      { id: 'pictures', label: 'Imágenes', type: 'system', target: 'pictures', icon: 'image', color: '' },
      { id: 'settings', label: 'Configurar', type: 'settings', target: '', icon: 'settings', color: '' }
    ]
  };
}

// La versión 1 guardaba menos cosas y con otros nombres. Se traduce a la 2 sin perder
// acciones; lo que no existía toma el valor por defecto. Una 2 anterior a un ajuste nuevo
// también lo recibe con su valor por defecto.
const V1_ICONS = { app: 'app-window', file: 'file-text' };
function migrate(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.version === 2) {
    const base = defaults(), next = { ...value };
    for (const key of Object.keys(base)) if (next[key] === undefined) next[key] = base[key];
    return next;
  }
  if (value.version !== 1) return value;
  const next = { ...defaults(), ...value, version: 2 };
  next.theme = value.theme === 'charcoal' ? 'carbon' : value.theme;
  next.labels = value.labels === false ? 'none' : 'hover';
  next.iconStyle = 'linea';
  for (const [key, [min, max]] of Object.entries(RANGES)) if (Number.isFinite(next[key])) next[key] = Math.min(max, Math.max(min, next[key]));
  next.items = Array.isArray(value.items) ? value.items.map(item => ({ ...item, icon: V1_ICONS[item?.icon] || item?.icon, color: '' })) : value.items;
  return next;
}

// Valida una acción y su contenido. `level` es 0 en el anillo, 1 dentro de un grupo y 2
// dentro de un subgrupo; solo puede haber grupos hasta el nivel 1.
function validateItem(item, ids, level, lenient) {
  const fail = message => { throw new Error(message); };
  if (!item || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) fail('Identificador de acción no válido.');
  if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 50) fail('Cada acción necesita un nombre de hasta 50 caracteres.');
  const where = '«' + item.label.trim() + '»: ';
  if (!TYPES.includes(item.type)) fail(where + 'tipo de acción no válido.');
  if (item.type === 'group' && level >= MAX_LEVEL) fail(where + 'solo caben dos niveles de grupos.');
  if (typeof item.target !== 'string' || item.target.length > 4096 || item.target.includes('\0')) fail(where + 'destino no válido.');
  if (item.type === 'system' && !SYSTEM_FOLDERS.includes(item.target)) fail(where + 'carpeta de sistema no válida.');
  if (item.type === 'path' && !path.isAbsolute(item.target)) fail(where + 'elige una aplicación, archivo o carpeta.');
  if (item.type === 'folder' && !path.isAbsolute(item.target)) fail(where + 'elige una carpeta.');
  if (item.type === 'url') { try { const url = new URL(item.target); if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw Error(); } catch { fail(where + 'introduce una dirección http o https válida.'); } }
  if (item.type === 'keys' && !SEND_KEYS.test(item.target)) fail(where + 'graba una combinación de teclas.');
  if (item.type === 'text' && !item.target.trim()) fail(where + 'escribe el texto que se pegará.');
  if (typeof item.icon !== 'string' || !/^[a-z0-9-]{1,48}$/.test(item.icon)) fail(where + 'icono no válido.');
  const color = item.color ?? '';
  if (color !== '' && !/^#[\da-f]{6}$/i.test(color)) fail(where + 'color no válido.');
  const image = item.image ?? '';
  if (image !== '' && (typeof image !== 'string' || image.length > MAX_IMAGE || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))) fail(where + 'imagen no válida.');
  const hotkey = item.hotkey ?? '';
  if (hotkey !== '' && (typeof hotkey !== 'string' || !GLOBAL_SHORTCUT.test(hotkey))) fail(where + 'atajo directo no válido.');
  const clean = { id: item.id, label: item.label.trim(), type: item.type, target: item.type === 'group' || item.type === 'settings' ? '' : item.target, icon: item.icon, color };
  if (image) clean.image = image;
  if (hotkey) clean.hotkey = hotkey;
  const mine = new Set([item.id]);
  if (item.type === 'group') {
    if (!Array.isArray(item.items) || item.items.length > MAX_CHILDREN) fail(where + 'un grupo lleva entre 1 y ' + MAX_CHILDREN + ' acciones.');
    const seen = new Set([...ids, item.id]);
    clean.items = [];
    for (const kid of item.items) {
      const result = guarded(() => validateItem(kid, seen, level + 1, lenient), kid, lenient);
      if (!result) continue;
      clean.items.push(result.item);
      for (const id of result.ids) { seen.add(id); mine.add(id); }
    }
    if (!clean.items.length) fail(where + 'un grupo necesita al menos una acción completa.');
  }
  return { item: clean, ids: mine };
}
// En modo tolerante, una acción a medias no tumba el guardado: se aparta y se anota.
function guarded(run, item, lenient) {
  if (!lenient) return run();
  try { return run(); } catch (error) { lenient.issues.push({ id: item?.id, message: error.message }); return null; }
}

function validateConfig(input, lenient) {
  const fail = message => { throw new Error(message); };
  const value = migrate(input);
  if (!value || value.version !== 2) fail('Formato de configuración no compatible.');
  const c = defaults();
  for (const [key, choices] of Object.entries(CHOICES)) { if (!choices.includes(value[key])) fail('Valor no válido: ' + key); c[key] = value[key]; }
  if (!/^#[\da-f]{6}$/i.test(value.accent)) fail('Color no válido.'); c.accent = value.accent.toLowerCase();
  for (const [key, [min, max]] of Object.entries(RANGES)) { if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) fail('Valor fuera de rango: ' + key); c[key] = value[key]; }
  for (const key of SWITCHES) { if (typeof value[key] !== 'boolean') fail('Opción no válida: ' + key); c[key] = value[key]; }
  const s = value.shortcut;
  if (!s || !['single', 'double', 'hold'].includes(s.mode) || typeof s.accelerator !== 'string' || !GLOBAL_SHORTCUT.test(s.accelerator)) fail('Usa un modificador y una letra, número, Espacio o F1–F24.');
  if (!Number.isFinite(s.interval) || s.interval < 180 || s.interval > 700) fail('Intervalo no válido.');
  c.shortcut = { accelerator: s.accelerator, mode: s.mode, interval: s.interval };
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS) fail('El anillo admite hasta ' + MAX_ITEMS + ' acciones.');
  const ids = new Set();
  c.items = [];
  for (const item of value.items) {
    const result = guarded(() => validateItem(item, ids, 0, lenient), item, lenient);
    if (!result) continue;
    c.items.push(result.item);
    for (const id of result.ids) ids.add(id);
  }
  if (c.items.length < 2) fail('El anillo necesita al menos dos acciones completas.');
  if (!Array.isArray(value.library) || value.library.length > MAX_LIBRARY) fail('La biblioteca admite hasta ' + MAX_LIBRARY + ' acciones.');
  c.library = [];
  for (const item of value.library) {
    const result = guarded(() => validateItem(item, ids, 0, lenient), item, lenient);
    if (!result) continue;
    c.library.push(result.item);
    for (const id of result.ids) ids.add(id);
  }
  if (!Array.isArray(value.profiles) || value.profiles.length < 1 || value.profiles.length > MAX_PROFILES) fail('Puede haber entre 1 y ' + MAX_PROFILES + ' perfiles.');
  if (!value.profiles.some(p => p && p.id === value.activeProfile)) fail('Perfil activo no válido.');
  c.activeProfile = value.activeProfile;
  const profileIds = new Set();
  c.profiles = value.profiles.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,40}$/.test(p.id) || profileIds.has(p.id)) fail('Perfil no válido.');
    profileIds.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 30) fail('Cada perfil necesita un nombre de hasta 30 caracteres.');
    if (typeof p.icon !== 'string' || !/^[a-z0-9-]{1,48}$/.test(p.icon)) fail('Icono de perfil no válido.');
    const hotkey = p.hotkey ?? '';
    if (hotkey !== '' && (typeof hotkey !== 'string' || !GLOBAL_SHORTCUT.test(hotkey))) fail('«' + p.name + '»: atajo de perfil no válido.');
    const profile = { id: p.id, name: p.name.trim(), icon: p.icon, hotkey, items: null };
    if (p.id === c.activeProfile) return profile;
    if (!Array.isArray(p.items) || p.items.length > MAX_ITEMS) fail('«' + p.name + '»: anillo no válido.');
    const own = new Set();
    profile.items = [];
    for (const item of p.items) {
      const result = guarded(() => validateItem(item, own, 0, lenient), item, lenient);
      if (!result) continue;
      profile.items.push(result.item);
      for (const id of result.ids) own.add(id);
    }
    if (profile.items.length < 2) fail('«' + p.name + '»: un perfil necesita al menos dos acciones.');
    return profile;
  });
  if (typeof value.nextProfileKey !== 'string' || (value.nextProfileKey !== '' && !GLOBAL_SHORTCUT.test(value.nextProfileKey))) fail('Atajo para cambiar de perfil no válido.');
  c.nextProfileKey = value.nextProfileKey;
  // Los atajos no pueden repetirse ni pisar el atajo del anillo: perfiles primero, después acciones.
  const taken = new Set([c.shortcut.accelerator]);
  for (const key of [c.nextProfileKey, ...c.profiles.map(p => p.hotkey)].filter(Boolean)) {
    if (taken.has(key)) fail('Hay dos perfiles (o el cambio de perfil) con el mismo atajo.');
    taken.add(key);
  }
  for (const item of walk(c.items)) {
    if (!item.hotkey) continue;
    if (taken.has(item.hotkey)) { if (!lenient) fail('«' + item.label + '»: ese atajo directo ya está en uso.'); lenient.issues.push({ id: item.id, message: '«' + item.label + '»: ese atajo directo ya está en uso.' }); delete item.hotkey; continue; }
    taken.add(item.hotkey);
  }
  return c;
}

function validate(input) { return validateConfig(input, null); }

// Guardado tolerante: lo que esté a medias se sustituye por su última versión guardada (o se
// deja fuera si es nuevo), y el resto —tema, atajos, gestos— se aplica igualmente.
function validateLenient(input, previous) {
  const lenient = { issues: [] };
  const value = migrate(input);
  if (value && previous) for (const key of ['items', 'library']) if (Array.isArray(value[key])) value[key] = substitute(value[key], previous, new Set(), lenient.issues);
  const config = validateConfig(value, lenient);
  return { config, issues: lenient.issues };
}
function substitute(items, previous, used, issues) {
  return items.map(item => {
    if (!item || typeof item !== 'object') return item;
    const kids = Array.isArray(item.items) ? substitute(item.items, previous, used, issues) : item.items;
    const next = kids === item.items ? item : { ...item, items: kids };
    try { validateItem(next, new Set(), 0, { issues: [] }); return next; }
    catch (error) {
      const old = findItem(previous, item.id) || (previous.library ? findIn(previous.library, item.id) : null);
      if (!old || used.has(item.id)) return next;
      issues.push({ id: item.id, message: error.message });
      used.add(item.id);
      // La versión guardada conserva el sitio en el anillo, con su contenido actual si era un grupo.
      return old.type === 'group' && Array.isArray(kids) && next.type === 'group' ? { ...old, items: kids } : old;
    }
  });
}

function* walk(items) { for (const item of items) { yield item; if (item.items) yield* walk(item.items); } }
function findIn(items, id) { for (const item of walk(items)) if (item.id === id) return item; return null; }
function findItem(config, id) { return findIn(config.items, id); }

class Store {
  constructor(directory) { fs.mkdirSync(directory, { recursive: true }); this.file = path.join(directory, 'settings.json'); }
  read() {
    try { return { config: validate(JSON.parse(fs.readFileSync(this.file, 'utf8'))), warning: '' }; }
    catch (error) {
      if (error.code === 'ENOENT') return { config: defaults(), warning: '' };
      const backup = this.file + '.invalid-' + Date.now();
      fs.copyFileSync(this.file, backup);
      return { config: defaults(), warning: 'Se ha conservado una copia de los ajustes dañados en ' + backup };
    }
  }
  write(value) {
    const config = validate(value), temporary = this.file + '.tmp';
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(config, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, this.file); return config;
  }
}

function boundsFor(point, area, side = 480) {
  const width = Math.min(side, area.width), height = Math.min(side, area.height);
  return { x: Math.round(Math.max(area.x, Math.min(point.x - width / 2, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(point.y - height / 2, area.y + area.height - height))), width, height };
}

class DoubleTap {
  constructor(interval, trigger) { this.interval = interval; this.trigger = trigger; this.down = false; this.last = null; }
  press(matches) { if (this.down) return; this.down = true; if (!matches) this.last = null; this.valid = matches; }
  release(now) { if (!this.down) return; this.down = false; if (!this.valid) return; if (this.last !== null && now - this.last <= this.interval) { this.last = null; this.trigger(); } else this.last = now; }
  reset() { this.down = false; this.last = null; this.valid = false; }
}

function switchProfile(config, id) {
  const target = config.profiles.find(p => p.id === id);
  if (!target || id === config.activeProfile) return config;
  const next = JSON.parse(JSON.stringify(config));
  next.profiles = next.profiles.map(p => p.id === config.activeProfile ? { ...p, items: next.items } : p.id === id ? { ...p, items: null } : p);
  next.items = JSON.parse(JSON.stringify(target.items));
  next.activeProfile = id;
  return next;
}

module.exports = { switchProfile, MAX_PROFILES, MAX_LIBRARY, defaults, validate, validateLenient, migrate, findItem, walk, Store, boundsFor, DoubleTap, CHOICES, RANGES, MAX_ITEMS, MAX_CHILDREN, MAX_LEVEL };
