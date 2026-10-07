const { app, BrowserWindow, ipcMain, globalShortcut, screen, nativeTheme, shell, dialog, Tray, Menu, nativeImage, utilityProcess, systemPreferences, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { defaults, validate, validateLenient, findItem, walk, Store, boundsFor, switchProfile } = require('./config.cjs');
const { windowSide } = require('../shared/geometry.js');
const { ClipboardStore, slotId } = require('./clipboard-store.cjs');
const fileClipboard = require('./file-clipboard.cjs');
const { createPasteFocus } = require('./paste-focus.cjs');
let pasteFocus, menuDestination = null;
let clipboardResult = null;
let openingMenu = 0, releasedWhileOpening = false;
let clips, clipQueue = Promise.resolve();
const testMode = process.argv.includes('--test-mode');
const profile = process.argv.find(arg => arg.startsWith('--aptic-profile='));
if (profile) app.setPath('userData', profile.slice('--aptic-profile='.length));
app.setName('HALO MENU');
app.setAppUserModelId('app.halo.menu');
// Migrate the saved configuration once; retain the original as a recovery copy.
if (!profile) {
  const haloData = path.join(app.getPath('appData'), 'HALO MENU');
  const legacySettings = path.join(app.getPath('appData'), 'APTIC MENU', 'settings.json');
  fs.mkdirSync(haloData, { recursive: true });
  const haloSettings = path.join(haloData, 'settings.json');
  if (!fs.existsSync(haloSettings) && fs.existsSync(legacySettings)) fs.copyFileSync(legacySettings, haloSettings, fs.constants.COPYFILE_EXCL);
  app.setPath('userData', haloData);
}
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
let editor, overlay, tray, store, config, quitting = false, binding = null, shortcutStatus = 'Sin registrar', warning = '', issues = [];
let profileSwitches = 0, saving = Promise.resolve(), launching = false, holding = null, sender = null, pinned = null, cornerTimer = null, appsCache = null;
const icons = new Map();
const renderer = path.join(__dirname, '../renderer');
const trusted = new Set(['index.html', 'overlay.html'].map(file => pathToFileURL(path.join(renderer, file)).href));
const native = (() => { try { require.resolve('uiohook-napi'); return true; } catch { return false; } })();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function snapshot() { return { config, clips: clips?.summary() || {}, clipboardResult, platform: process.platform, dark: nativeTheme.shouldUseDarkColors, shortcutStatus, warning, issues, version: app.getVersion(), configPath: store.file, native, pinned: !!pinned, profileSwitches }; }
function broadcast() { for (const win of [editor, overlay]) if (win && !win.isDestroyed()) win.webContents.send('state', snapshot()); }
function secureWindow(options) {
  const win = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: options.transparent ? false : true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  return win;
}
function showEditor() { if (!editor || editor.isDestroyed()) return; if (editor.isMinimized()) editor.restore(); editor.show(); editor.focus(); }
// El editor enseña en directo qué gesto ha llegado, para probarlos mientras se configuran.
function notifyGesture(source, detail = '') { if (editor && !editor.isDestroyed()) editor.webContents.send('gesture', { source, detail, at: Date.now() }); }

// --- El anillo ------------------------------------------------------------------------
// La ventana se coloca alrededor del punto y, si choca con un borde, se mete hacia dentro;
// el anillo no se mueve con ella: se le dice dónde está el punto dentro de la ventana.
function stopHolding() { if (holding) clearInterval(holding.timer); holding = null; }
function closeOverlay() {
  openingMenu++; releasedWhileOpening = false;
  stopHolding();
  const was = !!pinned; pinned = null;
  if (overlay && !overlay.isDestroyed()) { overlay.webContents.send('menu-hidden'); overlay.setIgnoreMouseEvents(false); overlay.hide(); }
  if (was) broadcast();
}
function placeOverlay(point, extra) {
  const area = screen.getDisplayNearestPoint(point).workArea;
  const bounds = boundsFor(point, area, windowSide(config));
  overlay.setBounds(bounds);
  overlay.webContents.send('open', { ...snapshot(), anchor: { x: point.x - bounds.x, y: point.y - bounds.y }, ...extra });
}
async function showOverlay({ hold = false, rootId = null, source = 'menu', notice = '' } = {}) {
  if (!overlay || overlay.isDestroyed()) return;
  if (overlay.isVisible() && !pinned) { closeOverlay(); return; }
  if (pinned) closeOverlay();
  const ticket = ++openingMenu; releasedWhileOpening = false;
  menuDestination = await pasteFocus?.capture() || null;
  if (ticket !== openingMenu || overlay.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint(), area = screen.getDisplayNearestPoint(cursor).workArea;
  const point = config.position === 'center' ? { x: Math.round(area.x + area.width / 2), y: Math.round(area.y + area.height / 2) } : cursor;
  placeOverlay(point, { hold, rootId, pinned: false, notice });
  overlay.show(); overlay.focus();
  notifyGesture(source);
  if (hold) {
    // Mientras se mantiene el gesto, la otra aplicación tiene capturado el ratón y el anillo
    // no recibiría movimiento: se le envía la posición del cursor a cada fotograma.
    const timer = setInterval(() => {
      if (!overlay.isVisible()) return stopHolding();
      const c = screen.getCursorScreenPoint(), b = overlay.getBounds();
      overlay.webContents.send('pointer', { x: c.x - b.x, y: c.y - b.y });
    }, 16);
    holding = { timer };
    if (releasedWhileOpening) releaseHold();
  }
}
// Anillo en vivo: se queda abierto junto al editor, sin robarle el foco, y se redibuja con
// cada cambio. Fuera de los círculos, los clics atraviesan la ventana hasta el editor.
function pinPoint() {
  const b = editor.getBounds(), area = screen.getDisplayMatching(b).workArea, side = windowSide(config) / 2;
  const right = { x: b.x + b.width + side - 40, y: b.y + b.height / 2 };
  const point = right.x + side <= area.x + area.width ? right : { x: b.x + b.width - side + 20, y: b.y + b.height / 2 };
  return { x: Math.round(point.x), y: Math.round(point.y) };
}
function pin(on) {
  if (!on) { closeOverlay(); return snapshot(); }
  if (overlay.isVisible()) closeOverlay();
  pinned = { point: pinPoint() };
  menuDestination = pasteFocus?.current || null;
  placeOverlay(pinned.point, { pinned: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.showInactive();
  broadcast(); return snapshot();
}
function releaseHold() {
  if (!holding) { releasedWhileOpening = true; return; }
  stopHolding();
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.webContents.send('release');
}

// --- Atajos y gestos ------------------------------------------------------------------
// Todos los atajos se cambian a la vez: si uno nuevo no se puede registrar, vuelven los de antes.
const hotkeysOf = c => [
  ...[...walk(c.items)].filter(item => item.hotkey).map(item => [item.hotkey, item.id]),
  ...c.profiles.filter(p => p.hotkey).map(p => [p.hotkey, 'profile:' + p.id]),
  ...(c.nextProfileKey ? [[c.nextProfileKey, 'profile:next']] : [])
];
const bindingKey = c => JSON.stringify([c.shortcut, c.mouse, c.mouseMode, c.modifierTap, hotkeysOf(c)]);
// Cambiar de perfil: se guarda como cualquier otro cambio y el editor lo adopta.
async function activateProfile(id, open) {
  if (id === 'next') { const list = config.profiles, i = list.findIndex(p => p.id === config.activeProfile); id = list[(i + 1) % list.length].id; }
  const profile = config.profiles.find(p => p.id === id); if (!profile) return;
  if (id !== config.activeProfile) {
    const result = saving.then(() => save(switchProfile(config, id)));
    saving = result.catch(() => {});
    await result; profileSwitches++; broadcast();
  }
  notifyGesture('profile', profile.name);
  if (open) { if (overlay.isVisible() && !pinned) closeOverlay(); showOverlay({ source: 'profile', notice: 'Perfil «' + profile.name + '»' }); }
}
function runHotkey(id) {
  if (id.startsWith('profile:')) { activateProfile(id.slice(8), true).catch(error => { warning = error.message; broadcast(); }); return; }
  const item = findItem(config, id); if (!item) return;
  notifyGesture('hotkey', item.label);
  if (item.type === 'group') showOverlay({ rootId: id, source: 'hotkey' });
  else runAction(id).catch(() => {});
}
function registerAll(list) {
  const done = [];
  for (const [accelerator, handler] of list) {
    if (!globalShortcut.register(accelerator, handler)) { done.forEach(a => globalShortcut.unregister(a)); return accelerator; }
    done.push(accelerator);
  }
  return null;
}
const unregisterAll = list => list.forEach(([accelerator]) => globalShortcut.unregister(accelerator));
function disposeBinding(old) { if (old?.child) old.child.kill(); }
async function prepareBinding(c) {
  if (testMode) return { test: true, key: bindingKey(c), shortcuts: [] };
  const { shortcut, mouse, modifierTap } = c, next = { key: bindingKey(c), shortcuts: [] };
  if (shortcut.mode === 'single') next.shortcuts.push([shortcut.accelerator, () => showOverlay({ source: 'shortcut' })]);
  for (const [accelerator, id] of hotkeysOf(c)) next.shortcuts.push([accelerator, () => runHotkey(id)]);
  const old = binding?.shortcuts || [];
  unregisterAll(old);
  const restore = error => { unregisterAll(next.shortcuts); registerAll(old); throw error; };
  const failed = registerAll(next.shortcuts);
  if (failed) restore(new Error('El sistema no permite registrar ' + failed.replace('CommandOrControl', 'Ctrl') + ' (puede estar ocupado). Se conservan los atajos anteriores.'));
  const keyboard = shortcut.mode === 'single' ? null : shortcut;
  if (!keyboard && mouse === 'none' && modifierTap === 'none') return next;
  if (!native) restore(new Error('El detector nativo no está instalado. Usa una pulsación simple sin ratón ni doble toque.'));
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') restore(new Error('La doble pulsación, mantener, el ratón y el doble toque requieren X11. En Wayland usa una pulsación simple.'));
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) restore(new Error('Activa HALO MENU en Ajustes del sistema → Privacidad → Accesibilidad para usar este gesto.'));
  const child = utilityProcess.fork(path.join(__dirname, 'native-hook.cjs'), [], { serviceName: 'HALO gesture', stdio: 'pipe' });
  next.child = child;
  try {
    await new Promise((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => { child.kill(); reject(new Error('El detector de teclado y ratón no respondió.')); }, 6000);
      child.on('message', message => {
        if (message.type === 'ready') { ready = true; clearTimeout(timer); resolve(); }
        if (message.type === 'error') { clearTimeout(timer); child.kill(); reject(new Error('No se pudo activar el gesto: ' + message.message)); }
        if (binding !== next) return;
        if (message.type === 'trigger') showOverlay({ source: message.source || 'shortcut' });
        if (message.type === 'down') { notifyGesture(message.source, 'pulsado'); if (overlay.isVisible() && !pinned) closeOverlay(); else showOverlay({ hold: true, source: message.source }); }
        if (message.type === 'up') { notifyGesture(message.source, 'soltado'); releaseHold(); }
      });
      child.on('exit', () => { clearTimeout(timer); if (!ready) reject(new Error('El detector nativo no está disponible. Usa una pulsación simple.')); else if (binding === next) { shortcutStatus = 'Detector detenido'; warning = 'El detector de gestos se ha detenido. Vuelve a guardar el atajo o usa una pulsación simple.'; binding = { ...next, child: null }; broadcast(); } });
      child.postMessage({ keyboard, mouse, modifierTap, mouseMode: c.mouseMode, interval: c.shortcut.interval });
    });
  } catch (error) { restore(error); }
  return next;
}
// Esquina activa: llevar el cursor a una esquina de la pantalla y dejarlo un instante.
function watchCorner() {
  clearInterval(cornerTimer); cornerTimer = null;
  if (testMode || config.hotCorner === 'none') return;
  let since = 0, armed = true;
  cornerTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint(), b = screen.getDisplayNearestPoint(c).bounds;
    const [v, h] = config.hotCorner.split('-');
    const cx = h === 'left' ? b.x : b.x + b.width - 1, cy = v === 'top' ? b.y : b.y + b.height - 1;
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d > 60) { armed = true; since = 0; return; }
    if (d > 4 || !armed) { since = 0; return; }
    if (!since) since = Date.now();
    else if (Date.now() - since > config.cornerDelay) { armed = false; since = 0; if (!overlay.isVisible() || pinned) showOverlay({ source: 'corner' }); }
  }, 60);
}
const activeStatus = () => testMode ? 'Modo de prueba' : (process.env.XDG_SESSION_TYPE === 'wayland' ? 'Solicitado al portal del escritorio' : 'Activo');
async function save(value) {
  const { config: nextConfig, issues: found } = validateLenient(value, config);
  const same = binding && binding.key === bindingKey(nextConfig);
  const previous = binding;
  const nextBinding = same ? binding : await prepareBinding(nextConfig);
  try { store.write(nextConfig); }
  catch (error) { if (nextBinding !== previous) { unregisterAll(nextBinding.shortcuts); disposeBinding(nextBinding); registerAll(previous?.shortcuts || []); } throw error; }
  binding = nextBinding; config = nextConfig; issues = found;
  if (previous !== nextBinding) disposeBinding(previous);
  shortcutStatus = activeStatus(); warning = '';
  watchCorner(); updateTray(); broadcast();
  // El anillo en vivo se recoloca: con más acciones necesita una ventana más grande.
  if (pinned && overlay.isVisible()) { pinned.point = pinPoint(); placeOverlay(pinned.point, { pinned: true, instant: true }); }
  return snapshot();
}

