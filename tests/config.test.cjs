const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defaults, validate, validateLenient, findItem, switchProfile, Store, boundsFor, DoubleTap } = require('../src/main/config.cjs');
const geometry = require('../src/shared/geometry.js');

test('appearance and gesture additions migrate old v2 configs and validate limits', () => {
  const old = defaults();
  for (const key of ['mouseMode', 'selectionMode', 'easing', 'wheelNavigation', 'dwellDelay', 'cornerDelay', 'response', 'stagger', 'borderWidth', 'roundness', 'customRingColors', 'ringBackground', 'ringForeground', 'ringAccent']) delete old[key];
  assert.deepEqual(validate(old), defaults());
  const next = { ...defaults(), mouseMode: 'double', selectionMode: 'dwell', customRingColors: true, ringAccent: '#123ABC', response: 0, stagger: 0 };
  const clean = validate(next); assert.equal(clean.ringAccent, '#123abc'); assert.equal(clean.selectionMode, 'dwell');
  for (const patch of [{ mouseMode: 'other' }, { selectionMode: 'other' }, { dwellDelay: 100 }, { cornerDelay: 2000 }, { response: -1 }, { ringAccent: 'red' }, { borderWidth: 5 }, { wheelNavigation: 'yes' }]) assert.throws(() => validate({ ...next, ...patch }));
});

