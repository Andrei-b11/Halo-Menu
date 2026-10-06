const fs = require('node:fs/promises');
const path = require('node:path');

// Explicit, awaited filesystem transfer: never report success merely because a
// shell copy was queued. Existing items get a new name rather than overwritten.
async function pasteFiles(sources, destination) {
  const directory = await fs.realpath(destination);
  if (!(await fs.stat(directory)).isDirectory()) throw Error('El destino no es una carpeta.');
  const plans = [];
  for (const source of sources) {
    const real = await fs.realpath(source), stat = await fs.stat(real);
    const inside = path.relative(real, directory);
    if (stat.isDirectory() && (!inside || (!inside.startsWith('..' + path.sep) && inside !== '..' && !path.isAbsolute(inside)))) throw Error('No se puede pegar una carpeta dentro de sí misma. Elige otra carpeta de destino.');
    plans.push({ real, directory: stat.isDirectory(), name: path.basename(source) });
  }
  const copied = [];
  for (const plan of plans) {
    const ext = plan.directory ? '' : path.extname(plan.name), base = plan.name.slice(0, plan.name.length - ext.length);
    let target;
    for (let n = 0; ; n++) {
      target = path.join(directory, n === 0 ? plan.name : base + ' - copia' + (n > 1 ? ' (' + n + ')' : '') + ext);
      try { await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    }
    try {
      await fs.cp(plan.real, target, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
      copied.push(target);
    } catch (error) { throw Error('No se pudo copiar «' + plan.name + '»: ' + error.message + (copied.length ? ' Ya se copiaron ' + copied.length + ' elementos.' : '')); }
  }
  return { destination: directory, paths: copied };
}
module.exports = { pasteFiles };
