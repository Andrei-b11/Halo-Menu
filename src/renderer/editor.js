import { icon, searchIcons } from './icons.js';
import { mountRadial, theme, paintGlyph } from './radial.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const geometry = globalThis.apticGeometry;

const TYPES = [['system', 'Carpeta', 'folder'], ['path', 'App o archivo', 'app-window'], ['url', 'Web', 'globe'], ['keys', 'Atajo', 'keyboard'], ['text', 'Texto', 'type'], ['clipboard', 'Portapapeles', 'clipboard'], ['group', 'Grupo', 'layers'], ['settings', 'HALO', 'settings']];
const TYPE_NAME = { system: 'Carpeta del sistema', folder: 'Carpeta', path: 'Aplicación o archivo', url: 'Página web', keys: 'Atajo de teclado', text: 'Pegar texto', group: 'Grupo', settings: 'Abrir HALO' };
const DEFAULT_TARGET = { folder: '', system: 'home', path: '', url: 'https://', keys: '', text: '', group: '', settings: '' };
const DEFAULT_ICON = { folder: 'folder', system: 'folder', path: 'app-window', url: 'globe', keys: 'keyboard', text: 'type', group: 'layers', settings: 'settings' };
TYPE_NAME.clipboard = 'Portapapeles persistente'; DEFAULT_TARGET.clipboard = '1'; DEFAULT_ICON.clipboard = 'clipboard';
const SYSTEM_NAME = { home: 'Carpeta personal', downloads: 'Descargas', documents: 'Documentos', desktop: 'Escritorio', pictures: 'Imágenes', music: 'Música', videos: 'Vídeos' };
const COLORS = ['#ed4c50', '#f0955a', '#e0a44f', '#e6c468', '#6cbb95', '#4cc0bd', '#5aa2f0', '#8e9cf5', '#a987ed', '#d786ba'];
const ACCENTS = ['#ed4c50', '#f1768b', '#f0955a', '#e0a44f', '#6cbb95', '#a7c6ac', '#4cc0bd', '#5aa2f0', '#8e9cf5', '#a987ed', '#d786ba'];
const THEMES = [
  { id: 'carbon', name: 'Carbón', bg: '#171717', surface: '#2f2f2f', text: '#dedede' },
  { id: 'midnight', name: 'Medianoche', bg: '#0d1117', surface: '#232a35', text: '#c9d1d9' },
  { id: 'paper', name: 'Papel', bg: '#f7f5ef', surface: '#e3e0d8', text: '#3e423e' },
  { id: 'light', name: 'Claro', bg: '#fafafb', surface: '#e6e7eb', text: '#2a2c31' },
  { id: 'system', name: 'Sistema', bg: '#171717', surface: '#8a8a8a', text: '#888' }
];
const PAGES = { actions: 'Acciones', appearance: 'Tema y colores', shape: 'Forma y movimiento', shortcut: 'Atajo y gesto', behavior: 'Comportamiento', data: 'Copias y datos', about: 'Acerca de' };
const UNITS = { radius: ' px', size: ' px', iconScale: ' %', rotation: '°', opacity: ' %', veil: ' %', shadow: ' %', duration: ' ms', labelSize: ' px', hubSize: ' px', aimScale: ' %' };
const SOURCES = { shortcut: 'Atajo de teclado', mouse: 'Botón del ratón', modifier: 'Doble toque', corner: 'Esquina activa', hotkey: 'Atajo directo', profile: 'Perfil', button: 'Botón «Probar»', tray: 'Bandeja', menu: 'Anillo' };
// Límites cómodos: más círculos que estos hacen los sectores tan estrechos que apuntar deja de ser un gesto.
const MAX_ITEMS = 16, MAX_CHILDREN = 12, MAX_LEVEL = 2, MAX_LIBRARY = 40, MAX_PROFILES = 8;
Object.assign(UNITS, { dwellDelay: ' ms', cornerDelay: ' ms', response: ' ms', stagger: ' %', borderWidth: ' px', roundness: ' %' });
const RECIPES = [
  ['Copiar', 'keys', 'CommandOrControl+C', 'copy'], ['Pegar', 'keys', 'CommandOrControl+V', 'clipboard-paste'],
  ['Cortar', 'keys', 'CommandOrControl+X', 'scissors'], ['Seleccionar todo', 'keys', 'CommandOrControl+A', 'scan'],
  ['Deshacer', 'keys', 'CommandOrControl+Z', 'undo'], ['Rehacer', 'keys', 'CommandOrControl+Y', 'redo'],
  ['Buscar', 'keys', 'CommandOrControl+F', 'search'], ['Guardar', 'keys', 'CommandOrControl+S', 'save'],
  ['Nueva pestaña', 'keys', 'CommandOrControl+T', 'square-plus'], ['Reabrir pestaña', 'keys', 'CommandOrControl+Shift+T', 'rotate-ccw'],
  ['Cerrar pestaña', 'keys', 'CommandOrControl+W', 'x'], ['Cambiar ventana', 'keys', 'Alt+Tab', 'app-window'],
  ['Descargas', 'system', 'downloads', 'download'], ['Documentos', 'system', 'documents', 'file-text'],
  ['Escritorio', 'system', 'desktop', 'monitor'], ['Imágenes', 'system', 'pictures', 'image'],
  ['Captura de pantalla', 'keys', 'Super+Shift+S', 'scan'], ['Mostrar escritorio', 'keys', 'Super+D', 'monitor']
];
let libraryCatalog = false;

let state, config, saved, selected, page = 'actions', seenSwitches = 0;
let stage = null, previews = [], saveTimer, saveSeq = 0, toastTimer, demoTimer;
let history = [], future = [], lastSnap = '', lastKey = null, lastTime = 0;
let inspectedId = null;
let selectionMode = false;
const checkedActions = new Set(), foldedGroups = new Set();
const normalizeText = text => String(text).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isMac = () => state?.platform === 'darwin';

function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, el.dataset.variant); }); }
paintIcons();
const cleanError = message => String(message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
function toast(text) { const el = $('#toast'); el.textContent = text; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200); }
function notice(text) { $('#notice p').textContent = text || ''; $('#notice').hidden = !text; }
$('#notice button').onclick = () => notice('');

// --- Estructura del anillo: grupos y subgrupos -------------------------------------------
// locate devuelve la acción, la lista que la contiene, su posición, su grupo y su nivel
// (0 en el anillo, 1 dentro de un grupo, 2 dentro de un subgrupo).
function search(id, items, parent, level, library) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === id) return { item, list: items, index: i, parent, level, library };
    if (item.type === 'group' && item.items) { const found = search(id, item.items, item, level + 1, library); if (found) return found; }
  }
  return null;
}
// Una acción puede estar en el anillo o en la biblioteca (fuera del anillo).
const locate = id => search(id, config.items, null, 0, false) || search(id, config.library, null, 0, true);
const current = () => locate(selected)?.item;
const capacity = (parent, list) => list === config.library ? MAX_LIBRARY : parent ? MAX_CHILDREN : MAX_ITEMS;
const minimum = (parent, list) => list === config.library ? 0 : parent ? 1 : 2;
const fullMessage = (parent, list) => list === config.library ? 'La biblioteca admite hasta ' + MAX_LIBRARY + ' acciones.' : parent ? 'Un grupo admite hasta ' + MAX_CHILDREN + ' acciones.' : 'El anillo admite hasta ' + MAX_ITEMS + ' acciones: más sectores serían demasiado estrechos para apuntar.';
const lowMessage = parent => parent ? 'Un grupo necesita al menos una acción.' : 'El anillo necesita al menos dos acciones.';
const height = item => item.type === 'group' ? 1 + Math.max(0, ...item.items.map(height)) : 0;
const contains = (item, id) => item.id === id || (item.items || []).some(kid => contains(kid, id));
const allGroups = (items = config.items, level = 0, trail = []) => items.flatMap(item => item.type === 'group' ? [{ item, level, path: [...trail, item.label] }, ...allGroups(item.items, level + 1, [...trail, item.label])] : []);
const newId = () => crypto.randomUUID().slice(0, 18);
function newItem(type = 'url', label = 'Nueva acción') {
  const item = { id: newId(), label, type, target: DEFAULT_TARGET[type], icon: DEFAULT_ICON[type], color: '' };
  if (type === 'group') item.items = [newItem('url')];
  return item;
}
function prettyKeys(accelerator, sep = ' + ') {
  if (!accelerator) return '';
  const names = { CommandOrControl: isMac() ? '⌘' : 'Ctrl', Control: 'Ctrl', Command: '⌘', Super: isMac() ? '⌘' : 'Win', Alt: isMac() ? '⌥' : 'Alt', Shift: 'Mayús', Space: 'Espacio', Enter: 'Intro', Escape: 'Esc', Backspace: 'Retroceso', Delete: 'Supr', Insert: 'Insert', PageUp: 'RePág', PageDown: 'AvPág', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PrintScreen: 'ImpPant', Home: 'Inicio', End: 'Fin', Tab: 'Tab' };
  return accelerator.split('+').map(part => names[part] || part).join(sep);
}
function keyChips(host, accelerator) {
  host.replaceChildren(...accelerator.split('+').map(part => { const k = document.createElement('kbd'); k.textContent = prettyKeys(part); return k; }));
}
function summary(item) {
  if (item.type === 'system') return SYSTEM_NAME[item.target] || item.target;
  if (item.type === 'path') return item.target ? item.target.split(/[\\/]/).pop().replace(/\.lnk$/i, '') : 'Sin elegir';
  if (item.type === 'folder') return item.target ? item.target.replace(/[\\/]+$/, '') : 'Sin elegir';
  if (item.type === 'url') { try { return new URL(item.target).hostname || 'Sin dirección'; } catch { return 'Sin dirección'; } }
  if (item.type === 'keys') return item.target ? prettyKeys(item.target) : 'Sin combinación';
  if (item.type === 'text') return item.target ? '«' + item.target.slice(0, 40) + '»' : 'Sin texto';
  if (item.type === 'clipboard') return 'Espacio ' + item.target + ' · ' + (state.clips?.[item.target]?.kind === 'text' ? 'Texto guardado' : state.clips?.[item.target] ? 'Archivos guardados' : 'Vacío');
  if (item.type === 'group') return item.items.length + (item.items.length === 1 ? ' acción' : ' acciones');
  return 'Abre este editor';
}
// Lo mismo que comprueba el guardado, para marcar en la lista lo que está a medias.
function incomplete(item) {
  if (item.type === 'path' || item.type === 'folder') return !/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(item.target);
  if (item.type === 'url') { try { const u = new URL(item.target); return !/^https?:$/.test(u.protocol) || !u.hostname; } catch { return true; } }
  if (item.type === 'keys') return !item.target;
  if (item.type === 'text') return !item.target.trim();
  if (item.type === 'group') return !item.items.length || item.items.every(incomplete);
  return !item.label.trim();
}