// --- Acciones -------------------------------------------------------------------------
function targetFor(item) { return item.type === 'system' ? app.getPath(item.target) : item.target; }
async function getIcon(spec) {
  if (!spec || !['system', 'path'].includes(spec.type) || typeof spec.target !== 'string' || spec.target.length > 4096) return null;
  if (spec.type === 'system' && !['home', 'downloads', 'desktop', 'documents', 'pictures', 'music', 'videos'].includes(spec.target)) return null;
  if (spec.type === 'path' && !path.isAbsolute(spec.target)) return null;
  // Las carpetas especiales devuelven en Windows el icono de una unidad: se quedan con el dibujo
  // de LINDE. La carpeta personal toma el del explorador del sistema.
  if (spec.type === 'system' && spec.target !== 'home') return null;
  let target = spec.type === 'system' ? app.getPath(spec.target) : spec.target;
  if (spec.type === 'system' && spec.target === 'home') {
    if (process.platform === 'win32') target = path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe');
    if (process.platform === 'darwin') target = '/System/Library/CoreServices/Finder.app';
  }
  // Un acceso directo de Windows enseña la flecha de acceso: se usa el icono de su destino.
  if (process.platform === 'win32' && /\.lnk$/i.test(target)) {
    try { const link = shell.readShortcutLink(target); const source = link.icon || link.target; if (source && fs.existsSync(source)) target = source; } catch { /* Sin destino legible: se queda el del acceso. */ }
  }
  if (!icons.has(target)) {
    if (icons.size >= 400) icons.clear();
    icons.set(target, app.getFileIcon(target, { size: 'large' }).then(icon => icon.isEmpty() ? null : icon.toDataURL()).catch(() => null));
  }
  return icons.get(target);
}
// Las aplicaciones instaladas: accesos del menú Inicio en Windows y paquetes .app en macOS.
async function listApps() {
  if (appsCache && Date.now() - appsCache.at < 60000) return appsCache.list;
  const found = new Map();
  const skip = /uninstall|desinstal|readme|l[eé]ame|help|ayuda|manual|documentation|documentaci[oó]n|website|sitio web|license|licencia|release notes|changelog|notas de la versi/i;
  // Solo nombres de verdad: fuera desinstaladores, manuales y enlaces web disfrazados de programa.
  const add = (name, file) => { const key = name.toLowerCase(); if (!skip.test(name) && /^[\p{L}\p{N}]/u.test(name) && !/@|https?:|www\./i.test(name) && !found.has(key)) found.set(key, { name, path: file }); };
  async function scan(dir, depth, kind) {
    let entries; try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (kind === 'app' && entry.name.endsWith('.app')) add(entry.name.slice(0, -4), full);
      else if (entry.isDirectory()) { if (depth > 0) await scan(full, depth - 1, kind); }
      else if (kind === 'lnk' && /\.lnk$/i.test(entry.name)) add(entry.name.slice(0, -4), full);
    }
  }
  if (process.platform === 'win32') {
    await scan(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), 3, 'lnk');
    await scan(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), 3, 'lnk');
  } else if (process.platform === 'darwin') {
    for (const dir of ['/Applications', '/System/Applications', path.join(app.getPath('home'), 'Applications')]) await scan(dir, 1, 'app');
  }
  const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  appsCache = { at: Date.now(), list };
  return list;
}
// Las teclas se envían desde un proceso aparte que se crea la primera vez que hace falta.
function keySender() {
  if (sender) return sender;
  if (!native) return Promise.reject(new Error('El envío de teclas necesita el módulo nativo uiohook-napi.'));
  const child = utilityProcess.fork(path.join(__dirname, 'native-keys.cjs'), [], { serviceName: 'HALO keys', stdio: 'pipe' });
  const pending = new Map();
  let count = 0;
  const send = accelerator => new Promise((resolve, reject) => { const id = ++count; pending.set(id, { resolve, reject }); child.postMessage({ id, accelerator }); setTimeout(() => { if (pending.delete(id)) reject(new Error('Tiempo de espera agotado.')); }, 3000); });
  sender = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('El envío de teclas no respondió.')); }, 6000);
    child.on('message', message => {
      if (message.type === 'ready') { clearTimeout(timer); resolve(send); }
      const job = pending.get(message.id); if (!job) return;
      pending.delete(message.id);
      if (message.type === 'done') job.resolve(); else job.reject(new Error(message.message));
    });
    child.on('exit', () => { clearTimeout(timer); sender = null; for (const job of pending.values()) job.reject(new Error('El envío de teclas se ha detenido.')); pending.clear(); reject(new Error('El envío de teclas no está disponible.')); });
  });
  sender.catch(() => { sender = null; });
  return sender;
}
async function sendKeys(accelerator, destination) {
  if (pasteFocus && accelerator === 'CommandOrControl+V') {
    if (!await pasteFocus.restore(destination || pasteFocus.current, true)) throw Error('Windows no permitió pegar en la ventana de destino. El contenido está copiado: abre la carpeta de destino y pulsa Ctrl + V.');
    return;
  }
  const send = await keySender();
  // El foco vuelve a la aplicación de antes al esconder el anillo; se le da un instante.
  await delay(testMode ? 0 : 170);
  await send(accelerator);
}
async function runAction(id) {
  const item = findItem(config, id);
  if (!item) throw new Error('Esta acción ya no existe.');
  if (item.type === 'group') throw new Error('Un grupo se abre en el anillo.');
  if (launching) return;
  launching = true;
  const destination = overlay?.isVisible() ? menuDestination : await pasteFocus?.capture();
  closeOverlay();
  try {
    if (item.type === 'settings') { showEditor(); return; }
    if (item.type === 'url') await shell.openExternal(item.target);
    else if (item.type === 'keys') await sendKeys(item.target, destination);
    else if (item.type === 'text') { await clipboard.writeText(item.target); await sendKeys('CommandOrControl+V', destination); }
    else if (item.type === 'clipboard') {
      const result = await useClip(item.target, item.clipAction, destination);
      const message = result?.destination ? 'Pegado en ' + result.destination : item.clipAction === 'copy' || item.clipAction === 'paths' ? 'Contenido copiado al portapapeles.' : 'Pegado enviado a la aplicación de destino.';
      if (result !== null) {
        clipboardResult = { message, at: Date.now() }; broadcast();
        tray?.displayBalloon?.({ title: 'HALO · Portapapeles', content: message });
      }
    }
    else { const target = targetFor(item); await fs.promises.access(target); const error = await shell.openPath(target); if (error) throw new Error(error); }
  } catch (error) {
    warning = 'No se pudo ejecutar «' + item.label + '»: ' + error.message; broadcast(); showEditor();
    if (item.type === 'clipboard' && !testMode) await dialog.showMessageBox(editor, { type: 'warning', title: 'HALO · No se ha pegado el contenido', message: error.message, buttons: ['Entendido'] });
    throw new Error(warning);
  }
  finally { launching = false; }
}
async function useClip(id, action = 'paste', destination) {
  const value = clips.get(id);
  if (!value) throw Error('El espacio ' + id + ' está vacío. Guarda texto o archivos desde el editor, o apunta al círculo y pulsa Ctrl + V.');
  if (value.kind === 'text') await clipboard.writeText(value.text);
  else {
    const paths = await clips.availablePaths(value);
    if (action === 'paths') await clipboard.writeText(paths.join('\r\n'));
    else await fileClipboard.writeFiles(paths);
    // Explorer exposes its destination folder, so transfer through the shell
    // instead of depending on a simulated shortcut and the selected child view.
    if (action === 'paste' && process.platform === 'win32') {
      const pointer = destination?.pointer;
      if (pointer) {
        const result = await fileClipboard.pasteFiles(paths, pointer.desktop ? { folder: app.getPath('desktop') } : { handle: pointer.handle });
        if (result) return result;
      }
      // Files need a real folder. Never send an unverified Ctrl+V to an unrelated window.
      const picked = await dialog.showOpenDialog(editor, { title: 'No se detectó una carpeta bajo el ratón. Elige dónde pegar', properties: ['openDirectory', 'createDirectory'] });
      if (picked.canceled) return null;
      return fileClipboard.pasteFiles(paths, { folder: picked.filePaths[0] });
    }
  }
  if (action === 'paste') await sendKeys('CommandOrControl+V', destination);
}
async function clipCommand(request) {
  if (!request || typeof request !== 'object') throw Error('Operación no válida.');
  const id = slotId(request.slot), mode = request.mode ?? 'copy';
  if (!['copy', 'reference'].includes(mode)) throw Error('Modo de archivo no válido.');
  switch (request.op) {
    case 'get': return clips.get(id);
    case 'text': clips.text(id, request.text); break;
    case 'files': await clips.files(id, request.paths, mode); break;
    case 'capture': {
      const text = await clipboard.readText();
      const paths = process.platform === 'win32' ? await fileClipboard.readFiles() : [];
      if (paths.length) await clips.files(id, paths, mode);
      else clips.text(id, text);
      break;
    }
    case 'pick':
    case 'pick-folder': {
      const folder = request.op === 'pick-folder';
      const result = await dialog.showOpenDialog(editor, { title: 'Guardar ' + (folder ? 'carpetas' : 'archivos') + ' en el espacio ' + id, properties: [folder ? 'openDirectory' : 'openFile', 'multiSelections'] });
      if (result.canceled) return null;
      await clips.files(id, result.filePaths, mode); break;
    }
    case 'clear': clips.put(id, null); break;
    case 'paste-folder': {
      const value = clips.get(id);
      if (value?.kind !== 'files') throw Error('Guarda archivos o carpetas antes de elegir el destino.');
      const paths = await clips.availablePaths(value);
      const result = await dialog.showOpenDialog(editor, { title: 'Dónde quieres pegar el contenido', properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled) return null;
      const pasted = await fileClipboard.pasteFiles(paths, { folder: result.filePaths[0] });
      if (!pasted) throw Error('No se pudo abrir la carpeta de destino.');
      clipboardResult = { message: 'Pegado en ' + pasted.destination, at: Date.now() };
      break;
    }
    case 'copy': await useClip(id, 'copy'); break;
    case 'paths': await useClip(id, 'paths'); break;
    default: throw Error('Operación de portapapeles no válida.');
  }
  broadcast();
  return { clips: clips.summary() };
}
async function pickImage() {
  const result = await dialog.showOpenDialog(editor, { title: 'Elegir imagen para el icono', filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp', 'gif'] }], properties: ['openFile'] });
  if (result.canceled) return null;
  const stat = await fs.promises.stat(result.filePaths[0]);
  if (stat.size > 8 * 1024 * 1024) throw new Error('La imagen supera 8 MB.');
  let image = nativeImage.createFromPath(result.filePaths[0]);
  if (image.isEmpty()) throw new Error('No se pudo leer la imagen.');
  const { width, height } = image.getSize();
  if (Math.max(width, height) > 128) image = image.resize(width >= height ? { width: 128, quality: 'best' } : { height: 128, quality: 'best' });
  const data = image.toDataURL();
  if (data.length > 400000) throw new Error('La imagen es demasiado grande incluso reducida.');
  return data;
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || !trusted.has(event.senderFrame.url)) throw new Error('Origen no permitido.');
    return callback(...args);
  });
}
function updateTray() {
  if (!tray) return;
  const profiles = config.profiles.length > 1 ? [{ type: 'separator' }, ...config.profiles.map(p => ({ label: p.name, type: 'radio', checked: p.id === config.activeProfile, click: () => activateProfile(p.id, false).catch(() => {}) }))] : [];
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir el anillo', click: () => showOverlay({ source: 'tray' }) }, { label: 'Configurar HALO MENU', click: showEditor }, ...profiles, { type: 'separator' }, { label: 'Salir', click: () => { quitting = true; app.quit(); } }]));
}
function trayImage() {
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const offset = (y * 32 + x) * 4, r = Math.hypot(x - 15.5, y - 15.5);
    // Un anillo de seis círculos alrededor de un centro, como el menú.
    let on = r < 4;
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; if (Math.hypot(x - 15.5 - Math.cos(a) * 11, y - 15.5 - Math.sin(a) * 11) < 3.6) on = true; }
    if (on) { pixels[offset] = 0x50; pixels[offset + 1] = 0x4c; pixels[offset + 2] = 0xed; pixels[offset + 3] = 255; }
  }
  return nativeImage.createFromBitmap(pixels, { width: 32, height: 32 });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showEditor);
  app.whenReady().then(async () => {
    store = new Store(app.getPath('userData')); ({ config, warning } = store.read());
    clips = new ClipboardStore(app.getPath('userData'));
    if (clips.warning) warning = [warning, clips.warning].filter(Boolean).join(' ');
    handle('clipboard', request => { const job = clipQueue.then(() => clipCommand(request)); clipQueue = job.catch(() => {}); return job; });
    handle('state', snapshot);
    handle('defaults', defaults);
    handle('save', value => { const result = saving.then(() => save(value)); saving = result.catch(() => {}); return result; });
    handle('show-menu', () => showOverlay({ source: 'button' })); handle('hide-menu', closeOverlay); handle('open-editor', showEditor);
    handle('pin-menu', on => pin(!!on));
    handle('profile', id => activateProfile(String(id), false).then(snapshot));
    handle('overlay-hover', over => { if (pinned && overlay.isVisible()) overlay.setIgnoreMouseEvents(!over, { forward: true }); });
    handle('icon', getIcon); handle('run', runAction); handle('pick-image', pickImage); handle('apps', listApps);
    handle('window', action => { if (action === 'minimize') editor.minimize(); if (action === 'close') editor.close(); if (action === 'maximize') editor.isMaximized() ? editor.unmaximize() : editor.maximize(); });
    handle('quit', () => { quitting = true; app.quit(); });
    handle('pick', async kind => {
      if (!['file', 'folder'].includes(kind)) throw Error('Selección no válida.');
      const result = await dialog.showOpenDialog(editor, { title: kind === 'folder' ? 'Elegir carpeta' : 'Elegir aplicación o archivo', properties: [kind === 'folder' ? 'openDirectory' : 'openFile'] });
      return result.canceled ? null : result.filePaths[0];
    });
    handle('export', async value => {
      const validated = validate(value), result = await dialog.showSaveDialog(editor, { defaultPath: 'HALO MENU.json', filters: [{ name: 'Configuración HALO', extensions: ['json'] }] });
      if (result.canceled) return false; await fs.promises.writeFile(result.filePath, JSON.stringify(validated, null, 2)); return true;
    });
    handle('import', async () => {
      const result = await dialog.showOpenDialog(editor, { filters: [{ name: 'Configuración HALO', extensions: ['json'] }], properties: ['openFile'] });
      if (result.canceled) return null;
      const stat = await fs.promises.stat(result.filePaths[0]); if (stat.size > 4 * 1024 * 1024) throw Error('El archivo supera 4 MB.');
      return validate(JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8')));
    });
    editor = secureWindow({ width: 1340, height: 880, minWidth: 1080, minHeight: 700, frame: false, show: false, backgroundColor: '#171717', title: 'HALO MENU', icon: path.join(renderer, 'assets/aptic.png') });
    overlay = secureWindow({ width: 520, height: 520, frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, focusable: true, title: 'HALO MENU · Menú' });
    pasteFocus = createPasteFocus([editor, overlay]);
    overlay.setAlwaysOnTop(true, 'pop-up-menu'); overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.on('blur', () => { if (config.closeOnBlur && !holding && !pinned) closeOverlay(); });
    editor.on('close', event => { if (!quitting && tray) { event.preventDefault(); if (pinned) closeOverlay(); editor.hide(); } });
    let moving; editor.on('move', () => { if (!pinned) return; clearTimeout(moving); moving = setTimeout(() => { if (!pinned) return; pinned.point = pinPoint(); placeOverlay(pinned.point, { pinned: true, instant: true }); }, 60); });
    editor.webContents.on('render-process-gone', () => editor.reload());
    overlay.webContents.on('render-process-gone', () => { closeOverlay(); overlay.reload(); });
    await Promise.all([editor.loadFile(path.join(renderer, 'index.html')), overlay.loadFile(path.join(renderer, 'overlay.html'))]);
    if (!testMode) {
      try {
        tray = new Tray(trayImage()); tray.setToolTip('HALO MENU');
        updateTray();
        tray.on('click', showEditor);
      } catch (error) { warning = 'La bandeja del sistema no está disponible: ' + error.message; }
    }
    try { binding = await prepareBinding(config); shortcutStatus = activeStatus(); }
    catch (error) { shortcutStatus = 'Sin activar'; warning = error.message; }
    watchCorner();
    broadcast(); editor.show();
    app.on('activate', showEditor); nativeTheme.on('updated', broadcast);
  }).catch(error => { dialog.showErrorBox('HALO MENU', error.message); app.quit(); });
}
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { pasteFocus?.close(); disposeBinding(binding); clearInterval(cornerTimer); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
