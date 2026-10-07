const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, validate, walk } = require('../src/main/config.cjs');
const { collect, organize } = require('../src/shared/organize.js');

test('batch collection counts a selected group and its descendants only once', () => {
  const c = defaults();
  assert.deepEqual(collect(c.items, new Set(['edit', 'copy', 'files'])).map(n => n.item.id), ['files', 'edit']);
});
test('batch grouping preserves order, content and every action identity', () => {
  const c = defaults(), before = structuredClone(c);
  const result = organize(c, ['pictures', 'files', 'documents'], 'group');
  assert.deepEqual(c, before);
  const group = result.config.items[0];
  assert.deepEqual(group.items.map(i => i.id), ['files', 'documents', 'pictures']);
  assert.deepEqual(group.items, [c.items[0], c.items[2], c.items[6]]);
  assert.equal(result.config.items.length, 6); validate(result.config);
});
test('batch duplicate uses unique ids and removes copied direct hotkeys recursively', () => {
  const c = defaults(); c.items[4].hotkey = 'Control+Alt+E'; c.items[4].items[0].hotkey = 'Control+Alt+C';
  const result = organize(c, ['files', 'edit', 'copy'], 'duplicate');
  assert.equal(result.count, 2); validate(result.config);
  const copies = result.selected.map(id => result.config.items.find(i => i.id === id));
  assert.equal(copies[1].items[0].target, c.items[4].items[0].target);
  for (const item of walk(copies)) assert.equal(item.hotkey, undefined);
  assert.equal(result.config.items.find(i => i.id === 'edit').hotkey, 'Control+Alt+E');
});
test('batch archive is atomic if any source group would be emptied', () => {
  const c = defaults(), before = structuredClone(c);
  assert.throws(() => organize(c, ['files', 'copy', 'paste', 'undo', 'redo'], 'library'), /grupo/);
  assert.deepEqual(c, before);
  const result = organize(c, ['files', 'copy'], 'library');
  assert.deepEqual(result.config.library.slice(-2).map(i => i.id), ['files', 'copy']); validate(result.config);
});
test('batch operations respect ring, library and group capacity', () => {
  const c = defaults();
  assert.throws(() => organize(c, c.items.map(i => i.id), 'group'), /dos acciones/);
  assert.throws(() => organize(c, c.items.map(i => i.id), 'library'), /dos acciones/);
  assert.throws(() => organize(c, ['files', 'copy'], 'group'), /mismo nivel/);
  c.items.push({ ...c.items[0], id: 'extra' });
  assert.throws(() => organize(c, c.items.map(i => i.id), 'duplicate'), /No caben/);
  c.library = Array.from({ length: 40 }, (_, i) => ({ ...c.library[0], id: 'lib-' + i }));
  assert.throws(() => organize(c, ['files'], 'library'), /biblioteca/);
});
test('batch grouping cannot exceed submenu depth', () => {
  const c = defaults(), group = c.items[4];
  group.items = [{ id: 'sub', label: 'Sub', type: 'group', target: '', icon: 'layers', color: '', items: group.items }];
  validate(c);
  assert.throws(() => organize(c, ['copy', 'paste'], 'group'), /dos niveles/);
  assert.throws(() => organize(c, ['files', 'edit'], 'group'), /dos niveles/);
});
test('batch color changes only selected surfaces and remains reversible', () => {
  const c = defaults(); const result = organize(c, ['edit', 'files'], 'color', '#abcdef');
  assert.equal(result.config.items[0].color, '#abcdef'); assert.equal(result.config.items[4].color, '#abcdef');
  assert.equal(result.config.items[4].items[0].color, '');
  assert.deepEqual(organize(result.config, ['edit', 'files'], 'color', '').config, c);
  assert.throws(() => organize(c, ['files'], 'color', 'red'), /válido/);
});