// --- Historial y guardado automático --------------------------------------------------
// Cada cambio se aplica solo, como en LINDE. Si una acción está a medias, el resto se guarda
// y se aplica igualmente; esa acción conserva su última versión hasta que se complete.
const snap = () => JSON.stringify(config);
function record(key) {
  const now = Date.now();
  if (!(key && key === lastKey && now - lastTime < 800)) { history.push(lastSnap); if (history.length > 120) history.shift(); }
  future = []; lastKey = key; lastTime = now; lastSnap = snap();
  updateHistoryButtons();
}
function updateHistoryButtons() { $('#undo').disabled = !history.length; $('#redo').disabled = !future.length; }
function travel(from, to) {
  if (!from.length) return;
  selectionMode = false; checkedActions.clear();
  to.push(snap()); config = JSON.parse(from.pop()); lastSnap = snap(); lastKey = null;
  if (!locate(selected)) selected = config.items[0].id;
  renderAll(true); scheduleSave(120); updateHistoryButtons();
}
function commit({ key = null, replay = false, list = true } = {}) {
  record(key);
  renderAll(replay, list);
  scheduleSave();
}
function setSaveState(kind, message = '') {
  const el = $('#save-state'); el.dataset.state = kind;
  const [glyph, text] = { saved: ['check', 'Aplicado'], saving: ['loader', 'Aplicando…'], partial: ['triangle-alert', message], error: ['triangle-alert', message] }[kind];
  el.innerHTML = icon(glyph) + '<b></b>'; el.querySelector('b').textContent = text; el.title = message;
}
function scheduleSave(delay = 260) { clearTimeout(saveTimer); setSaveState('saving'); saveTimer = setTimeout(saveNow, delay); }
async function saveNow() {
  clearTimeout(saveTimer);
  const draft = snap();
  const seq = ++saveSeq; setSaveState('saving');
  try {
    const result = await window.aptic.save(JSON.parse(draft));
    state = result; saved = JSON.stringify(result.config);
    if (seq !== saveSeq) return true;
    const issues = result.issues || [];
    if (issues.length) setSaveState('partial', issues.length === 1 ? issues[0].message + ' Lo demás ya se aplicó.' : issues.length + ' acciones sin terminar; lo demás ya se aplicó.');
    else setSaveState('saved');
    drawList(); drawLibrary(); updateStatus(); notice(result.warning);
    return true;
  } catch (error) {
    const message = cleanError(error.message);
    const previous = JSON.parse(saved);
    // Un atajo que el sistema no acepta no puede bloquear el resto: se vuelve al que funcionaba.
    if (/atajo|gesto|detector|Accesibilidad|X11|nativo|registrar/i.test(message)) {
      config.shortcut = previous.shortcut; config.mouse = previous.mouse; config.modifierTap = previous.modifierTap;
      restoreHotkeys(config.items, previous);
      lastSnap = snap(); renderAll(); toast(message);
      if (seq === saveSeq) scheduleSave(60);
      return false;
    }
    if (seq === saveSeq) setSaveState('error', message);
    return false;
  }
}
function restoreHotkeys(items, previous) {
  for (const item of items) {
    const old = locateIn(previous.items, item.id);
    if (old?.hotkey) item.hotkey = old.hotkey; else delete item.hotkey;
    if (item.items) restoreHotkeys(item.items, previous);
  }
}
function locateIn(items, id) { for (const item of items) { if (item.id === id) return item; const kid = item.items && locateIn(item.items, id); if (kid) return kid; } return null; }

// --- Lista de acciones ----------------------------------------------------------------
let dragId = null;
function drawList() {
  if (dragId) return;
  const host = $('#actions'), scrollTop = host.scrollTop; host.replaceChildren();
  const query = normalizeText($('#action-search').value.trim());
  const matches = item => normalizeText(item.label + ' ' + summary(item) + ' ' + TYPE_NAME[item.type]).includes(query);
  const subtreeMatches = item => matches(item) || (item.items || []).some(subtreeMatches);
  $('#count').textContent = config.items.length + '/' + MAX_ITEMS;
  const issues = new Set((state?.issues || []).map(i => i.id));
  let count = 0;
  const add = (items, parent, level, inherited = false) => items.forEach((item, i) => {
    if (query && !inherited && !subtreeMatches(item)) return;
    host.append(row(item, i, parent, level, issues.has(item.id) || incomplete(item)));
    count++;
    if (item.type === 'group' && (query || !foldedGroups.has(item.id))) add(item.items, item, level + 1, inherited || !!query && matches(item));
  });
  add(config.items, null, 0);
  if (!count) { const empty = document.createElement('p'); empty.className = 'list-empty'; empty.textContent = 'No hay coincidencias. Prueba otro nombre, destino o tipo de acción.'; host.append(empty); }
  $('#search-count').textContent = query ? count + ' visibles' : '';
  const groups = allGroups(), allFolded = groups.length > 0 && groups.every(g => foldedGroups.has(g.item.id));
  $('#fold-groups').title = $('#fold-groups').ariaLabel = allFolded ? 'Desplegar todos los grupos' : 'Plegar todos los grupos';
  $('#fold-groups').disabled = !groups.length || !!query;
  host.scrollTop = scrollTop;
  const loc = locate(selected);
  const target = loc && (loc.item.type === 'group' ? loc.item : loc.parent);
  $('#add').disabled = target ? target.items.length >= MAX_CHILDREN : config.items.length >= MAX_ITEMS;
  $('#add').title = target ? 'Añadir acción a «' + target.label + '»' : 'Añadir acción';
  const groupHost = loc && loc.item.type === 'group' && loc.level < MAX_LEVEL - 1 ? loc.item : null;
  $('#add-group').title = groupHost ? 'Añadir subgrupo dentro de «' + groupHost.label + '»' : 'Añadir grupo';
  $('#add-group').disabled = groupHost ? groupHost.items.length >= MAX_CHILDREN : config.items.length >= MAX_ITEMS;
  $('#add-app').disabled = target ? target.items.length >= MAX_CHILDREN : config.items.length >= MAX_ITEMS;
  drawBatch();
}
function row(item, index, parent, level, unfinished) {
  const b = document.createElement('button');
  const active = selectionMode ? checkedActions.has(item.id) : item.id === selected;
  b.className = 'row' + (active ? ' selected' : '') + (unfinished ? ' unfinished' : '');
  b.style.setProperty('--level', level);
  if (level) b.classList.add('child');
  b.dataset.id = item.id; b.draggable = !selectionMode; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(active));
  const grip = document.createElement('span'); grip.className = 'row-grip'; grip.innerHTML = icon('grip');
  const glyph = document.createElement('span'); glyph.className = 'row-glyph';
  if (item.color) { glyph.dataset.tint = ''; glyph.style.setProperty('--tint', item.color); }
  paintGlyph(glyph, item, config);
  const copy = document.createElement('span'); copy.className = 'row-copy';
  const name = document.createElement('span'); name.className = 'row-name'; name.textContent = item.label;
  const small = document.createElement('small'); small.textContent = unfinished ? 'Sin terminar · ' + summary(item) : summary(item);
  copy.append(name, small);
  const end = document.createElement('span');
  if (item.hotkey) { end.className = 'row-hotkey'; end.textContent = prettyKeys(item.hotkey, '+'); end.title = 'Atajo directo'; }
  else if (item.type === 'group') { end.className = 'group-count'; end.textContent = item.items.length; }
  else { end.className = 'row-index'; end.textContent = String(index + 1).padStart(2, '0'); }
  const remove = document.createElement('span'); remove.className = 'row-remove'; remove.innerHTML = icon('x'); remove.title = 'Quitar del anillo (se guarda en la biblioteca)'; remove.setAttribute('role', 'button'); remove.setAttribute('aria-label', 'Quitar «' + item.label + '» del anillo');
  remove.onclick = e => { e.stopPropagation(); toLibrary(item.id); };
  if (item.type === 'group') {
    const fold = document.createElement('span'); fold.className = 'group-fold'; fold.innerHTML = icon(foldedGroups.has(item.id) ? 'chevron-right' : 'chevron-down');
    fold.hidden = !!$('#action-search').value.trim();
    fold.setAttribute('role', 'button'); fold.tabIndex = 0; fold.setAttribute('aria-expanded', String(!foldedGroups.has(item.id) || !!$('#action-search').value)); fold.setAttribute('aria-label', 'Plegar o desplegar «' + item.label + '»');
    fold.onclick = e => { e.stopPropagation(); if (foldedGroups.has(item.id)) foldedGroups.delete(item.id); else foldedGroups.add(item.id); drawList(); $(`.row[data-id="${CSS.escape(item.id)}"] .group-fold`)?.focus({ preventScroll: true }); };
    fold.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fold.click(); } };
    b.append(fold);
  }
  if (selectionMode) { const check = document.createElement('span'); check.className = 'row-check'; check.textContent = active ? '✓' : ''; check.setAttribute('aria-hidden', 'true'); b.append(check); }
  b.append(grip, glyph, copy, end, remove); remove.hidden = selectionMode;
  b.onclick = e => { if (selectionMode || e.ctrlKey || e.metaKey) { selectionMode = true; toggleChecked(item.id); } else select(item.id); };
  b.ondragstart = e => beginDrag(e, item.id);
  b.ondragend = endDrag;
  b.ondragover = e => {
    if (!dragId || dragId === item.id) return;
    e.preventDefault();
    const rect = b.getBoundingClientRect(), y = (e.clientY - rect.top) / rect.height;
    const where = item.type === 'group' && y > .3 && y < .7 ? 'into' : y < .5 ? 'before' : 'after';
    $$('.row').forEach(r => r.classList.remove('drop-before', 'drop-after', 'drop-into'));
    b.classList.add('drop-' + where); b.dataset.drop = where;
  };
  b.ondragleave = () => b.classList.remove('drop-before', 'drop-after', 'drop-into');
  b.ondrop = e => { e.preventDefault(); e.stopPropagation(); const id = dragId; endDrag(); if (id) moveItem(id, item.id, b.dataset.drop || 'before'); };
  return b;
}

