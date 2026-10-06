const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_TEXT = 1024 * 1024, MAX_FILES = 100, MAX_BYTES = 200 * 1024 * 1024;
const slotId = id => { if (!/^(?:[1-9]|1[0-2])$/.test(String(id))) throw Error('Elige un espacio del 1 al 12.'); return String(id); };

// Separate from settings: profile switches and undo never overwrite saved contents.
class ClipboardStore {
  constructor(directory) {
    this.root = path.join(directory, 'clipboard');
    fs.mkdirSync(this.root, { recursive: true });
    this.file = path.join(this.root, 'slots.json');
    this.slots = {};
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !data.slots || typeof data.slots !== 'object') throw Error('Formato no válido');
      for (const [id, value] of Object.entries(data.slots)) {
        slotId(id);
        if (value.kind === 'text') { if (typeof value.text !== 'string' || value.text.length > MAX_TEXT) throw Error('Texto no válido'); }
        else if (value.kind === 'files' && ['copy', 'reference'].includes(value.mode) && Array.isArray(value.files) && value.files.length && value.files.length <= MAX_FILES) {
          for (const file of value.files) {
            if (typeof file.source !== 'string' || !path.isAbsolute(file.source)) throw Error('Ruta no válida');
            if (value.mode === 'copy') this.storedPath(file.stored);
          }
        } else throw Error('Contenido no válido');
      }
      this.slots = data.slots;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const backup = this.file + '.invalid-' + Date.now();
        fs.copyFileSync(this.file, backup);
        this.warning = 'No se pudo leer el portapapeles guardado. Se conserva en ' + backup;
      }
    }
  }
  storedPath(relative) {
    if (typeof relative !== 'string' || path.isAbsolute(relative)) throw Error('Copia no válida.');
    const resolved = path.resolve(this.root, relative), rel = path.relative(this.root, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !/^files[\\/]/.test(rel)) throw Error('Copia fuera del almacén.');
    return resolved;
  }
  get(id) { return this.slots[slotId(id)] || null; }
  put(id, value) {
    id = slotId(id);
    const next = { ...this.slots };
    if (value) next[id] = { ...value, updatedAt: new Date().toISOString() }; else delete next[id];
    const fd = fs.openSync(this.file + '.tmp', 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ version: 1, slots: next }, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(this.file + '.tmp', this.file);
    this.slots = next;
    // Old copies stay available to applications that still hold clipboard paths.
    return this.get(id);
  }
  text(id, text) {
    if (typeof text !== 'string' || !text.length || text.length > MAX_TEXT || text.includes('\0')) throw Error('Guarda texto de entre 1 y 1.048.576 caracteres.');
    return this.put(id, { kind: 'text', text });
  }
  async files(id, sources, mode) {
    slotId(id);
    if (!['copy', 'reference'].includes(mode)) throw Error('Modo de archivo no válido.');
    if (!Array.isArray(sources) || !sources.length || sources.length > MAX_FILES) throw Error('Elige entre 1 y 100 archivos o carpetas.');
    sources = [...new Set(sources)];
    let bytes = 0, entries = 0;
    const plans = [], root = await fs.promises.realpath(this.root);
    for (const source of sources) {
      if (typeof source !== 'string' || !path.isAbsolute(source) || source.includes('\0')) throw Error('Ruta no válida.');
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() && !stat.isDirectory()) throw Error('Selecciona archivos o carpetas normales.');
      const plan = { directory: stat.isDirectory(), nodes: [] }; plans.push(plan);
      if (mode !== 'copy') continue;
      if (stat.isDirectory()) {
        const real = await fs.promises.realpath(source), relative = path.relative(real, root);
        if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Esta carpeta contiene el almacén de HALO. Usa «Referencia al original» para evitar copiarlo dentro de sí mismo.');
      }
      // Build the complete tree before writing. Never follow junctions or symlinks.
      const pending = [{ source, relative: '', depth: 0 }];
      while (pending.length) {
        const node = pending.pop(), info = await fs.promises.lstat(node.source);
        if (info.isSymbolicLink()) throw Error('La carpeta contiene enlaces o uniones. Usa «Referencia al original».');
        if (!info.isDirectory() && !info.isFile()) throw Error('La carpeta contiene un elemento que no se puede copiar.');
        if (++entries > 10000 || node.depth > 128) throw Error('La carpeta tiene demasiados elementos o niveles. Usa «Referencia al original».');
        if (info.isFile()) bytes += info.size;
        if (bytes > MAX_BYTES) throw Error('La copia supera 200 MB. Usa «Referencia al original».');
        plan.nodes.push({ ...node, directory: info.isDirectory() });
        if (info.isDirectory()) for (const name of await fs.promises.readdir(node.source)) {
          if (pending.length + entries >= 10000) throw Error('La carpeta tiene demasiados elementos. Usa «Referencia al original».');
          pending.push({ source: path.join(node.source, name), relative: path.join(node.relative, name), depth: node.depth + 1 });
        }
      }
    }
    const batch = randomUUID(), files = []; let copiedBytes = 0;
    for (const [i, source] of sources.entries()) {
      const file = { source, name: path.basename(source) || 'Carpeta', directory: plans[i].directory };
      if (mode === 'copy') {
        file.stored = path.join('files', batch, String(i), file.name);
        const target = this.storedPath(file.stored);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        for (const node of plans[i].nodes) {
          const destination = path.join(target, node.relative), info = await fs.promises.lstat(node.source);
          if (info.isSymbolicLink() || info.isDirectory() !== node.directory) throw Error('La carpeta cambió mientras se guardaba. Inténtalo de nuevo.');
          if (node.directory) await fs.promises.mkdir(destination, { recursive: true });
          else {
            if ((copiedBytes += info.size) > MAX_BYTES) throw Error('La copia supera 200 MB. Usa «Referencia al original».');
            await fs.promises.copyFile(node.source, destination, fs.constants.COPYFILE_EXCL);
          }
        }
      }
      files.push(file);
    }
    return this.put(id, { kind: 'files', mode, files });
  }
  paths(value) { return value.files.map(file => value.mode === 'copy' ? this.storedPath(file.stored) : file.source); }
  async availablePaths(value) {
    const paths = this.paths(value);
    for (const [index, file] of paths.entries()) {
      try { const stat = await fs.promises.stat(file); if (value.files[index].directory ? !stat.isDirectory() : !stat.isFile()) throw Error(); }
      catch { throw Error('No se encuentra «' + path.basename(file) + '». Vuelve a elegirlo en este espacio.'); }
    }
    return paths;
  }
  summary() {
    return Object.fromEntries(Object.entries(this.slots).map(([id, value]) => [id, {
      kind: value.kind, mode: value.mode, updatedAt: value.updatedAt,
      preview: value.kind === 'text' ? value.text.slice(0, 160) : value.files.map(f => (f.directory ? 'Carpeta completa: ' : '') + f.name + '\n' + f.source).join('\n\n')
    }]));
  }
}
module.exports = { ClipboardStore, slotId };
