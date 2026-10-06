// Real Explorer transfer for saved files and folders, independent of desktop focus.
const { _electron: electron } = require('playwright-core');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const exec = promisify(execFile), root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-explorer-'));
const destination = path.join(directory, 'Destino HALO'), source = path.join(directory, 'Archivo asignado.txt');
fs.mkdirSync(destination); fs.writeFileSync(source, 'HALO file paste verification');
const ps = code => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, timeout: 20000 });
const destLiteral = destination.replace(/'/g, "''");
let app;
(async () => {
  app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-mode', '--aptic-profile=' + path.join(directory, 'profile')], env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')) });
  await app.firstWindow();
  const page = app.windows().find(w => w.url().endsWith('/index.html')); await page.waitForSelector('.row');
  const focus = require('../src/main/paste-focus.cjs').createPasteFocus([]);
  try {
    const captured = await focus.capture();
    assert.ok(captured && 'pointer' in captured, 'Windows pointer capture helper must start and respond');
    if (captured.pointer) assert.match(captured.pointer.handle, /^\d+$/);
  } finally { focus.close(); }
  await page.locator('#add-clipboard-single').click();
  await page.waitForFunction(() => document.querySelector('#save-state').dataset.state === 'saved');
  await page.evaluate(source => window.aptic.clipboard({ op: 'files', slot: '1', mode: 'copy', paths: [source] }), source);
  await app.evaluate(async ({ shell }, destination) => { const error = await shell.openPath(destination); if (error) throw Error(error); }, destination);
  const focused = await ps(`Add-Type @'
using System; using System.Runtime.InteropServices;
public class F { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
'@
$shell = New-Object -ComObject Shell.Application
for ($n=0; $n -lt 40; $n++) {
 $window = @($shell.Windows()) | Where-Object { try { $_.Document.Folder.Self.Path -eq '${destLiteral}' } catch { $false } } | Select-Object -First 1
 if ($window) { [Console]::WriteLine($window.HWND); break }
 Start-Sleep -Milliseconds 100
}
if (!$window) { throw 'Explorer destination not found' }`);
  // Exercise the same Explorer transfer used by the circle with its real HWND.
  const value = await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '1' }));
  const stored = path.join(directory, 'profile', 'clipboard', value.files[0].stored);
  assert.equal((await require('../src/main/file-clipboard.cjs').pasteFiles([stored], { handle: focused.stdout.trim() })).destination, destination);
  const result = path.join(destination, path.basename(source));
  const until = Date.now() + 15000;
  while (!fs.existsSync(result) && Date.now() < until) await new Promise(r => setTimeout(r, 100));
  const state = await page.evaluate(() => window.aptic.state());
  if (!fs.existsSync(result)) {
    await page.evaluate(() => window.aptic.clipboard({ op: 'capture', slot: '2', mode: 'reference' }));
    console.log('Clipboard after click:', await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '2' })));
    console.log('Destination entries:', fs.readdirSync(destination));
  }
  assert.ok(fs.existsSync(result), 'File did not paste in Explorer. ' + state.warning);
  assert.equal(fs.readFileSync(result, 'utf8'), 'HALO file paste verification');
  // The explicit destination path uses the same transfer and supports folders too.
  const folder = path.join(directory, 'Carpeta asignada'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'interior.txt'), 'nested');
  assert.equal((await require('../src/main/file-clipboard.cjs').pasteFiles([folder], { folder: destination })).destination, destination);
  const copied = path.join(destination, 'Carpeta asignada', 'interior.txt'), deadline = Date.now() + 10000;
  while (!fs.existsSync(copied) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  assert.equal(fs.readFileSync(copied, 'utf8'), 'nested');
  console.log('OK: real Explorer transfer by window handle pasted the assigned file; explicit destination also pasted a folder with its contents.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  await ps(`$shell=New-Object -ComObject Shell.Application; @($shell.Windows()) | ForEach-Object { try { if ($_.Document.Folder.Self.Path -eq '${destLiteral}') { $_.Quit() } } catch {} }`).catch(() => {});
});