function batchNodes() { return globalThis.haloOrganize.collect(config.items, checkedActions); }
function drawBatch() {
  for (const id of checkedActions) if (!locate(id) || locate(id).library) checkedActions.delete(id);
  const nodes = batchNodes();
  $('#inspector').hidden = selectionMode; $('#batch-inspector').hidden = !selectionMode;
  $('#ring-store').disabled = selectionMode;
  if (selectionMode) for (const id of ['add', 'add-app', 'add-group', 'add-clipboard-single', 'add-clipboard']) $('#' + id).disabled = true;
  else { $('#add-clipboard-single').disabled = config.items.length >= MAX_ITEMS; $('#add-clipboard').disabled = config.items.length >= MAX_ITEMS; }
  $('#actions').setAttribute('aria-multiselectable', String(selectionMode));
  $('#select-many').setAttribute('aria-pressed', String(selectionMode));
  $('#select-many').textContent = selectionMode ? 'Terminar selección' : 'Seleccionar varias';
  $('#batch-title').textContent = nodes.length ? nodes.length + (nodes.length === 1 ? ' acción seleccionada' : ' acciones seleccionadas') : 'Selecciona acciones';
  $('#batch-names').replaceChildren(...nodes.map(({ item }) => { const li = document.createElement('li'); li.textContent = item.label + (item.type === 'group' ? ' · ' + item.items.length + ' dentro' : ''); return li; }));
  for (const id of ['batch-duplicate', 'batch-library', 'batch-apply-color', 'batch-reset-color']) $('#' + id).disabled = !nodes.length;
  $('#batch-group').disabled = nodes.length < 2;
  $$('#stage .ring-opt,#stage .ring-sub').forEach(button => {
    button.draggable = !selectionMode;
    button.classList.toggle('batch-checked', selectionMode && checkedActions.has(button.dataset.id));
    button.classList.toggle('selected-item', !selectionMode && button.dataset.id === selected);
  });
}
function toggleChecked(id) {
  const loc = locate(id); if (!loc || loc.library) return;
  if (checkedActions.has(id)) checkedActions.delete(id);
  else {
    for (const other of checkedActions) { const old = locate(other)?.item; if (old && (contains(old, id) || contains(loc.item, other))) checkedActions.delete(other); }
    checkedActions.add(id);
  }
  $('#batch-error').textContent = ''; drawList();
}
function setSelectionMode(on) {
  selectionMode = on; checkedActions.clear(); $('#batch-error').textContent = '';
  drawList(); drawInspector();
}
function organizeSelection(operation, option) {
  try {
    const result = globalThis.haloOrganize.organize(config, [...checkedActions], operation, option);
    config = result.config; checkedActions.clear(); result.selected.forEach(id => checkedActions.add(id));
    if (operation === 'group' || operation === 'library') { selectionMode = false; checkedActions.clear(); }
    selected = result.selected[0] || config.items[0].id;
    $('#batch-error').textContent = ''; commit();
    toast(result.count + ' acciones: ' + ({ group: 'grupo creado', duplicate: 'copias creadas', library: 'guardadas en biblioteca', color: 'color actualizado' }[operation]) + '. Ctrl + Z para deshacer.');
    if (operation === 'group') { $('#action-name').focus(); $('#action-name').select(); }
  } catch (error) { $('#batch-error').textContent = error.message; }
}
$('#select-many').onclick = () => setSelectionMode(!selectionMode);
$('#batch-done').onclick = () => setSelectionMode(false);
$('#batch-none').onclick = () => { checkedActions.clear(); drawList(); };
$('#batch-all').onclick = () => {
  const ids = new Set($$('#actions .row').map(row => row.dataset.id)); checkedActions.clear();
  globalThis.haloOrganize.collect(config.items, ids).forEach(node => checkedActions.add(node.item.id)); drawList();
};
for (const operation of ['group', 'duplicate', 'library']) $('#batch-' + operation).onclick = () => organizeSelection(operation);
$('#batch-apply-color').onclick = () => organizeSelection('color', $('#batch-color').value);
$('#batch-reset-color').onclick = () => organizeSelection('color', '');
$('#action-search').oninput = () => { $('#actions').scrollTop = 0; drawList(); };
$('#fold-groups').onclick = () => {
  const groups = allGroups(), expand = groups.every(g => foldedGroups.has(g.item.id));
  groups.forEach(g => expand ? foldedGroups.delete(g.item.id) : foldedGroups.add(g.item.id)); drawList();
};
// Zonas donde soltar: el final del anillo (lista o vista previa) y la biblioteca.
const outside = e => !dragId && [...(e.dataTransfer?.types || [])].includes('Files');
function dropZone(el, onDrop, listFor) {
  el.addEventListener('dragover', e => { if (!dragId && !outside(e)) return; e.preventDefault(); el.classList.add('drop-zone'); });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-zone'); });
  el.addEventListener('drop', e => {
    el.classList.remove('drop-zone');
    if (outside(e)) { e.preventDefault(); return dropFiles(e, listFor()); }
    if (!dragId) return; e.preventDefault(); e.stopPropagation(); const id = dragId; endDrag(); onDrop(id);
  });
}
// Carpetas, programas y archivos arrastrados desde el Explorador se convierten en acciones.
function dropFiles(e, list) {
  const added = [];
  for (const entry of [...e.dataTransfer.items]) {
    if (entry.kind !== 'file') continue;
    const file = entry.getAsFile(), target = file && window.aptic.pathFor(file);
    if (!target) continue;
    if (list.length >= capacity(null, list)) { toast(fullMessage(null, list)); break; }
    const folder = entry.webkitGetAsEntry?.()?.isDirectory;
    const item = newItem(folder ? 'folder' : 'path', (target.split(/[\\/]/).filter(Boolean).pop() || 'Acción').replace(/\.(exe|lnk|app|url)$/i, '').slice(0, 50));
    item.target = target; item.icon = folder ? 'folder' : 'app-window';
    list.push(item); added.push(item);
  }
  if (!added.length) return;
  selected = added.at(-1).id; commit();
  toast(added.length === 1 ? '«' + added[0].label + '» añadida.' : added.length + ' acciones añadidas.');
}
function moveTo(id, list, index, parent = null, parentLevel = -1) {
  const from = locate(id); if (!from) return false;
  const problem = canPlace(from.item, parent, parentLevel);
  if (problem) { toast(problem); return false; }
  if (list !== from.list) {
    if (list.length >= capacity(parent, list)) { toast(fullMessage(parent, list)); return false; }
    if (from.list.length <= minimum(from.parent, from.list)) { toast(lowMessage(from.parent)); return false; }
  }
  from.list.splice(from.index, 1);
  if (list === from.list && from.index < index) index--;
  list.splice(Math.min(index, list.length), 0, from.item);
  selected = from.item.id; commit(); return true;
}
function toLibrary(id) {
  const loc = locate(id); if (!loc || loc.library) return;
  if (moveTo(id, config.library, config.library.length)) toast('«' + loc.item.label + '» está ahora en la biblioteca. Arrástrala de vuelta cuando quieras.');
}
const toRing = id => moveTo(id, config.items, config.items.length);
// Mover respetando los límites: dos niveles de grupos, capacidad y mínimo de cada lista.
function canPlace(item, parent, parentLevel) {
  const level = parent ? parentLevel + 1 : 0;
  if (parent && contains(item, parent.id)) return 'No se puede meter un grupo dentro de sí mismo.';
  if (level + height(item) > MAX_LEVEL) return 'Solo caben dos niveles de grupos.';
  return '';
}
function moveItem(id, targetId, where) {
  const from = locate(id), to = locate(targetId);
  if (!from || !to || id === targetId) return;
  const item = from.item;
  let list, index, parent, parentLevel;
  if (where === 'into') { list = to.item.items; index = list.length; parent = to.item; parentLevel = to.level; }
  else { list = to.list; index = to.index + (where === 'after' ? 1 : 0); parent = to.parent; parentLevel = to.level - 1; }
  const problem = canPlace(item, parent, parentLevel);
  if (problem) return toast(problem);
  if (list !== from.list) {
    if (list.length >= capacity(parent, list)) return toast(fullMessage(parent, list));
    if (from.list.length <= minimum(from.parent, from.list)) return toast(lowMessage(from.parent));
  }
  from.list.splice(from.index, 1);
  if (list === from.list && from.index < index) index--;
  list.splice(index, 0, item);
  selected = item.id; commit();
}

// --- Inspector ------------------------------------------------------------------------
function setValue(el, value) { if (document.activeElement !== el && el.value !== value) el.value = value; }
function drawInspector() {
  const loc = locate(selected); if (!loc) return;
  if (inspectedId !== selected) { $('#inspector').scrollTop = 0; inspectedId = selected; }
  const { item, parent, index, list, level } = loc;
  const glyph = $('#insp-glyph');
  glyph.toggleAttribute('data-tint', !!item.color); glyph.style.setProperty('--tint', item.color || 'transparent');
  paintGlyph(glyph, item, config);
  setValue($('#action-name'), item.label);
  const where = loc.library ? (parent ? 'Biblioteca › «' + parent.label + '»' : 'Biblioteca (fuera del anillo)') : parent ? (level > 1 ? 'Subgrupo' : 'Grupo') + ' «' + parent.label + '»' : 'Anillo';
  $('#insp-where').textContent = where + ' · ' + (index + 1) + ' de ' + list.length + ' · ' + TYPE_NAME[item.type];
  $('#action-recipe').textContent = incomplete(item) ? 'Completa el destino para activar esta acción. El resto de tus ajustes sigue guardándose.' : 'Al elegir «' + item.label + '»: ' + TYPE_NAME[item.type] + ' · ' + summary(item) + (item.hotkey ? '. También con ' + prettyKeys(item.hotkey) : '') + '.';
  $('#store-selected').hidden = !!locate(item.id)?.library;
  $('#inspector').classList.toggle('in-library', loc.library);
  $$('#types button').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === item.type || (b.dataset.type === 'system' && item.type === 'folder'));
    b.disabled = b.dataset.type === 'group' && item.type !== 'group' && level >= MAX_LEVEL;
    b.title = b.disabled ? 'Solo caben dos niveles de grupos' : TYPE_NAME[b.dataset.type];
  });
  const t = item.type;
  $('#key-preset').hidden = t !== 'keys';
  $('#target-field').hidden = t === 'settings';
  // «Carpeta» reúne las del sistema y cualquier otra: la elegida aparece en el desplegable.
  const custom = $('#system-target option[value="__folder"]');
  custom.hidden = t !== 'folder'; custom.textContent = t === 'folder' && item.target ? 'Otra carpeta · ' + item.target.split(/[\\/]/).filter(Boolean).pop() : '';
  $('#target-label').textContent = { system: 'Carpeta', folder: 'Carpeta', path: 'Aplicación, archivo o carpeta', url: 'Dirección', keys: 'Combinación que se enviará', text: 'Texto', group: 'Contenido' }[t] || 'Destino';
  $('#system-target').hidden = t !== 'system' && t !== 'folder'; $('#path-target').hidden = t !== 'path' && t !== 'folder';
  $('#pick-app').hidden = $('#pick-file').hidden = t === 'folder'; $('#action-url').hidden = t !== 'url';
  $('#action-keys').hidden = t !== 'keys'; $('#action-text').hidden = t !== 'text'; $('#group-tools').hidden = t !== 'group';
  $('#clipboard-tools').hidden = t !== 'clipboard';
  if (t === 'clipboard') drawClipboard();
  if (t === 'system') setValue($('#system-target'), item.target);
  if (t === 'folder') setValue($('#system-target'), '__folder');
  if (t === 'path' || t === 'folder') setValue($('#action-path'), item.target);
  $('#action-path').placeholder = t === 'folder' ? 'Ruta de la carpeta, por ejemplo C:\\Proyectos' : 'Elige una aplicación, archivo o carpeta';
  if (t === 'url') setValue($('#action-url'), item.target);
  if (t === 'keys' && !$('#action-keys').classList.contains('recording')) $('#action-keys').value = prettyKeys(item.target);
  if (t === 'text') setValue($('#action-text'), item.target);
  if (t === 'group') { $('#group-add-sub').hidden = level >= MAX_LEVEL - 1; $('#group-add').disabled = $('#group-add-sub').disabled = item.items.length >= MAX_CHILDREN; }
  const hint = $('#target-hint'); hint.classList.remove('warn');
  const needsNative = (t === 'keys' || t === 'text') && !state.native;
  const issue = (state.issues || []).find(i => i.id === item.id);
  hint.textContent = issue ? issue.message.replace(/^«[^»]+»: /, '') + ' Mientras tanto, el anillo usa la versión anterior.'
    : needsNative ? 'El envío de teclas necesita el módulo nativo, que no está instalado.'
    : t === 'keys' ? 'Se envía a la aplicación que estaba delante al abrir el anillo.'
    : t === 'text' ? 'Se copia al portapapeles y se pega con ' + (isMac() ? '⌘' : 'Ctrl') + ' + V.'
    : t === 'clipboard' ? 'Guardado permanente. En el anillo: clic para usar; clic derecho o Ctrl + V para sustituir el contenido.'
    : t === 'group' ? item.items.length + ' de ' + MAX_CHILDREN + ' acciones. Se abre en un arco alrededor de su sector' + (level === 0 ? '; dentro puede haber subgrupos.' : '.')
    : t === 'path' ? 'Elige una de tus aplicaciones instaladas o cualquier archivo, programa o carpeta.'
    : t === 'folder' ? 'Se abre en el explorador de archivos. Pulsa la carpeta de la derecha para elegir otra, o arrastra una desde el Explorador.'
    : t === 'system' ? 'Se adapta a Windows, macOS y Linux.' : '';
  if (needsNative || issue) hint.classList.add('warn');
  $('#icon-current').innerHTML = icon(item.icon, config.iconStyle);
  $('#clear-image').hidden = !item.image;
  $('#icon-hint').textContent = item.image ? 'Se usa la imagen elegida.' : config.nativeIcons && (t === 'path' || (t === 'system' && item.target === 'home')) ? 'El icono real del sistema tiene prioridad cuando existe. Puedes desactivarlo en Tema y colores.' : '';
  drawSwatches($('#item-colors'), item.color, color => { const it = current(); it.color = color; commit({ key: 'color:' + it.id }); }, true);
  if (!$('#action-hotkey').classList.contains('recording')) $('#action-hotkey').value = item.hotkey ? prettyKeys(item.hotkey) : '';
  $('#clear-hotkey').hidden = !item.hotkey;
  $('#hotkey-hint').textContent = t === 'group' ? 'Abre este grupo directamente como un anillo propio.' : 'Ejecuta la acción al momento, sin abrir el anillo.';
  const place = $('#action-place');
  const groups = allGroups().filter(g => g.item !== item && !contains(item, g.item.id));
  $('#place-field').hidden = false;
  place.replaceChildren(new Option('Anillo principal', ''), ...groups.map(g => { const o = new Option('  '.repeat(g.level) + g.path.join(' › '), g.item.id); o.disabled = !!canPlace(item, g.item, g.level); return o; }), new Option('Biblioteca (fuera del anillo)', '__library'));
  place.value = loc.library && !parent ? '__library' : parent && !loc.library ? parent.id : loc.library ? '__library' : '';
  $('#move-up').disabled = index === 0; $('#move-down').disabled = index === list.length - 1;
  $('#remove').disabled = list.length <= minimum(parent, list);
  $('#remove').title = $('#remove').disabled ? lowMessage(parent) : loc.library ? 'Eliminar de la biblioteca' : 'Eliminar';
  $('#duplicate').disabled = list.length >= capacity(parent, list);
}
function drawSwatches(host, value, onPick, allowNone) {
  host.replaceChildren();
  if (allowNone) {
    const none = document.createElement('button'); none.className = 'swatch none' + (value ? '' : ' selected'); none.innerHTML = icon('ban'); none.title = 'Sin color'; none.setAttribute('aria-label', 'Sin color');
    none.onclick = () => onPick(''); host.append(none);
  }
  const palette = allowNone ? COLORS : ACCENTS;
  for (const color of palette) {
    const b = document.createElement('button'); b.className = 'swatch' + (value === color ? ' selected' : ''); b.style.setProperty('--c', color); b.title = color; b.setAttribute('aria-label', 'Color ' + color);
    b.onclick = () => onPick(color); host.append(b);
  }
  const custom = document.createElement('label'); custom.className = 'swatch custom' + (value && !palette.includes(value) ? ' selected' : ''); custom.title = 'Otro color';
  if (value && !palette.includes(value)) custom.style.setProperty('--c', value);
  const input = document.createElement('input'); input.type = 'color'; input.value = value || '#ed4c50'; input.setAttribute('aria-label', 'Otro color');
  input.oninput = () => onPick(input.value);
  custom.append(input); host.append(custom);
}

