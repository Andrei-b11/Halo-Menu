const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ClipboardStore } = require('../src/main/clipboard-store.cjs');
const { defaults, validate, switchProfile } = require('../src/main/config.cjs');
const fixture = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-clips-')); return { dir, store: new ClipboardStore(dir) }; };

test('slots survive restart; whitespace, Unicode and large text stay exact', () => {
  const { dir, store } = fixture(), text = '  Hola ñ 🎉\n\t' + 'a'.repeat(9000);
  store.text('1', text); store.text('12', 'otro');
  assert.equal(new ClipboardStore(dir).get('1').text, text);
  assert.equal(store.get('12').text, 'otro');
  assert.throws(() => store.text('../1', text));
  assert.throws(() => store.text('13', text));
  assert.throws(() => store.text('1', ''));
  assert.throws(() => store.text('1', 'x'.repeat(1048577)));
  assert.equal(store.get('1').text, text);
  store.put('1', null); assert.equal(new ClipboardStore(dir).get('1'), null);
});
test('stored copies survive original deletion and clipboard paths survive replacement', async () => {
  const { dir, store } = fixture(), source = path.join(dir, 'niño $.txt');
  fs.writeFileSync(source, 'original');
  await store.files('1', [source], 'copy');
  const [copy] = await store.availablePaths(store.get('1'));
  fs.unlinkSync(source);
  assert.equal(fs.readFileSync(copy, 'utf8'), 'original');
  assert.equal((await new ClipboardStore(dir).availablePaths(store.get('1')))[0], copy);
  store.text('1', 'nuevo'); assert.equal(fs.readFileSync(copy, 'utf8'), 'original');
});
test('references use latest content and report missing originals without changing the slot', async () => {
  const { dir, store } = fixture(), source = path.join(dir, 'file.txt');
  fs.writeFileSync(source, 'v1'); await store.files('2', [source], 'reference');
  fs.writeFileSync(source, 'v2');
  assert.equal(fs.readFileSync((await store.availablePaths(store.get('2')))[0], 'utf8'), 'v2');
  fs.unlinkSync(source);
  await assert.rejects(store.availablePaths(store.get('2')), /No se encuentra/);
  assert.equal(store.get('2').mode, 'reference');
  await assert.rejects(store.files('2', [dir], 'copy'), /almacén/);
  await assert.rejects(store.files('2', [], 'copy'));
});
test('duplicate basenames keep distinct copies; failures preserve previous slot', async () => {
  const { dir, store } = fixture();
  const sources = ['a', 'b'].map(name => { const folder = path.join(dir, name); fs.mkdirSync(folder); const file = path.join(folder, 'same.txt'); fs.writeFileSync(file, name); return file; });
  await store.files('3', sources, 'copy');
  assert.deepEqual((await store.availablePaths(store.get('3'))).map(p => fs.readFileSync(p, 'utf8')), ['a', 'b']);
  await assert.rejects(store.files('3', [...sources, path.join(dir, 'missing')], 'copy'));
  assert.equal(store.get('3').files.length, 2);
  assert.throws(() => store.storedPath('../escape'));
  assert.throws(() => store.storedPath(path.join(dir, 'escape')));
});
test('damaged metadata is preserved instead of silently lost', () => {
  const { dir, store } = fixture(); fs.writeFileSync(store.file, '{broken');
  const loaded = new ClipboardStore(dir);
  assert.match(loaded.warning, /conserva/);
  assert.ok(fs.readdirSync(store.root).some(name => name.startsWith('slots.json.invalid-')));
});
test('folders preserve nested files and empty directories across restart and original removal', async () => {
  const { dir, store } = fixture(), source = path.join(dir, 'carpeta ñ');
  fs.mkdirSync(path.join(source, 'interior', 'vacía'), { recursive: true });
  fs.writeFileSync(path.join(source, 'interior', 'archivo.txt'), 'contenido');
  await store.files('6', [source], 'copy');
  // Rename the original instead of deleting the fixture recursively.
  fs.renameSync(source, source + '-movida');
  const loaded = new ClipboardStore(dir), [copy] = await loaded.availablePaths(loaded.get('6'));
  assert.equal(fs.readFileSync(path.join(copy, 'interior', 'archivo.txt'), 'utf8'), 'contenido');
  assert.ok(fs.statSync(path.join(copy, 'interior', 'vacía')).isDirectory());
  assert.match(loaded.summary()['6'].preview, /Carpeta completa:/);
});
test('mixed folder/file references resolve current directories and report moved originals', async () => {
  const { dir, store } = fixture(), folder = path.join(dir, 'proyecto'), file = path.join(dir, 'nota.txt');
  fs.mkdirSync(folder); fs.writeFileSync(file, 'nota');
  await store.files('7', [folder, file], 'reference');
  fs.writeFileSync(path.join(folder, 'nuevo.txt'), 'actualizado');
  assert.deepEqual(await store.availablePaths(store.get('7')), [folder, file]);
  fs.renameSync(folder, folder + '-movida');
  await assert.rejects(store.availablePaths(store.get('7')), /No se encuentra/);
});
test('folder copy rejects oversized trees and recursive store inclusion without replacing content', async () => {
  const { dir, store } = fixture(), folder = path.join(dir, 'grande');
  fs.mkdirSync(folder); const fd = fs.openSync(path.join(folder, 'large.bin'), 'w'); fs.ftruncateSync(fd, 201 * 1024 * 1024); fs.closeSync(fd);
  store.text('8', 'conservar');
  await assert.rejects(store.files('8', [folder], 'copy'), /200 MB/);
  await assert.rejects(store.files('8', [dir], 'copy'), /almacén/);
  assert.equal(store.get('8').text, 'conservar');
});
test('folder copies reject junction cycles instead of recursing forever', async () => {
  const { dir, store } = fixture(), folder = path.join(dir, 'con-enlace');
  fs.mkdirSync(folder); fs.symlinkSync(folder, path.join(folder, 'ciclo'), process.platform === 'win32' ? 'junction' : 'dir');
  store.text('9', 'anterior');
  await assert.rejects(store.files('9', [folder], 'copy'), /enlaces o uniones/);
  assert.equal(store.get('9').text, 'anterior');
});
test('clipboard actions validate and survive profile switching', () => {
  const config = defaults();
  config.items.push({ id: 'slot', label: 'Espacio 1', type: 'clipboard', target: '1', icon: 'clipboard', color: '' });
  const clean = validate(config); assert.equal(clean.items.at(-1).fileMode, 'copy'); assert.equal(clean.items.at(-1).clipAction, 'paste');
  clean.profiles.push({ id: 'two', name: 'Dos', icon: 'ring', items: defaults().items });
  assert.equal(validate(switchProfile(switchProfile(clean, 'two'), 'main')).items.at(-1).type, 'clipboard');
  config.items.at(-1).target = '0'; assert.throws(() => validate(config), /espacio/);
  config.items.at(-1).target = '1'; config.items.at(-1).clipAction = 'delete'; assert.throws(() => validate(config), /pegado/);
});