test('configuration roundtrip preserves actions, submenus and geometry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aptic-store-'));
  try { const store = new Store(root), config = defaults(); config.radius = 140; config.items.reverse(); store.write(config); assert.deepEqual(store.read().config, config); assert.equal(fs.existsSync(store.file + '.tmp'), false); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('corrupt settings are preserved before recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aptic-recovery-'));
  try { const store = new Store(root); fs.writeFileSync(store.file, '{"broken":'); const result = store.read(); assert.deepEqual(result.config, defaults()); assert.ok(result.warning); assert.ok(fs.readdirSync(root).some(name => name.includes('.invalid-'))); assert.equal(fs.readFileSync(store.file, 'utf8'), '{"broken":'); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('version 1 settings migrate without losing actions', () => {
  const v1 = { version: 1, theme: 'charcoal', accent: '#f1768b', animation: 'spiral', duration: 280, radius: 104, size: 52, opacity: 96, labels: false, nativeIcons: true, closeOnBlur: true, position: 'cursor',
    shortcut: { accelerator: 'Control+Alt+X', mode: 'double', interval: 350 },
    items: [{ id: 'a', label: 'Uno', type: 'system', target: 'home', icon: 'app' }, { id: 'b', label: 'Dos', type: 'url', target: 'https://example.com', icon: 'file' }] };
  const c = validate(v1);
  assert.equal(c.version, 2); assert.equal(c.theme, 'carbon'); assert.equal(c.labels, 'none'); assert.equal(c.accent, '#f1768b');
  assert.deepEqual(c.items.map(i => i.icon), ['app-window', 'file-text']);
  assert.equal(c.shortcut.accelerator, 'Control+Alt+X');
});
test('imports reject executable URL schemes, invalid paths, duplicate ids and unsafe geometry', () => {
  for (const target of ['javascript:alert(1)', 'file:///C:/Windows/cmd.exe', 'data:text/html,hello']) { const c = defaults(); c.items[3].target = target; assert.throws(() => validate(c)); }
  const c = defaults(); c.items[1].id = c.items[0].id; assert.throws(() => validate(c));
  const d = defaults(); d.radius = Infinity; assert.throws(() => validate(d));
  const e = defaults(); e.items[0].type = 'path'; e.items[0].target = 'relative.exe'; assert.throws(() => validate(e));
  const f = defaults(); f.shortcut.accelerator = 'X'; assert.throws(() => validate(f));
  const g = defaults(); g.items[0].image = 'data:text/html;base64,AAAA'; assert.throws(() => validate(g));
});
test('groups nest two levels, keep unique ids and stay within limits', () => {
  const c = defaults(), group = c.items.find(i => i.type === 'group');
  assert.ok(findItem(validate(c), 'paste'));
  const sub = { id: 'more', label: 'Más', type: 'group', target: '', icon: 'layers', color: '', items: [{ id: 'deep', label: 'Dentro', type: 'url', target: 'https://example.com', icon: 'globe', color: '' }] };
  const nested = defaults(); nested.items.find(i => i.type === 'group').items.push(sub);
  assert.ok(findItem(validate(nested), 'deep'));
  const tooDeep = structuredClone(nested); tooDeep.items.find(i => i.type === 'group').items.at(-1).items[0] = { ...sub, id: 'deeper', items: [{ ...sub.items[0], id: 'x' }] };
  assert.throws(() => validate(tooDeep), /niveles/);
  const empty = defaults(); empty.items.find(i => i.type === 'group').items = []; assert.throws(() => validate(empty));
  const clash = defaults(); clash.items.find(i => i.type === 'group').items[0].id = 'files'; assert.throws(() => validate(clash));
  const many = defaults(); many.items.find(i => i.type === 'group').items = Array.from({ length: 13 }, (_, k) => ({ id: 'k' + k, label: 'K' + k, type: 'keys', target: 'Control+' + (k % 10), icon: 'keyboard', color: '' }));
  assert.throws(() => validate(many));
  const ring = defaults(); ring.items = Array.from({ length: 17 }, (_, k) => ({ id: 'r' + k, label: 'R' + k, type: 'settings', target: '', icon: 'settings', color: '' }));
  assert.throws(() => validate(ring)); ring.items.pop(); assert.equal(validate(ring).items.length, 16);
  assert.equal(group.items.length, 4);
});
test('direct hotkeys must be unique and differ from the ring shortcut', () => {
  const c = defaults(); c.items[0].hotkey = 'Control+Alt+1'; c.items[1].hotkey = 'Control+Alt+2'; assert.equal(validate(c).items[1].hotkey, 'Control+Alt+2');
  c.items[1].hotkey = 'Control+Alt+1'; assert.throws(() => validate(c), /atajo directo/);
  const d = defaults(); d.items[0].hotkey = d.shortcut.accelerator; assert.throws(() => validate(d));
});
test('lenient save applies everything else and keeps the last good version of unfinished actions', () => {
  const previous = validate(defaults());
  const draft = structuredClone(previous);
  draft.items[0].type = 'path'; draft.items[0].target = '';               // a medias: conserva la versión guardada
  draft.items.push({ id: 'new', label: 'Nueva', type: 'url', target: 'https://', icon: 'globe', color: '' }); // nueva a medias: fuera
  draft.mouse = 'middle'; draft.shortcut.mode = 'hold'; draft.accent = '#8e9cf5';
  const { config, issues } = validateLenient(draft, previous);
  assert.equal(config.mouse, 'middle'); assert.equal(config.shortcut.mode, 'hold'); assert.equal(config.accent, '#8e9cf5');
  assert.equal(config.items[0].type, 'system'); assert.equal(config.items.length, previous.items.length);
  assert.ok(issues.some(i => i.id === 'new'));
  assert.throws(() => validateLenient({ ...draft, accent: 'rojo' }, previous));
});
test('profiles keep their own rings, switch without losing anything and need unique hotkeys', () => {
  const c = validate(defaults());
  const two = validate({ ...c, profiles: [...c.profiles, { id: 'work', name: 'Trabajo', icon: 'briefcase', hotkey: 'Control+Alt+2', items: c.items.slice(0, 3) }] });
  const switched = validate(switchProfile(two, 'work'));
  assert.equal(switched.activeProfile, 'work'); assert.equal(switched.items.length, 3);
  assert.equal(switched.profiles.find(p => p.id === 'main').items.length, c.items.length);
  const back = validate(switchProfile(switched, 'main')); assert.deepEqual(back.items, c.items);
  assert.throws(() => validate({ ...two, activeProfile: 'nope' }));
  assert.throws(() => validate({ ...two, nextProfileKey: 'Control+Alt+2' }), /mismo atajo/);
  assert.throws(() => validate({ ...two, profiles: [...two.profiles, { id: 'x', name: 'X', icon: 'star', hotkey: '', items: c.items.slice(0, 1) }] }));
});
test('folder actions accept any absolute folder', () => {
  const c = defaults(); c.items[0] = { id: 'f', label: 'Proyectos', type: 'folder', target: process.platform === 'win32' ? 'C:/Proyectos' : '/proyectos', icon: 'folder', color: '' };
  assert.equal(validate(c).items[0].type, 'folder');
  c.items[0].target = 'relativa'; assert.throws(() => validate(c), /carpeta/);
});
test('the library holds actions outside the ring with unique ids', () => {
  const c = defaults(); assert.ok(validate(c).library.length > 0);
  const moved = defaults(); moved.library.push(moved.items.pop()); assert.equal(validate(moved).library.at(-1).id, 'settings');
  const clash = defaults(); clash.library.push({ ...clash.items[0] }); assert.throws(() => validate(clash));
  const full = defaults(); full.library = Array.from({ length: 41 }, (_, k) => ({ id: 'l' + k, label: 'L', type: 'settings', target: '', icon: 'star', color: '' })); assert.throws(() => validate(full));
});
test('keyboard and text actions validate what can be sent', () => {
  const ok = defaults(); ok.items[0] = { id: 'k', label: 'Pestaña', type: 'keys', target: 'Control+Shift+T', icon: 'keyboard', color: '#5aa2f0' }; assert.equal(validate(ok).items[0].target, 'Control+Shift+T');
  for (const target of ['', 'Control+', 'Control+Shift+Ñ', 'rm -rf']) { const c = defaults(); c.items[0] = { id: 'k', label: 'K', type: 'keys', target, icon: 'keyboard', color: '' }; assert.throws(() => validate(c)); }
  const text = defaults(); text.items[0] = { id: 't', label: 'Firma', type: 'text', target: '   ', icon: 'type', color: '' }; assert.throws(() => validate(text));
  const color = defaults(); color.items[0].color = 'red'; assert.throws(() => validate(color));
});
test('ring geometry opens up instead of overlapping and sizes the window', () => {
  const c = defaults();
  const r = geometry.ring(c);
  const chord = 2 * r.radius * Math.sin(Math.PI / r.n);
  assert.ok(chord >= c.size + geometry.gapFor(c.size) - 1);
  const big = { ...c, items: Array.from({ length: 12 }, (_, i) => ({ ...c.items[0], id: 'i' + i })) };
  assert.ok(geometry.ring(big).radius > c.radius);
  const arc = geometry.arc(c, 10, r.radius);
  assert.ok(arc.radius > r.radius + c.size / 2);
  assert.ok(arc.spread <= geometry.SPREAD_MAX + 1e-9);
  assert.ok(geometry.windowSide(c) >= 2 * geometry.reach(c));
});
test('menu remains in the usable display with negative monitor coordinates', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 };
  for (const point of [{ x: -1920, y: -200 }, { x: -1, y: 879 }, { x: -1000, y: 300 }]) { const bounds = boundsFor(point, area); assert.ok(bounds.x >= area.x); assert.ok(bounds.y >= area.y); assert.ok(bounds.x + bounds.width <= area.x + area.width); assert.ok(bounds.y + bounds.height <= area.y + area.height); }
  assert.deepEqual(boundsFor({ x: 0, y: 0 }, { x: 0, y: 0, width: 300, height: 200 }), { x: 0, y: 0, width: 300, height: 200 });
});
test('double tap requires release and ignores autorepeat', () => {
  let count = 0; const tap = new DoubleTap(350, () => count++); tap.press(true); tap.press(true); tap.press(true); assert.equal(count, 0); tap.release(100); tap.press(true); tap.release(300); assert.equal(count, 1); tap.press(true); tap.release(350); assert.equal(count, 1);
});
test('double tap rejects stale and wrong-modifier sequences', () => {
  let count = 0; const tap = new DoubleTap(350, () => count++); tap.press(true); tap.release(0); tap.press(true); tap.release(500); assert.equal(count, 0); tap.press(false); tap.release(550); tap.press(true); tap.release(600); assert.equal(count, 0); tap.reset(); tap.press(true); tap.release(610); assert.equal(count, 0);
});