// --- Vistas previas -------------------------------------------------------------------
function previewMount(host, { replay = false, onSelect, hint, extra = 0 } = {}) {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return null;
  const reach = geometry.reach(config) + (config.labels === 'always' ? 26 : 0);
  const zoom = Math.max(.3, Math.min(1, (w - 30) / (2 * reach), (h - 70 - extra) / (2 * reach + 40)));
  return mountRadial(host, config, { mode: 'preview', editable: host.id === 'stage', clips: state.clips, anchor: { x: w / 2, y: h / 2 - 16 }, zoom, instant: !replay, hint, onSelect, onClose: () => {} });
}
// --- Biblioteca -------------------------------------------------------------------------
function drawLibrary() {
  if (dragId) return;
  $('#library-card .card-foot').textContent = libraryCatalog ? 'Pulsa una acción para añadirla al anillo y personalízala en el inspector. Los atajos se envían a la aplicación activa.' : 'Arrastra al círculo o haz doble clic para añadir. Arrastra aquí desde el anillo para guardar. Hasta 40 acciones; puedes deshacer con Ctrl + Z.';
  const host = $('#library'); host.replaceChildren();
  $('#library-count').textContent = config.library.length + '/' + MAX_LIBRARY;
  $('#library-badge').textContent = config.library.length;
  const query = $('#library-search').value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const category = $('#library-filter').value;
  const source = libraryCatalog ? RECIPES.filter(r => state.platform === 'win32' || !r[2].startsWith('Super+')).map(([label, type, target, glyph], i) => ({ id: 'recipe-' + i, label, type, target, icon: glyph, color: '' })) : config.library;
  const items = source.filter(item => (category === 'all' || item.type === category || category === 'system' && item.type === 'folder') && (item.label + ' ' + summary(item)).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query));
  if (!items.length) { host.innerHTML = '<p class="library-empty">' + (query || category !== 'all' ? 'No hay coincidencias. Prueba otra búsqueda o categoría.' : 'Tu biblioteca está vacía. Arrastra aquí una acción o explora las acciones preparadas.') + '</p>'; return; }
  items.forEach(item => {
    const b = document.createElement('button'); b.className = 'tile' + (item.id === selected ? ' selected' : '') + (incomplete(item) ? ' unfinished' : ''); b.draggable = true; b.dataset.id = item.id;
    b.title = item.label + ' · ' + summary(item) + '\nArrastra al anillo o haz doble clic para añadirla.';
    const glyph = document.createElement('span'); glyph.className = 'row-glyph';
    if (item.color) { glyph.dataset.tint = ''; glyph.style.setProperty('--tint', item.color); }
    paintGlyph(glyph, item, config);
    const name = document.createElement('span'); name.className = 'tile-name'; name.textContent = item.label;
    const detail = document.createElement('small'); detail.textContent = summary(item); name.append(detail);
    const add = document.createElement('span'); add.className = 'tile-add'; add.innerHTML = icon('plus'); add.title = 'Añadir al anillo'; add.setAttribute('role', 'button');
    add.onclick = e => { e.stopPropagation(); if (toRing(item.id)) toast('«' + item.label + '» añadida al anillo.'); };
    const del = document.createElement('span'); del.className = 'tile-remove'; del.innerHTML = icon('x'); del.title = 'Eliminar de la biblioteca'; del.setAttribute('role', 'button');
    del.onclick = e => { e.stopPropagation(); const loc = locate(item.id); loc.list.splice(loc.index, 1); if (selected === item.id) selected = config.items[0].id; commit(); toast('«' + item.label + '» eliminada. Ctrl + Z para deshacer.'); };
    b.append(glyph, name, add, del);
    b.onclick = () => select(item.id);
    b.ondblclick = () => toRing(item.id);
    b.ondragstart = e => beginDrag(e, item.id);
    b.ondragend = endDrag;
    if (libraryCatalog) {
      b.draggable = false; del.remove();
      b.title = 'Añadir «' + item.label + '» al anillo';
      const addRecipe = () => { if (config.items.length >= MAX_ITEMS) return toast(fullMessage(null, config.items)); const copy = { ...item, id: newId() }; config.items.push(copy); selected = copy.id; commit(); toast('«' + copy.label + '» añadida. Puedes personalizarla en el inspector.'); };
      b.onclick = addRecipe; b.ondblclick = null; add.onclick = e => { e.stopPropagation(); addRecipe(); };
    }
    host.append(b);
  });
}
dropZone($('#library-card'), id => { const loc = locate(id); if (loc && !loc.library) toLibrary(id); else if (loc) moveTo(id, config.library, config.library.length); }, () => config.library);
dropZone($('#actions'), id => toRing(id), () => config.items);
// Empty preview space is never an implicit removal target.
dropZone($('#stage'), id => { if (locate(id)?.library) toRing(id); }, () => config.items);
dropZone($('#ring-store'), toLibrary, () => config.library);
function beginDrag(e, id) {
  dragId = id; document.body.dataset.dragging = '';
  stage?.clearAim();
  e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
}
function endDrag() {
  dragId = null; delete document.body.dataset.dragging;
  $('#stage').removeAttribute('data-drop-hint');
  $('#stage .insert-marker')?.remove();
  $$('.dragging,.drop-zone,.drop-target,.drop-before,.drop-after,.drop-into').forEach(el => el.classList.remove('dragging', 'drop-zone', 'drop-target', 'drop-before', 'drop-after', 'drop-into'));
}
document.addEventListener('dragend', endDrag);
function toggleLibrary(open) {
  $('#library-card').hidden = !open; $('#library-toggle').setAttribute('aria-expanded', String(open));
  if (open) { drawLibrary(); $('#library-search').focus({ preventScroll: true }); }
}
$('#library-toggle').onclick = () => toggleLibrary($('#library-card').hidden);
$('#library-close').onclick = () => { toggleLibrary(false); $('#library-toggle').focus(); };
$('#library-search').oninput = drawLibrary;
$('#library-filter').onchange = drawLibrary;
for (const [id, catalog] of [['library-saved', false], ['library-catalog', true]]) $('#' + id).onclick = () => {
  libraryCatalog = catalog;
  for (const tab of $$('.library-tabs button')) { const active = tab.id === id; tab.classList.toggle('selected', active); tab.setAttribute('aria-selected', String(active)); }
  drawLibrary();
};
$('#ring-store').onclick = $('#store-selected').onclick = () => toLibrary(selected);
$('#library-add').onclick = () => { const item = newItem('url'); if (config.library.length >= MAX_LIBRARY) return toast(fullMessage(null, config.library)); config.library.push(item); selected = item.id; commit(); setTimeout(() => { $('#action-name').focus(); $('#action-name').select(); }, 0); };
$('#library-add-app').onclick = () => openApps('library');

// --- Perfiles ---------------------------------------------------------------------------
// Cada perfil es un anillo guardado. El activo vive en config.items; al cambiar, el anillo
// actual se guarda en su perfil y el elegido pasa a ser el anillo.
const activeProfile = () => config.profiles.find(p => p.id === config.activeProfile);
function switchTo(id) {
  if (id === config.activeProfile) return;
  selectionMode = false; checkedActions.clear(); $('#action-search').value = '';
  const target = config.profiles.find(p => p.id === id); if (!target) return;
  config.profiles = config.profiles.map(p => p.id === config.activeProfile ? { ...p, items: config.items } : p.id === id ? { ...p, items: null } : p);
  config.items = target.items; config.activeProfile = id; selected = config.items[0].id;
  commit({ replay: true });
}
function drawProfiles() {
  const host = $('#profile-tabs'); host.replaceChildren();
  config.profiles.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'profile-tab' + (p.id === config.activeProfile ? ' active' : ''); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(p.id === config.activeProfile));
    b.innerHTML = icon(p.icon) + '<span></span>' + (p.hotkey ? '<small></small>' : '');
    b.querySelector('span').textContent = p.name;
    if (p.hotkey) b.querySelector('small').textContent = prettyKeys(p.hotkey, '+');
    b.title = p.id === config.activeProfile ? 'Perfil activo' : 'Cambiar a «' + p.name + '» (' + (i + 1) + ')';
    b.onclick = () => switchTo(p.id);
    host.append(b);
  });
  const p = activeProfile();
  setValue($('#profile-name'), p.name);
  if (!$('#profile-hotkey').classList.contains('recording')) $('#profile-hotkey').value = p.hotkey ? prettyKeys(p.hotkey) : '';
  $('#profile-clear-hotkey').hidden = !p.hotkey;
  $('#profile-delete').disabled = config.profiles.length < 2;
  $('#profile-add').disabled = config.profiles.length >= MAX_PROFILES;
}
$('#profile-add').onclick = () => {
  if (config.profiles.length >= MAX_PROFILES) return toast('Puede haber hasta ' + MAX_PROFILES + ' perfiles.');
  const copy = structuredClone(config.items), fresh = item => { item.id = newId(); delete item.hotkey; (item.items || []).forEach(fresh); }; copy.forEach(fresh);
  const id = 'p-' + newId().slice(0, 8);
  config.profiles.push({ id, name: 'Perfil ' + (config.profiles.length + 1), icon: ['briefcase', 'rocket', 'palette', 'code', 'music', 'book', 'star', 'coffee'][config.profiles.length % 8], hotkey: '', items: copy });
  switchTo(id);
  setTimeout(() => { $('#profile-name').focus(); $('#profile-name').select(); }, 0);
  toast('Perfil nuevo, copia del anterior. Cámbiale el nombre y las acciones.');
};
$('#profile-name').oninput = e => { const name = e.target.value.slice(0, 30); activeProfile().name = name.trim() ? name : activeProfile().name; drawProfiles(); if (name.trim()) { record('profile-name'); scheduleSave(); } };
$('#profile-delete').onclick = () => {
  if (config.profiles.length < 2) return;
  const gone = activeProfile(), other = config.profiles.find(p => p.id !== gone.id);
  switchTo(other.id);
  config.profiles = config.profiles.filter(p => p.id !== gone.id); commit();
  toast('Perfil «' + gone.name + '» eliminado. Ctrl + Z para deshacer.');
};
$('#profile-clear-hotkey').onclick = () => { activeProfile().hotkey = ''; commit(); };

