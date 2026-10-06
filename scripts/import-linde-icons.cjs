// Copia los iconos propios de Linde (línea y color) a un módulo ES de HALO MENU.
// Uso: node scripts/import-linde-icons.cjs [ruta a linde-icons.js]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'Linde', 'src', 'renderer', 'assets', 'icons', 'linde-icons.js');
const sandbox = { globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox);
const { ICONS, COLOR_ICONS, TONES } = sandbox.globalThis.lindeIcons;
const output = path.join(__dirname, '..', 'src', 'renderer', 'linde-icons.js');
fs.writeFileSync(output, '// Iconos propios de Linde, importados con scripts/import-linde-icons.cjs. No editar a mano.\n'
  + 'export const ICONS=' + JSON.stringify(ICONS) + ';\n'
  + 'export const COLOR_ICONS=' + JSON.stringify(COLOR_ICONS) + ';\n'
  + 'export const TONES=' + JSON.stringify(TONES) + ';\n');
console.log('Importados ' + Object.keys(ICONS).length + ' iconos en ' + path.relative(process.cwd(), output));
