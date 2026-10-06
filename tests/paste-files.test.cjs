const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { pasteFiles } = require('../src/main/paste-files.cjs');
test('pasting in the source parent creates a separate copy without overwriting', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'halo-paste-')), file = path.join(dir, 'nota.txt');
  await fs.writeFile(file, 'original');
  const first = await pasteFiles([file], dir), second = await pasteFiles([file], dir);
  assert.equal(path.basename(first.paths[0]), 'nota - copia.txt');
  assert.equal(path.basename(second.paths[0]), 'nota - copia (2).txt');
  assert.equal(await fs.readFile(file, 'utf8'), 'original');
  assert.equal(await fs.readFile(second.paths[0], 'utf8'), 'original');
});
test('complete folders copy and same/descendant destinations produce an explicit error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'halo-paste-')), folder = path.join(dir, 'Desktop');
  await fs.mkdir(path.join(folder, 'sub'), { recursive: true }); await fs.writeFile(path.join(folder, 'sub', 'a.txt'), 'nested');
  await assert.rejects(pasteFiles([folder], folder), /dentro de sí misma/);
  await assert.rejects(pasteFiles([folder], path.join(folder, 'sub')), /dentro de sí misma/);
  const result = await pasteFiles([folder], dir);
  assert.equal(path.basename(result.paths[0]), 'Desktop - copia');
  assert.equal(await fs.readFile(path.join(result.paths[0], 'sub', 'a.txt'), 'utf8'), 'nested');
});
test('invalid destination or missing source fails before copying the batch', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'halo-paste-')), dest = path.join(dir, 'dest'), file = path.join(dir, 'a.txt');
  await fs.mkdir(dest); await fs.writeFile(file, 'a');
  await assert.rejects(pasteFiles([file, path.join(dir, 'missing')], dest));
  assert.deepEqual(await fs.readdir(dest), []);
  await assert.rejects(pasteFiles([file], file), /no es una carpeta/);
});