function drawStage(replay = false) {
  $('#library-card').style.top = $('.studio').offsetTop + 'px';
  $('#library-card').style.width = Math.min(390, Math.max(320, $('.list-card').clientWidth + 40)) + 'px';
  stage?.destroy();
  stage = previewMount($('#stage'), { replay, hint: 'Elige', onSelect: item => selectionMode ? toggleChecked(item.id) : select(item.id) });
  if (!stage) return;
  stage.reveal(selected); stage.mark(selected);
  drawBatch();
}
$('#stage').addEventListener('pointermove', e => { if (!dragId) stage?.queueTrack(e.clientX, e.clientY); });
$('#stage').addEventListener('dragstart', e => { const button = e.target.closest('[data-id]'); if (button) beginDrag(e, button.dataset.id); });
// Chromium can report the stage as the event target at the edge of a scaled
// circle. Resolve the visible buttons by screen coordinates, with a small halo.
function circleDropTarget(e) {
  let closest = null, distance = Infinity;
  for (const button of $$('#stage .ring-opt,#stage .ring-sub')) {
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2, size = Math.max(r.width, r.height);
    const angle = parseFloat(button.style.getPropertyValue('--a')) * Math.PI / 180;
    const dx = e.clientX - x, dy = e.clientY - y, d = Math.hypot(dx, dy);
    // Clockwise is "after" throughout the ring, including its left and bottom
    // sides. Use the same tangent for submenus and rotated configurations.
    const along = -Math.sin(angle) * dx + Math.cos(angle) * dy;
    const across = Math.cos(angle) * dx + Math.sin(angle) * dy;
    const side = Math.abs(along) > size * .32 && Math.abs(across) <= size / 2 + 10;
    if (d > size / 2 + (side ? 26 : 12) || d >= distance) continue;
    const where = side ? (along < 0 ? 'before' : 'after') : 'center';
    const offset = (where === 'before' ? -1 : 1) * (size / 2 + 7);
    closest = { button, where, x: x - Math.sin(angle) * offset, y: y + Math.cos(angle) * offset, angle };
    distance = d;
  }
  return closest;
}
function clearCircleDrop() {
  $$('#stage .drop-target').forEach(el => el.classList.remove('drop-target'));
  $('#stage .insert-marker')?.remove(); $('#stage').removeAttribute('data-drop-hint');
}
function swapItems(id, targetId) {
  const from = locate(id), to = locate(targetId);
  if (!from || !to || id === targetId) return;
  const problem = canPlace(from.item, to.parent, to.level - 1) || canPlace(to.item, from.parent, from.level - 1);
  if (problem) return toast(problem);
  from.list[from.index] = to.item; to.list[to.index] = from.item;
  selected = id; commit(); toast('Posiciones intercambiadas. Se conservan las dos acciones.');
}
function groupItems(id, targetId) {
  const from = locate(id), to = locate(targetId);
  if (!from || !to || id === targetId) return;
  if (contains(from.item, targetId) || contains(to.item, id)) return toast('No se puede agrupar una acción con uno de sus propios grupos.');
  if (to.level + 1 + Math.max(height(from.item), height(to.item)) > MAX_LEVEL) return toast('Solo caben dos niveles de grupos.');
  if (from.list.length <= minimum(from.parent, from.list)) return toast(lowMessage(from.parent));
  const group = { id: newId(), label: 'Nuevo grupo', type: 'group', target: '', icon: 'layers', color: '', items: [to.item, from.item] };
  to.list[to.index] = group; from.list.splice(from.index, 1);
  selected = group.id; commit(); toast('Grupo creado con las dos acciones. Puedes cambiar su nombre.');
}
$('#stage').addEventListener('dragover', e => {
  if (!dragId) return;
  e.preventDefault(); e.stopPropagation();
  const hit = circleDropTarget(e), target = hit && locate(hit.button.dataset.id)?.item;
  clearCircleDrop();
  $('#stage').classList.remove('drop-zone');
  if (!target || target.id === dragId) return;
  e.dataTransfer.dropEffect = 'move';
  if (hit.where !== 'center') {
    const marker = document.createElement('span'), rect = $('#stage').getBoundingClientRect();
    marker.className = 'insert-marker'; marker.style.left = hit.x - rect.left + 'px'; marker.style.top = hit.y - rect.top + 'px'; marker.style.rotate = hit.angle + 'rad';
    $('#stage').append(marker);
    $('#stage').dataset.dropHint = (hit.where === 'before' ? 'Colocar antes de «' : 'Colocar después de «') + target.label + '»';
  } else {
    hit.button.classList.add('drop-target');
    $('#stage').dataset.dropHint = target.type === 'group' && !e.shiftKey ? 'Añadir a «' + target.label + '»' : e.altKey ? 'Crear un grupo con ambas acciones' : 'Intercambiar con «' + target.label + '»';
  }
}, true);
$('#stage').addEventListener('dragleave', e => { if (!$('#stage').contains(e.relatedTarget)) clearCircleDrop(); });
$('#stage').addEventListener('drop', e => {
  const hit = circleDropTarget(e); if (!dragId || !hit) return;
  e.preventDefault(); e.stopPropagation(); const id = dragId, target = locate(hit.button.dataset.id)?.item; endDrag();
  if (!target || id === target.id) return;
  if (hit.where !== 'center') moveItem(id, target.id, hit.where);
  else if (target.type === 'group' && !e.shiftKey) moveItem(id, target.id, 'into');
  else if (e.altKey) groupItems(id, target.id);
  else swapItems(id, target.id);
}, true);
$('#stage').addEventListener('pointerleave', () => stage?.clearAim());
$('#replay').onclick = () => drawStage(true);

