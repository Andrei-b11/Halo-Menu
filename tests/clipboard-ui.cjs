const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-clipboard-ui-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: require('electron'), args: [root, '--test-mode', '--aptic-profile=' + profile], env });
const saved = page => page.waitForFunction(() => document.querySelector('#save-state').dataset.state === 'saved');
async function editorOf(app) {
  await app.firstWindow();
  await app.evaluate(async ({ BrowserWindow }) => { while (!BrowserWindow.getAllWindows().some(w => w.webContents.getURL().endsWith('/index.html'))) await new Promise(r => setTimeout(r, 50)); });
  const page = app.windows().find(w => w.url().endsWith('/index.html'));
  page.on('pageerror', e => console.error('Renderer:', e.message));
  await page.waitForSelector('.row'); return page;
}
(async () => {
  let app = await launch(); const errors = [];
  try {
    let page = await editorOf(app); page.on('pageerror', e => errors.push(e.message));
    await page.locator('#add-clipboard').click(); await saved(page);
    assert.equal(await page.locator('#clipboard-tools').isVisible(), true);
    let config = (await page.evaluate(() => window.aptic.state())).config;
    const group = config.items.at(-1); assert.equal(group.items.length, 5);
    assert.deepEqual(group.items.map(i => i.target), ['1', '2', '3', '4', '5']);
    await page.locator('#clip-text-panel summary').click();
    await page.locator('#clip-text').fill('Texto persistente\nñ 🎉');
    await page.locator('#clip-save-text').click(); await page.waitForFunction(() => document.querySelector('#clip-preview').textContent.includes('persistente'));
    await page.locator('#clip-edit-text').click(); assert.equal(await page.locator('#clip-text').inputValue(), 'Texto persistente\nñ 🎉');
    await page.locator('#clip-action').selectOption('copy'); await saved(page);
    await page.evaluate(id => window.aptic.run(id), group.items[0].id);
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Texto persistente\nñ 🎉');
    // Real Ctrl+V lands in a dedicated recipient, never in the user's applications.
    if (process.env.HALO_TEST_NATIVE === '1') {
    await page.evaluate(async id => { const state = await window.aptic.state(); state.config.items.at(-1).items[0].clipAction = 'paste'; await window.aptic.save(state.config); }, group.items[0].id);
    await app.evaluate(async ({ BrowserWindow }) => {
      const receiver = new BrowserWindow({ title: 'HALO paste test', width: 400, height: 240 });
      await receiver.loadURL('data:text/html,<textarea id="receiver" autofocus></textarea>');
      await receiver.webContents.executeJavaScript('window.events=[]; document.addEventListener("keydown", e => window.events.push({key:e.key, ctrl:e.ctrlKey, alt:e.altKey}));');
      receiver.show(); receiver.focus();
    });
    const receiver = app.windows().find(w => w.url().startsWith('data:text/html'));
    await receiver.locator('#receiver').click();
    await app.evaluate(({ BrowserWindow, app }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('data:text/html')).focus(); });
    await receiver.waitForFunction(() => document.hasFocus());
    const receiverHandle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'HALO paste test').getNativeWindowHandle().readBigUInt64LE().toString());
    await require('./focus-window.cjs')(receiverHandle);
    await page.evaluate(id => window.aptic.run(id), group.items[0].id);
    await receiver.waitForFunction(() => document.querySelector('#receiver').value === 'Texto persistente\nñ 🎉');
    await receiver.close();
    }
    await page.locator('#clip-advanced summary').click();
    await page.locator('#clip-slot').selectOption('2'); await saved(page);
    await app.evaluate(({ clipboard }) => clipboard.writeText('Capturado desde fuera'));
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Capturado desde fuera');
    await page.locator('#clip-capture').click(); await page.waitForFunction(() => document.querySelector('#clip-preview').textContent === 'Capturado desde fuera');
    // Multiple files, Unicode and shell metacharacters remain literal file names.
    const source = path.join(profile, "niño ' $ (test).txt"); fs.writeFileSync(source, 'original');
    await page.evaluate(paths => window.aptic.clipboard({ op: 'files', slot: '3', mode: 'copy', paths }), [source]);
    fs.unlinkSync(source);
    await page.evaluate(() => window.aptic.clipboard({ op: 'copy', slot: '3' }));
    await page.evaluate(() => window.aptic.clipboard({ op: 'capture', slot: '4', mode: 'reference' }));
    const clip = await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '4' }));
    assert.equal(clip.kind, 'files'); assert.equal(clip.files[0].name, path.basename(source));
    assert.equal(fs.readFileSync(clip.files[0].source, 'utf8'), 'original');
    await page.evaluate(() => window.aptic.clipboard({ op: 'paths', slot: '4' }));
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), clip.files[0].source);
    await page.locator('#clip-slot').selectOption('3'); await saved(page);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts', 'clipboard-editor.png'), fullPage: true });
    // The live ring saves clipboard text via Ctrl+V to the pointed circle.
    await page.evaluate(() => window.aptic.showMenu());
    const overlay = app.windows().find(w => w.url().endsWith('/overlay.html'));
    await overlay.locator('[data-id="' + group.id + '"]').click();
    await app.evaluate(({ clipboard }) => clipboard.writeText('Guardado en el anillo'));
    const target = overlay.locator('[data-id="' + group.items[4].id + '"]');
    await target.focus(); await overlay.keyboard.press('Control+v');
    await page.waitForFunction(async () => (await window.aptic.clipboard({ op: 'get', slot: '5' }))?.text === 'Guardado en el anillo');
    await app.evaluate(({ clipboard }) => clipboard.writeText('Clic derecho guardado'));
    await overlay.locator('[data-id="' + group.id + '"]').focus(); await overlay.keyboard.press('Enter');
    await target.dispatchEvent('contextmenu');
    await page.waitForFunction(async () => (await window.aptic.clipboard({ op: 'get', slot: '5' }))?.text === 'Clic derecho guardado');
    await target.dispatchEvent('drop', { dataTransfer: await overlay.evaluateHandle(() => { const data = new DataTransfer(); data.setData('text/plain', 'Guardado en el anillo'); return data; }) });
    await page.waitForFunction(async () => (await window.aptic.clipboard({ op: 'get', slot: '5' }))?.text === 'Guardado en el anillo');
    await page.evaluate(() => window.aptic.hideMenu());
    await page.reload(); await page.waitForSelector('.row');
    await page.locator('.row[data-id="' + group.items[4].id + '"]').click();
    assert.equal(await page.locator('#clip-preview').textContent(), 'Guardado en el anillo');
    await app.close(); app = await launch(); page = await editorOf(app);
    assert.equal((await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '1' }))).text, 'Texto persistente\nñ 🎉');
    assert.equal((await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '5' }))).text, 'Guardado en el anillo');
    await page.evaluate(() => window.aptic.clipboard({ op: 'clear', slot: '5' }));
    assert.equal(await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '5' })), null);
    const before = (await page.evaluate(() => window.aptic.state())).config.items.length;
    await page.locator('#add-clipboard-single').click(); await saved(page);
    const standalone = (await page.evaluate(() => window.aptic.state())).config.items.at(-1);
    assert.equal(standalone.type, 'clipboard'); assert.equal(standalone.target, '6');
    assert.equal((await page.evaluate(() => window.aptic.state())).config.items.length, before + 1);
    assert.ok(await page.locator('#clip-pick-folder').isVisible());
    const folder = path.join(profile, 'Proyecto ñ');
    fs.mkdirSync(path.join(folder, 'vacía'), { recursive: true }); fs.writeFileSync(path.join(folder, 'nota.txt'), 'carpeta guardada');
    await page.evaluate(folder => window.aptic.clipboard({ op: 'files', slot: '6', mode: 'copy', paths: [folder] }), folder);
    fs.renameSync(folder, folder + '-movida');
    await page.locator('#clip-copy').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Copiado.'));
    await page.evaluate(() => window.aptic.clipboard({ op: 'capture', slot: '7', mode: 'reference' }));
    const folderClip = await page.evaluate(() => window.aptic.clipboard({ op: 'get', slot: '7' }));
    assert.equal(folderClip.files[0].directory, true);
    assert.equal(fs.readFileSync(path.join(folderClip.files[0].source, 'nota.txt'), 'utf8'), 'carpeta guardada');
    await page.screenshot({ path: path.join(root, 'artifacts', 'clipboard-folders.png'), fullPage: true });
    // Exercise the complete action when no folder is identifiable under the menu:
    // the picker supplies a destination, and success is reported only after copy.
    const pasteDestination = path.join(profile, 'paste-destination'); fs.mkdirSync(pasteDestination);
    await app.evaluate(({ dialog }, destination) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] }); }, pasteDestination);
    await page.evaluate(() => window.aptic.pinMenu(true));
    await page.evaluate(id => window.aptic.run(id), standalone.id);
    assert.equal(fs.readFileSync(path.join(pasteDestination, 'Proyecto ñ', 'nota.txt'), 'utf8'), 'carpeta guardada');
    assert.match((await page.evaluate(() => window.aptic.state())).clipboardResult.message, /Pegado en/);
    const sourceFolder = path.join(profile, 'Proyecto ñ-movida');
    await page.evaluate(folder => window.aptic.clipboard({ op: 'files', slot: '6', mode: 'reference', paths: [folder] }), sourceFolder);
    await app.evaluate(({ dialog }, destination) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] }); }, sourceFolder);
    await page.evaluate(() => window.aptic.pinMenu(true));
    const failure = await page.evaluate(async id => { try { await window.aptic.run(id); return ''; } catch (error) { return error.message; } }, standalone.id);
    assert.match(failure, /dentro de sí misma/);
    assert.match(await page.locator('#notice').innerText(), /dentro de sí misma/);
    assert.deepEqual(errors, []);
    console.log('OK: individual actions, folder copies/references, Windows folder clipboard, organized editor, five slots, text, file clipboard, ring capture/drop, restart and clear. Native Ctrl+V: ' + (process.env.HALO_TEST_NATIVE === '1' ? 'verified' : 'opt-in via HALO_TEST_NATIVE=1 (requires desktop foreground control).'));
  } catch (error) {
    const receiver = app.windows().find(w => w.url().startsWith('data:text/html'));
    if (receiver) console.error('Native input:', await receiver.evaluate(() => ({ events: window.events, focus: document.hasFocus(), active: document.activeElement?.id, value: document.querySelector('#receiver')?.value })));
    const page = app.windows().find(w => w.url().endsWith('/index.html'));
    if (page) console.error('State at failure:', await page.evaluate(async () => ({ toast: document.querySelector('#toast')?.textContent, clip: document.querySelector('#clip-preview')?.textContent, state: await window.aptic.state() })));
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