// Slot contents are persisted independently from the action editor's undo history.
let clipBusy = false, clipDraftKey = '';
for (let n = 1; n <= 12; n++) $('#clip-slot').add(new Option('Espacio ' + n, String(n)));
function drawClipboard() {
  const item = current(); if (item?.type !== 'clipboard') return;
  const key = item.id + ':' + item.target;
  if (clipDraftKey !== key) { $('#clip-text').value = ''; clipDraftKey = key; }
  $('#clip-slot').value = item.target; $('#clip-mode').value = item.fileMode || 'copy'; $('#clip-action').value = item.clipAction || 'paste';
  const clip = state.clips?.[item.target];
  $('#clip-status').textContent = clipBusy ? 'Procesando…' : !clip ? 'Todavía no has guardado contenido' : clip.kind === 'text' ? 'Texto guardado' : clip.mode === 'copy' ? 'Copia guardada en HALO' : 'Referencia al original';
  $('#clip-preview').textContent = clip?.preview || '';
  $('#clip-action-help').textContent = (item.clipAction || 'paste') === 'paste'
    ? 'Archivos: coloca el ratón sobre una carpeta abierta del Explorador o sobre el escritorio y abre el anillo con tu atajo. Se usa ese destino; si no se reconoce, podrás elegirlo. Texto: se pega en la aplicación anterior.'
    : item.clipAction === 'copy' ? 'El círculo solo copia. Después elige dónde pegar y pulsa Ctrl + V.' : 'Copia las ubicaciones como texto; no pega los archivos.';
  for (const el of $$('#clipboard-tools button, #clipboard-tools select')) el.disabled = clipBusy;
  $('#clip-copy').disabled = $('#clip-clear').disabled = clipBusy || !clip;
  $('#clip-paste-folder').hidden = state.platform !== 'win32' || clip?.kind !== 'files';
  $('#clip-paste-folder').disabled = clipBusy;
  $('#clip-edit-text').disabled = clipBusy || clip?.kind !== 'text';
}
async function saveClipboard(op, extra = {}, item = current()) {
  if (clipBusy || item?.type !== 'clipboard') return;
  clipBusy = true; drawClipboard();
  try {
    const result = await window.aptic.clipboard({ slot: item.target, mode: item.fileMode || 'copy', op, ...extra });
    if (result?.clips) { state.clips = result.clips; drawList(); drawLibrary(); toast(op === 'copy' ? 'Copiado. Ya puedes pegarlo donde quieras.' : op === 'paste-folder' ? 'Contenido pegado en la carpeta elegida.' : op === 'clear' ? 'Espacio vaciado.' : 'Guardado en el espacio ' + item.target + '.'); }
  } catch (error) { toast(cleanError(error.message)); }
  finally { clipBusy = false; drawClipboard(); }
}
$('#clip-slot').onchange = e => { const item = current(); item.target = e.target.value; if (/^Espacio \d+$/.test(item.label)) item.label = 'Espacio ' + item.target; commit(); };
$('#clip-mode').onchange = e => { current().fileMode = e.target.value; commit(); };
$('#clip-action').onchange = e => { current().clipAction = e.target.value; commit(); };
$('#clip-capture').onclick = () => saveClipboard('capture');
$('#clip-pick').onclick = () => saveClipboard('pick');
$('#clip-pick-folder').onclick = () => saveClipboard('pick-folder');
$('#clip-copy').onclick = () => saveClipboard('copy');
$('#clip-paste-folder').onclick = () => saveClipboard('paste-folder');
$('#clip-clear').onclick = () => saveClipboard('clear');
$('#clip-save-text').onclick = () => saveClipboard('text', { text: $('#clip-text').value });
$('#clip-edit-text').onclick = async () => {
  const item = current(), key = item.id + ':' + item.target;
  try { const clip = await window.aptic.clipboard({ op: 'get', slot: item.target }); if (key === clipDraftKey) $('#clip-text').value = clip?.text || ''; }
  catch (error) { toast(cleanError(error.message)); }
};
function clipDrop(e, item) {
  e.preventDefault(); e.stopPropagation();
  const paths = [...e.dataTransfer.files].map(file => window.aptic.pathFor(file)).filter(Boolean);
  if (paths.length) saveClipboard('files', { paths }, item);
  else saveClipboard('text', { text: e.dataTransfer.getData('text/plain') }, item);
}
$('#clip-drop').ondragover = e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('dragover'); };
$('#clip-drop').ondragleave = e => e.currentTarget.classList.remove('dragover');
$('#clip-drop').ondrop = e => { e.currentTarget.classList.remove('dragover'); clipDrop(e, current()); };
$('#clip-drop').onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); saveClipboard('capture'); } };
// Capture external drops before the existing action-reordering handlers see them.
for (const host of [$('#stage'), $('#actions')]) {
  const droppedItem = e => { const id = e.target.closest('[data-id]')?.dataset.id; const item = id && locate(id)?.item; return !dragId && item?.type === 'clipboard' ? item : null; };
  host.addEventListener('dragover', e => { if (droppedItem(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
  host.addEventListener('drop', e => { const item = droppedItem(e); if (item) clipDrop(e, item); }, true);
}
$('#add-clipboard').onclick = () => {
  if (config.items.length >= MAX_ITEMS) return toast('El anillo está lleno. Mueve una acción a la biblioteca para añadir el grupo.');
  const group = newItem('group', 'Portapapeles'); group.icon = 'clipboard';
  group.items = Array.from({ length: 5 }, (_, i) => ({ ...newItem('clipboard', 'Espacio ' + (i + 1)), target: String(i + 1) }));
  config.items.push(group); selected = group.items[0].id; commit();
  toast('Cinco círculos listos. Puedes añadir más acciones de tipo Portapapeles y elegir espacios del 1 al 12.');
};
$('#add-clipboard-single').onclick = () => {
  const used = new Set(Object.keys(state.clips || {}));
  const collect = items => { for (const item of items || []) { if (item.type === 'clipboard') used.add(item.target); collect(item.items); } };
  collect(config.items); collect(config.library); config.profiles.forEach(profile => collect(profile.items));
  const slot = Array.from({ length: 12 }, (_, i) => String(i + 1)).find(id => !used.has(id));
  if (!slot) return toast('Los 12 espacios ya están en uso. Puedes elegir uno existente en una acción de tipo Portapapeles.');
  const item = newItem('clipboard', 'Espacio ' + slot); item.target = slot;
  if (insert(item, { list: config.items, index: config.items.length, parent: null, level: 0 })) toast('Espacio individual añadido al anillo. Guarda texto, archivos o carpetas.');
};

// Las vistas previas de Tema y Forma: un «escritorio» con texto debajo para ver el velo, y
// un recorrido automático por las acciones para enseñar el indicador y las etiquetas.
function buildPreviewCards() {
  $$('[data-preview]').forEach(card => {
    card.innerHTML = '<div class="card-head"><span><i class="status-dot"></i>Vista previa</span><div><button class="tool" data-replay title="Repetir animación" aria-label="Repetir animación">' + icon('rotate-ccw') + '</button></div></div>'
      + '<div class="wallpaper"><div class="wallpaper-text"><b>Un lugar para pensar</b>Lo que necesitas, alrededor del cursor. Abre el anillo sobre cualquier ventana: el velo lo separa de lo que haya debajo sin taparlo.</div><div class="ring-host"></div></div>'
      + '<div class="preview-note"><span>Pasa el ratón por encima para apuntar</span><span data-gesture></span></div>';
    card.querySelector('[data-replay]').onclick = () => drawPreviews(true);
    const host = card.querySelector('.ring-host');
    host.addEventListener('pointermove', e => { card.dataset.hover = ''; previews.find(p => p.host === host)?.api?.queueTrack(e.clientX, e.clientY); });
    host.addEventListener('pointerleave', () => { delete card.dataset.hover; previews.find(p => p.host === host)?.api?.clearAim(); });
  });
}
function drawPreviews(replay = false) {
  previews.forEach(p => p.api?.destroy());
  previews = $$('.page:not([hidden]) [data-preview]').map(card => {
    const host = card.querySelector('.ring-host');
    return { card, host, api: previewMount(host, { replay, hint: 'Apunta', extra: 30 }) };
  });
  $$('[data-gesture]').forEach(el => { el.textContent = gestureText(); });
}
let demoStep = 0;
clearInterval(demoTimer);
demoTimer = setInterval(() => {
  for (const p of previews) { if (!p.api || 'hover' in p.card.dataset) continue; p.api.aimAt(demoStep % config.items.length); }
  demoStep++;
}, 1600);

// --- Controles de ajustes -------------------------------------------------------------
function buildStatic() {
  RECIPES.filter(r => r[1] === 'keys' && (state.platform === 'win32' || !r[2].startsWith('Super+'))).forEach(([label, , target]) => $('#key-preset').add(new Option(label + ' · ' + prettyKeys(target), target)));
  const types = $('#types');
  for (const [type, name, glyph] of TYPES) {
    const b = document.createElement('button'); b.dataset.type = type; b.innerHTML = icon(glyph) + '<span></span>'; b.querySelector('span').textContent = name;
    b.onclick = () => changeType(type); types.append(b);
  }
  const themes = $('#themes');
  for (const t of THEMES) {
    const b = document.createElement('button'); b.dataset.themeValue = t.id;
    b.innerHTML = '<span class="theme-thumb' + (t.id === 'system' ? ' system' : '') + '" style="--tb:' + t.bg + ';--ts:' + t.surface + ';--tt:' + t.text + '"><u></u>' + [0, 1, 2, 3, 4, 5].map(k => '<i style="--k:' + k + '"></i>').join('') + '<b></b></span><span class="theme-name"><span></span>' + icon('check') + '</span>';
    b.querySelector('.theme-name span').textContent = t.name;
    b.onclick = () => { config.theme = t.id; commit(); };
    themes.append(b);
  }
  $$('.style-art').forEach(art => art.querySelectorAll('i').forEach((i, k) => i.style.setProperty('--k', k)));
  buildPreviewCards();
}
function renderControls() {
  theme(config, state.dark);
  $$('[data-theme-value]').forEach(b => b.classList.toggle('selected', b.dataset.themeValue === config.theme));
  drawSwatches($('#accents'), config.accent, color => { config.accent = color; commit({ key: 'accent' }); }, false);
  $$('[data-setting]').forEach(el => {
    const key = el.dataset.setting, value = config[key];
    if (el.type === 'checkbox') el.checked = value;
    else if (el.type === 'color') setValue(el, value);
    else if (el.type === 'range') { setValue(el, String(value)); el.style.setProperty('--fill', ((value - el.min) / (el.max - el.min) * 100) + '%'); }
    else el.querySelectorAll('[data-value]').forEach(b => b.classList.toggle('selected', b.dataset.value === value));
  });
  $$('output[data-for]').forEach(o => { o.textContent = config[o.dataset.for] + UNITS[o.dataset.for]; });
  $('#hub-size-row').classList.toggle('muted-row', config.labels === 'center');
  // Atajo y gestos
  const s = config.shortcut;
  if (!$('#accelerator').classList.contains('recording')) $('#accelerator').value = prettyKeys(s.accelerator);
  keyChips($('#accelerator-keys'), s.accelerator);
  $$('#shortcut-mode [data-value]').forEach(b => { b.classList.toggle('selected', b.dataset.value === s.mode); b.disabled = b.dataset.value !== 'single' && !state.native; });
  $$('#mouse [data-value]').forEach(b => { b.classList.toggle('selected', b.dataset.value === config.mouse); b.disabled = b.dataset.value !== 'none' && !state.native; });
  $$('[data-setting="modifierTap"] [data-value]').forEach(b => { b.disabled = b.dataset.value !== 'none' && !state.native; });
  $('#interval-row').hidden = s.mode !== 'double' && config.modifierTap === 'none' && !(config.mouse !== 'none' && config.mouseMode === 'double');
  setValue($('#interval'), String(s.interval)); $('#interval').style.setProperty('--fill', ((s.interval - 180) / 520 * 100) + '%');
  $('#interval-output').textContent = s.interval + ' ms';
  if (!$('#next-profile-key').classList.contains('recording')) $('#next-profile-key').value = config.nextProfileKey ? prettyKeys(config.nextProfileKey) : '';
  $('#clear-next-profile').hidden = !config.nextProfileKey;
  $('#mode-hint').textContent = { single: 'Pulsa la combinación para abrir el anillo y elige con un clic, con las flechas o con 1–9.', double: 'Mantén los modificadores y pulsa y suelta la tecla dos veces. Evita combinaciones como Ctrl + X: la aplicación activa también las recibe.', hold: 'Mantén la combinación, empuja el cursor hacia la acción y suelta para elegirla. La aplicación activa también recibe la combinación.' }[s.mode];
  $('#native-note').textContent = state.native ? 'El detector de gestos es pasivo y vive en un proceso aislado: no bloquea la combinación ni el botón para las demás aplicaciones, y no guarda ni envía nada de lo que escribes. En macOS necesita permiso de Accesibilidad; en Linux, una sesión X11.' : 'El detector nativo (uiohook-napi) no está instalado: solo están disponibles la pulsación simple, las esquinas y los atajos directos.';
  $('#config-path').textContent = state.configPath; $('#version').textContent = state.version;
  drawTester();
  updateStatus();
}
function gestureText() {
  const s = config.shortcut;
  const parts = [{ single: 'Pulsa', double: 'Doble pulsación de', hold: 'Mantén' }[s.mode] + ' ' + prettyKeys(s.accelerator)];
  if (config.mouse !== 'none') parts.push(({ hold: 'mantén', single: 'pulsa', double: 'doble clic en' }[config.mouseMode]) + ' ' + ({ middle: 'la rueda', back: 'el lateral atrás', forward: 'el lateral adelante' }[config.mouse]));
  if (config.modifierTap !== 'none') parts.push('doble ' + prettyKeys(config.modifierTap));
  if (config.hotCorner !== 'none') parts.push('esquina');
  return parts.join(' · ');
}
function updateStatus() {
  const ok = state.shortcutStatus === 'Activo' || state.shortcutStatus === 'Modo de prueba' || /portal/.test(state.shortcutStatus);
  for (const id of ['#shortcut-status', '#shortcut-status-2']) $(id).textContent = state.shortcutStatus === 'Activo' ? 'Gestos activos' : state.shortcutStatus;
  $$('.status-dot').forEach(dot => { if (dot.closest('.status-card,.status-line')) dot.classList.toggle('off', !ok); });
  const active = state.config;
  keyChips($('#nav-keys'), active.shortcut.accelerator);
  const extra = [active.mouse !== 'none' && { middle: 'rueda', back: 'botón atrás', forward: 'botón adelante' }[active.mouse], active.modifierTap !== 'none' && 'doble ' + prettyKeys(active.modifierTap), active.hotCorner !== 'none' && 'esquina'].filter(Boolean);
  $('#nav-gesture').textContent = { single: 'Una pulsación', double: 'Doble pulsación', hold: 'Mantén, apunta y suelta' }[active.shortcut.mode] + (extra.length ? ' · ' + extra.join(' · ') : '');
  $('#pin').classList.toggle('on', !!state.pinned); $('#pin').setAttribute('aria-pressed', String(!!state.pinned));
  $('#pin b').textContent = state.pinned ? 'Anillo en vivo' : 'Ver en vivo';
}
function renderAll(replay = false, list = true) {
  renderControls();
  if (list) { drawList(); drawLibrary(); }
  drawProfiles();
  drawInspector();
  if (page === 'actions') drawStage(replay); else drawPreviews(replay);
}

// --- Probador de gestos: se ilumina cada gesto al llegar ------------------------------------
function drawTester() {
  const host = $('#tester-chips'); if (!host) return;
  const s = config.shortcut, chips = [['shortcut', { single: 'Pulsa', double: 'Doble', hold: 'Mantén' }[s.mode] + ' ' + prettyKeys(s.accelerator)]];
  if (config.mouse !== 'none') chips.push(['mouse', { middle: 'Rueda del ratón', back: 'Lateral atrás', forward: 'Lateral adelante' }[config.mouse]]);
  if (config.modifierTap !== 'none') chips.push(['modifier', 'Doble ' + prettyKeys(config.modifierTap)]);
  if (config.hotCorner !== 'none') chips.push(['corner', 'Esquina ' + { 'top-left': 'superior izquierda', 'top-right': 'superior derecha', 'bottom-left': 'inferior izquierda', 'bottom-right': 'inferior derecha' }[config.hotCorner]]);
  const hotkeys = [];
  const walk = items => items.forEach(item => { if (item.hotkey) hotkeys.push(item); if (item.items) walk(item.items); });
  walk(config.items);
  hotkeys.forEach(item => chips.push(['hotkey:' + item.label, prettyKeys(item.hotkey) + ' → ' + item.label]));
  config.profiles.filter(p => p.hotkey).forEach(p => chips.push(['profile:' + p.name, prettyKeys(p.hotkey) + ' → perfil ' + p.name]));
  if (config.nextProfileKey) chips.push(['profile:*', prettyKeys(config.nextProfileKey) + ' → siguiente perfil']);
  host.replaceChildren(...chips.map(([source, text]) => { const c = document.createElement('span'); c.className = 'tester-chip'; c.dataset.source = source; c.textContent = text; return c; }));
}
window.aptic.onGesture(event => {
  const key = event.source === 'hotkey' ? 'hotkey:' + event.detail : event.source === 'profile' ? 'profile:' + event.detail : event.source;
  const chip = $(`.tester-chip[data-source="${CSS.escape(key)}"]`) || (event.source === 'profile' ? $('.tester-chip[data-source="profile:*"]') : null);
  if (chip) { chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash'); }
  const log = $('#tester-log');
  if (log) log.textContent = (SOURCES[event.source] || event.source) + (event.detail ? ' · ' + event.detail : '') + ' — ' + new Date(event.at).toLocaleTimeString();
});

// --- Acciones del editor --------------------------------------------------------------
function select(id) {
  if (!locate(id)) return;
  if (selectionMode) { selectionMode = false; checkedActions.clear(); }
  let parent = locate(id).parent; while (parent) { foldedGroups.delete(parent.id); parent = locate(parent.id)?.parent; }
  selected = id;
  drawList();
  $$('.row,.tile').forEach(el => { const active = el.dataset.id === id; el.classList.toggle('selected', active); if (el.classList.contains('row')) el.setAttribute('aria-selected', String(active)); });
  drawInspector(); stage?.reveal(id); stage?.mark(id);
  const row = $(`.row[data-id="${CSS.escape(id)}"]`);
  if (row) { const list = $('#actions'), rect = row.getBoundingClientRect(), bounds = list.getBoundingClientRect(); if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top; else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom; }
}
function changeType(type) {
  const item = current(); if (!item || item.type === type || (type === 'system' && item.type === 'folder')) return;
  const loc = locate(item.id);
  if (type === 'group' && loc.level >= MAX_LEVEL) return;
  const lost = item.type === 'group' ? item.items.length : 0;
  const wasDefault = item.icon === DEFAULT_ICON[item.type];
  item.type = type; item.target = DEFAULT_TARGET[type];
  if (wasDefault || type === 'group') item.icon = DEFAULT_ICON[type];
  if (type === 'group') item.items = [newItem('url')]; else delete item.items;
  commit();
  if (lost) toast('Se quitaron ' + lost + (lost === 1 ? ' acción' : ' acciones') + ' del grupo. Ctrl + Z para deshacer.');
  if (type === 'keys') setTimeout(() => $('#action-keys').focus(), 0);
  if (type === 'url' || type === 'text') setTimeout(() => (type === 'url' ? $('#action-url') : $('#action-text')).focus(), 0);
  if (type === 'path') openApps('set');
}
// Dónde va una acción nueva: tras la elegida, o dentro si la elegida es un grupo.
function insertionPoint() {
  const loc = locate(selected);
  if (!loc || loc.library) return { list: config.items, index: config.items.length, parent: null, level: 0 };
  if (loc.item.type === 'group') return { list: loc.item.items, index: loc.item.items.length, parent: loc.item, level: loc.level + 1 };
  return { list: loc.list, index: loc.index + 1, parent: loc.parent, level: loc.level };
}
function insert(item, at) {
  if (at.list.length >= capacity(at.parent, at.list)) { toast(fullMessage(at.parent, at.list)); return false; }
  if (at.level + height(item) > MAX_LEVEL) { toast('Solo caben dos niveles de grupos.'); return false; }
  at.list.splice(at.index, 0, item); selected = item.id; commit(); return true;
}
function addItem(group) {
  let at = insertionPoint();
  // Un grupo nuevo no cabe dentro de un subgrupo: va junto a él.
  if (group && at.level >= MAX_LEVEL) { const loc = locate(selected), p = locate(loc.item.type === 'group' ? loc.item.id : loc.parent.id); at = { list: p.list, index: p.index + 1, parent: p.parent, level: p.level }; }
  if (insert(group ? newItem('group', at.level ? 'Nuevo subgrupo' : 'Nuevo grupo') : newItem('url'), at)) setTimeout(() => { $('#action-name').focus(); $('#action-name').select(); }, 0);
}
$('#add').onclick = () => addItem(false);
$('#add-group').onclick = () => addItem(true);
$('#add-app').onclick = () => openApps('add');
$('#group-add').onclick = () => addItem(false);
$('#group-add-sub').onclick = () => addItem(true);
$('#remove').onclick = () => {
  const loc = locate(selected); if (!loc || loc.list.length <= minimum(loc.parent, loc.list)) return;
  loc.list.splice(loc.index, 1);
  selected = (loc.list[Math.min(loc.index, loc.list.length - 1)] || loc.parent || config.items[0]).id;
  commit(); toast('«' + loc.item.label + '» eliminada. Ctrl + Z para deshacer.');
};
$('#duplicate').onclick = () => {
  const loc = locate(selected); if (!loc || loc.list.length >= capacity(loc.parent, loc.list)) return;
  const copy = structuredClone(loc.item); copy.label = (copy.label + ' (copia)').slice(0, 50); delete copy.hotkey;
  const fresh = item => { item.id = newId(); delete item.hotkey; (item.items || []).forEach(fresh); }; fresh(copy);
  loc.list.splice(loc.index + 1, 0, copy); selected = copy.id; commit();
};
for (const [id, delta] of [['move-up', -1], ['move-down', 1]]) $('#' + id).onclick = () => {
  const loc = locate(selected), next = loc.index + delta;
  if (next < 0 || next >= loc.list.length) return;
  [loc.list[loc.index], loc.list[next]] = [loc.list[next], loc.list[loc.index]]; commit();
};
$('#action-place').onchange = e => {
  const loc = locate(selected);
  if (e.target.value === '__library') { if (loc.library) return; return toLibrary(loc.item.id); }
  if (!e.target.value && loc.library && !loc.parent) return toRing(loc.item.id);
  const dest = e.target.value ? locate(e.target.value) : null;
  if (!loc || ((dest?.item || null) === loc.parent && !loc.library)) return;
  const parent = dest?.item || null, list = parent ? parent.items : config.items;
  const problem = canPlace(loc.item, parent, dest?.level ?? -1);
  if (problem) { drawInspector(); return toast(problem); }
  if (list.length >= capacity(parent, list)) { drawInspector(); return toast(fullMessage(parent, list)); }
  if (loc.list.length <= minimum(loc.parent, loc.list)) { drawInspector(); return toast(lowMessage(loc.parent)); }
  // Al sacarla al anillo principal, se coloca justo después del grupo del que venía.
  let top = loc.parent; while (top && locate(top.id).parent) top = locate(top.id).parent;
  loc.list.splice(loc.index, 1);
  if (parent) list.push(loc.item); else list.splice(top ? config.items.indexOf(top) + 1 : list.length, 0, loc.item);
  commit();
};
$('#action-name').oninput = e => { const item = current(); item.label = e.target.value; commit({ key: 'label:' + item.id }); };
$('#system-target').onchange = async e => {
  const item = current();
  if (e.target.value === '__folder') return;
  if (e.target.value === '__other') return pickFolder();
  item.type = 'system'; item.target = e.target.value; commit();
};
// Cualquier carpeta del equipo: el nombre se toma de ella si la acción aún no tenía uno propio.
async function pickFolder() {
  try {
    const target = await window.aptic.pick('folder');
    const item = current();
    if (!target) return drawInspector();
    const keepName = !unnamed(item) && !Object.values(SYSTEM_NAME).includes(item.label) && item.label !== 'Explorador';
    item.type = 'folder'; item.target = target; delete item.items;
    if (!keepName) item.label = target.split(/[\\/]/).filter(Boolean).pop().slice(0, 50) || item.label;
    if (item.icon === DEFAULT_ICON.url || item.icon === DEFAULT_ICON.path) item.icon = 'folder';
    commit();
  } catch (error) { notice(cleanError(error.message)); }
}
$('#action-path').oninput = e => { const item = current(); item.target = e.target.value.trim(); commit({ key: 'path:' + item.id }); };
$('#action-url').oninput = e => { const item = current(); item.target = e.target.value.trim(); commit({ key: 'url:' + item.id }); };
$('#action-text').oninput = e => { const item = current(); item.target = e.target.value; commit({ key: 'text:' + item.id }); };
const fileName = target => target.split(/[\\/]/).pop().replace(/\.(exe|lnk|app|url)$/i, '').slice(0, 50);
const unnamed = item => /^(Nueva acción|Nuevo grupo|Nuevo subgrupo)$/.test(item.label) || item.label === TYPE_NAME[item.type];
for (const [id, kind] of [['pick-file', 'file'], ['pick-folder', 'folder']]) $('#' + id).onclick = async () => {
  try {
    if (kind === 'folder' && current().type === 'folder') return pickFolder();
    const target = await window.aptic.pick(kind); if (!target) return;
    const item = current(); item.target = target;
    if (unnamed(item)) item.label = fileName(target) || item.label;
    if (item.icon === DEFAULT_ICON.url || item.icon === DEFAULT_ICON.path) item.icon = kind === 'folder' ? 'folder' : 'app-window';
    commit();
  } catch (error) { notice(cleanError(error.message)); }
};
$('#pick-app').onclick = () => openApps('set');

// --- Aplicaciones instaladas ----------------------------------------------------------
let apps = null, appsMode = 'set', iconObserver = null;
async function openApps(mode) {
  appsMode = mode; $('#apps-query').value = '';
  $('#apps-title').textContent = mode === 'library' ? 'Añadir aplicaciones a la biblioteca' : mode === 'add' ? 'Añadir una aplicación' : 'Elegir aplicación';
  $('#apps-dialog').showModal(); $('#apps-query').focus();
  if (!apps) { $('#apps-list').innerHTML = '<p class="apps-empty">Buscando tus aplicaciones…</p>'; try { apps = await window.aptic.apps(); } catch (error) { apps = []; notice(cleanError(error.message)); } }
  drawApps();
}
function drawApps() {
  const q = $('#apps-query').value.trim().toLowerCase();
  const list = apps.filter(a => a.name.toLowerCase().includes(q));
  $('#apps-count').textContent = list.length + (list.length === 1 ? ' aplicación' : ' aplicaciones');
  const host = $('#apps-list'); host.replaceChildren();
  if (!list.length) { host.innerHTML = '<p class="apps-empty">' + (apps.length ? 'Nada coincide. Puedes elegir cualquier programa con «Archivo…».' : 'No se encontraron aplicaciones. Usa «Archivo…» para elegir un programa.') + '</p>'; return; }
  iconObserver?.disconnect();
  iconObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return; iconObserver.unobserve(entry.target);
    paintGlyph(entry.target.querySelector('.app-glyph'), { type: 'path', target: entry.target.dataset.path, icon: 'app-window' }, { ...config, nativeIcons: true });
  }), { root: host });
  for (const app of list.slice(0, 400)) {
    const b = document.createElement('button'); b.className = 'app-row'; b.dataset.path = app.path;
    b.innerHTML = '<span class="app-glyph">' + icon('app-window') + '</span><span></span><i class="app-added">' + icon('check') + '</i>';
    b.children[1].textContent = app.name;
    const where = [...config.items, ...config.library].some(function has(i) { return i.target === app.path || (i.items || []).some(has); });
    b.classList.toggle('added', where);
    b.onclick = () => chooseApp(app);
    host.append(b); iconObserver.observe(b);
  }
}
function chooseApp(app) {
  if (appsMode === 'library') {
    // En la biblioteca se añaden varias seguidas: el diálogo se queda abierto.
    const there = config.library.findIndex(i => i.target === app.path);
    if (there >= 0) { config.library.splice(there, 1); commit(); }
    else { if (config.library.length >= MAX_LIBRARY) return toast(fullMessage(null, config.library)); const item = newItem('path', app.name.slice(0, 50)); item.target = app.path; item.icon = 'app-window'; config.library.push(item); commit(); }
    return drawApps();
  }
  $('#apps-dialog').close();
  if (appsMode === 'add') {
    const item = newItem('path', app.name.slice(0, 50)); item.target = app.path; item.icon = 'app-window';
    if (insert(item, insertionPoint())) toast('«' + item.label + '» añadida.');
    return;
  }
  const item = current(); if (!item) return;
  const rename = unnamed(item) || item.type !== 'path';
  item.type = 'path'; item.target = app.path; delete item.items;
  if (rename) item.label = app.name.slice(0, 50);
  if (item.icon === DEFAULT_ICON.url || item.icon === DEFAULT_ICON.system || item.icon === 'folder') item.icon = 'app-window';
  commit();
}
$('#apps-query').oninput = () => apps && drawApps();
$('#apps-close').onclick = () => $('#apps-dialog').close();
$('#apps-file').onclick = async () => { $('#apps-dialog').close(); try { const target = await window.aptic.pick('file'); if (target) chooseApp({ name: fileName(target), path: target }); } catch (error) { notice(cleanError(error.message)); } };
$('#apps-dialog').onclick = e => { if (e.target === $('#apps-dialog')) $('#apps-dialog').close(); };

// Grabadores de combinaciones (el atajo global, los atajos directos y las acciones de teclado).
const CODE_KEYS = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', PrintScreen: 'PrintScreen' };
function readCombo(e, { global }) {
  const parts = []; if (e.ctrlKey) parts.push('Control'); if (e.metaKey) parts.push(isMac() ? 'Command' : 'Super'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift');
  let key = /^(Key[A-Z]|Digit[0-9])$/.test(e.code) ? e.code.replace(/Key|Digit/, '') : /^F([1-9]|1[0-9]|2[0-4])$/.test(e.code) ? e.code : CODE_KEYS[e.code] || null;
  if (global && key && !/^([A-Z0-9]|Space|F\d+)$/.test(key)) key = null;
  if (!key || (global && !parts.length)) return null;
  if (global && parts[0] === 'Control' && !isMac()) parts[0] = 'CommandOrControl';
  return [...parts, key].join('+');
}
function recorder(input, { global, apply }) {
  input.onfocus = () => { input.classList.add('recording'); input.value = 'Pulsa la combinación…'; };
  input.onblur = () => { input.classList.remove('recording'); renderControls(); drawInspector(); drawProfiles(); };
  input.onkeydown = e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) return;
    e.preventDefault();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) { input.blur(); return; }
    const combo = readCombo(e, { global });
    if (!combo) { const held = []; if (e.ctrlKey) held.push('Ctrl'); if (e.altKey) held.push('Alt'); if (e.shiftKey) held.push('Mayús'); if (e.metaKey) held.push(isMac() ? '⌘' : 'Win'); input.value = held.length ? held.join(' + ') + ' + …' : 'Pulsa la combinación…'; return; }
    apply(combo); input.blur();
  };
}
recorder($('#accelerator'), { global: true, apply: combo => { config.shortcut.accelerator = combo; commit(); } });
recorder($('#action-keys'), { global: false, apply: combo => { const item = current(); item.target = combo; if (unnamed(item)) item.label = prettyKeys(combo); commit(); } });
recorder($('#action-hotkey'), { global: true, apply: combo => {
  if (combo === config.shortcut.accelerator) return toast('Esa combinación ya abre el anillo.');
  const other = []; const walk = items => items.forEach(i => { if (i.hotkey === combo && i.id !== selected) other.push(i); if (i.items) walk(i.items); }); walk(config.items);
  if (other.length) return toast('Ya la usa «' + other[0].label + '».');
  current().hotkey = combo; commit();
} });
$('#clear-hotkey').onclick = () => { delete current().hotkey; commit(); };
function hotkeyTaken(combo, except) {
  if (combo === config.shortcut.accelerator) return 'Esa combinación ya abre el anillo.';
  if (combo === config.nextProfileKey && except !== 'next') return 'Esa combinación ya cambia de perfil.';
  const p = config.profiles.find(p => p.hotkey === combo && p.id !== except); if (p) return 'Ya la usa el perfil «' + p.name + '».';
  const walkAll = items => items.some(i => i.hotkey === combo || walkAll(i.items || [])); if (walkAll(config.items)) return 'Ya la usa una acción del anillo.';
  return '';
}
recorder($('#profile-hotkey'), { global: true, apply: combo => { const taken = hotkeyTaken(combo, config.activeProfile); if (taken) return toast(taken); activeProfile().hotkey = combo; commit(); } });
recorder($('#next-profile-key'), { global: true, apply: combo => { const taken = hotkeyTaken(combo, 'next'); if (taken) return toast(taken); config.nextProfileKey = combo; commit(); } });
$('#clear-next-profile').onclick = () => { config.nextProfileKey = ''; commit(); };

// Controles genéricos con data-setting.
const QUIET = ['duration', 'rotation', 'veil', 'shadow', 'opacity', 'hubSize', 'aimScale', 'labelSize'];
$$('[data-setting]').forEach(el => {
  const key = el.dataset.setting;
  if (el.type === 'checkbox') el.onchange = () => { config[key] = el.checked; commit(); };
  else if (el.type === 'color') el.oninput = () => { config[key] = el.value; config.customRingColors = true; commit({ key, list: false }); };
  else if (el.type === 'range') el.oninput = () => { config[key] = Number(el.value); commit({ key, list: false }); };
  else el.querySelectorAll('[data-value]').forEach(b => b.onclick = () => { const again = config[key] === b.dataset.value; config[key] = b.dataset.value; if (again && key === 'animation') return drawPreviews(true); commit({ replay: key === 'animation' || key === 'style' }); });
});
$$('#shortcut-mode [data-value]').forEach(b => b.onclick = () => { config.shortcut.mode = b.dataset.value; commit(); });
$$('#mouse [data-value]').forEach(b => b.onclick = () => { config.mouse = b.dataset.value; commit(); });
$('#interval').oninput = e => { config.shortcut.interval = Number(e.target.value); commit({ key: 'interval', list: false }); };
$('#key-preset').onchange = e => {
  const item = current(), preset = RECIPES.find(r => r[1] === 'keys' && r[2] === e.target.value);
  if (!item || !preset) return;
  item.target = preset[2]; if (item.label === 'Nueva acción') item.label = preset[0];
  if (item.icon === 'keyboard') item.icon = preset[3];
  e.target.value = ''; commit();
};

// Selector de iconos.
function drawIconGrid() {
  const item = current(), names = searchIcons($('#icon-query').value);
  $('#icon-count').textContent = names.length + (names.length === 1 ? ' icono' : ' iconos');
  const grid = $('#icon-grid'); grid.replaceChildren();
  for (const name of names) {
    const b = document.createElement('button'); b.innerHTML = icon(name, config.iconStyle); b.title = name; b.setAttribute('aria-label', name);
    b.classList.toggle('selected', item && item.icon === name && !item.image);
    b.onclick = () => { const it = current(); it.icon = name; delete it.image; commit(); $('#icon-dialog').close(); };
    grid.append(b);
  }
}
$('#choose-icon').onclick = () => { $('#icon-query').value = ''; drawIconGrid(); $('#icon-dialog').showModal(); $('#icon-query').focus(); $('.icon-grid .selected')?.scrollIntoView({ block: 'center' }); };
$('#icon-query').oninput = drawIconGrid;
$('#icon-close').onclick = () => $('#icon-dialog').close();
$('#icon-dialog').onclick = e => { if (e.target === $('#icon-dialog')) $('#icon-dialog').close(); };
$('#choose-image').onclick = async () => { try { const data = await window.aptic.pickImage(); if (data) { current().image = data; commit(); } } catch (error) { notice(cleanError(error.message)); } };
$('#clear-image').onclick = () => { delete current().image; commit(); };

// Navegación.
function showPage(name) {
  page = name;
  document.body.dataset.workspace = name;
  previews.forEach(p => p.api?.destroy()); previews = [];
  $$('.page').forEach(p => { p.hidden = p.id !== 'page-' + name; });
  $$('.nav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  $('#crumb').textContent = 'Preferencias  ›  ' + PAGES[name];
  $('#scroll').scrollTop = 0;
  if (name === 'actions') drawStage(true); else drawPreviews(true);
}
const PALETTES = { graphite: ['#24262b', '#f3f1ee', '#e0a44f'], lagoon: ['#102c32', '#e0f6f1', '#4cc0bd'], lavender: ['#282238', '#f2eafa', '#b9a0ec'], cream: ['#eee7d9', '#38342e', '#aa683c'] };
$$('[data-palette]').forEach(button => button.onclick = () => { [config.ringBackground, config.ringForeground, config.ringAccent] = PALETTES[button.dataset.palette]; config.customRingColors = true; commit(); });
$$('.nav [data-page]').forEach(b => b.onclick = () => showPage(b.dataset.page));

// Datos.
$('#export').onclick = async () => { try { if (await window.aptic.export(config)) toast('Copia exportada.'); } catch (error) { notice(cleanError(error.message)); } };
$('#import').onclick = async () => { try { const value = await window.aptic.import(); if (value) { config = value; selected = config.items[0].id; commit({ replay: true }); toast('Configuración importada y aplicada. Ctrl + Z para volver a la anterior.'); } } catch (error) { notice(cleanError(error.message)); } };
$('#reset').onclick = async () => { config = await window.aptic.defaults(); selected = config.items[0].id; commit({ replay: true }); toast('Ajustes originales recuperados. Ctrl + Z para deshacer.'); };
$('#try').onclick = async () => { await saveNow(); await window.aptic.showMenu(); };
$('#pin').onclick = async () => { await saveNow(); state = await window.aptic.pinMenu(!state.pinned); updateStatus(); if (state.pinned) toast('Anillo en vivo: cambia cualquier ajuste y lo verás al momento. Vuelve a pulsar para quitarlo.'); };
$('#tester-try').onclick = () => $('#try').click();
$('#tester-pin').onclick = () => $('#pin').click();
$('#undo').onclick = () => travel(history, future);
$('#redo').onclick = () => travel(future, history);
$$('[data-window]').forEach(b => b.onclick = () => window.aptic.window(b.dataset.window));
$('#quit').onclick = async () => { await saveNow(); window.aptic.quit(); };
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, typing = e.target.closest('input:not([type=range]):not([type=checkbox]),textarea');
  if (page === 'actions' && !document.querySelector('dialog[open]')) {
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); const field = $('#library-card').hidden ? $('#action-search') : $('#library-search'); field.focus(); field.select(); return; }
    if (e.key === 'Escape' && selectionMode && !typing) { e.preventDefault(); setSelectionMode(false); return; }
    if (e.key === 'Escape' && e.target === $('#action-search')) { e.preventDefault(); $('#action-search').value = ''; drawList(); return; }
    if (!typing && mod && e.key.toLowerCase() === 'a' && selectionMode) { e.preventDefault(); $('#batch-all').click(); return; }
  }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
  if (typing || !mod) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); travel(history, future); }
  if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); travel(future, history); }
});

window.aptic.onState(value => {
  const dark = state?.dark, oldClips = JSON.stringify(state?.clips), previousResult = state?.clipboardResult?.at; state = value; if (!config) return;
  if (value.clipboardResult && value.clipboardResult.at !== previousResult) toast(value.clipboardResult.message);
  if (oldClips !== JSON.stringify(value.clips)) { drawClipboard(); drawList(); drawLibrary(); }
  if (value.profileSwitches !== seenSwitches) {
    selectionMode = false; checkedActions.clear(); $('#action-search').value = '';
    seenSwitches = value.profileSwitches; clearTimeout(saveTimer);
    config = structuredClone(value.config); saved = JSON.stringify(config); lastSnap = snap();
    if (!locate(selected)) selected = config.items[0].id;
    renderAll(true); setSaveState('saved'); toast('Perfil «' + activeProfile().name + '» activo.');
    return;
  } updateStatus(); if (value.warning) notice(value.warning); if (dark !== value.dark) renderControls(); });
async function start() {
  state = await window.aptic.state(); seenSwitches = state.profileSwitches;
  config = structuredClone(state.config); saved = JSON.stringify(config); lastSnap = snap();
  selected = config.items[0].id;
  buildStatic(); renderAll(true); setSaveState('saved'); updateHistoryButtons(); notice(state.warning);
}
start().catch(error => notice('No se pudo cargar la configuración: ' + error.message));
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!config) return; if (page === 'actions') drawStage(); else drawPreviews(); }, 90); });
