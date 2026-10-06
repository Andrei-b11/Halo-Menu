// Prueba de extremo a extremo con Electron real: editor, guardado automático, submenús,
// deshacer, el anillo de verdad (teclado y clic por sector) y la migración desde la 0.1.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
const launch = profile => electron.launch({ executablePath: require('electron'), args: [root, '--test-mode', '--aptic-profile=' + profile], env });
const disk = profile => JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
async function editorOf(app) {
  await app.firstWindow();
  await app.evaluate(async ({ BrowserWindow }) => { while (!BrowserWindow.getAllWindows().some(w => w.webContents.getURL().endsWith('/index.html'))) await new Promise(r => setTimeout(r, 50)); });
  const page = app.windows().find(w => w.url().endsWith('/index.html'));
  await page.waitForSelector('.row');
  return page;
}
const saved = page => page.waitForFunction(() => document.querySelector('#save-state').dataset.state === 'saved');
const settled = page => page.waitForFunction(() => ['saved', 'partial'].includes(document.querySelector('#save-state').dataset.state));
const overlayVisible = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle().includes('· Menú')).isVisible());
const editorVisible = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')).isVisible());

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aptic-ui-'));
  fs.mkdirSync(output, { recursive: true });
  let app = await launch(profile); const checks = [], errors = [];
  try {
    let page = await editorOf(app);
    page.on('pageerror', e => errors.push(e.message));
    assert.equal(await page.locator('.row').count(), 12); checks.push('Arranque: 8 acciones y un submenú de 4');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined'); checks.push('Renderer aislado de Node');
    await page.screenshot({ path: path.join(output, '01-menu.png') });

    await page.locator('#action-name').fill('Mis archivos'); await saved(page);
    assert.equal(disk(profile).items[0].label, 'Mis archivos'); checks.push('Edición con guardado automático');

    await page.locator('#add').click(); await page.locator('#action-name').fill('Portal'); await page.locator('#action-url').fill('https://example.com'); await saved(page);
    assert.equal(disk(profile).items[1].label, 'Portal'); assert.equal(disk(profile).items.length, 9); checks.push('Añadir acción tras la elegida');
    await page.locator('#action-place').selectOption('edit'); await saved(page);
    assert.equal(disk(profile).items.find(i => i.id === 'edit').items.at(-1).label, 'Portal'); checks.push('Mover una acción a un submenú');
    await page.locator('#types [data-type="keys"]').click(); await page.locator('#action-keys').focus(); await page.keyboard.press('Control+Shift+T'); await saved(page);
    assert.equal(disk(profile).items.find(i => i.id === 'edit').items.at(-1).target, 'Control+Shift+T'); checks.push('Acción de teclado con combinación grabada');
    await page.locator('#item-colors .swatch').nth(3).click(); await saved(page);
    assert.match(disk(profile).items.find(i => i.id === 'edit').items.at(-1).color, /^#/); checks.push('Color propio por acción');

    await page.locator('.row[data-id="files"]').click(); await page.locator('#action-name').fill('Temporal'); await saved(page);
    await page.locator('.row[data-id="files"]').click();
    await page.keyboard.press('Control+Z'); await saved(page); assert.equal(disk(profile).items[0].label, 'Mis archivos');
    await page.keyboard.press('Control+Y'); await saved(page); assert.equal(disk(profile).items[0].label, 'Temporal');
    await page.keyboard.press('Control+Z'); await saved(page); assert.equal(disk(profile).items[0].label, 'Mis archivos'); checks.push('Deshacer y rehacer');

    await page.locator('[data-page="appearance"]').click(); await page.locator('[data-theme-value="midnight"]').click();
    await page.locator('[data-setting="labels"] [data-value="center"]').click();
    await page.locator('[data-page="shape"]').click(); await page.locator('[data-setting="animation"] [data-value="bloom"]').click(); await page.locator('[data-setting="style"] [data-value="ring"]').click(); await saved(page);
    await page.screenshot({ path: path.join(output, '02-appearance.png') });
    const look = disk(profile); assert.equal(look.theme, 'midnight'); assert.equal(look.animation, 'bloom'); assert.equal(look.style, 'ring'); assert.equal(look.labels, 'center'); checks.push('Tema, estilo, etiquetas y animación');

    await page.locator('[data-page="shortcut"]').click(); await page.locator('#accelerator').focus(); await page.keyboard.press('Control+Alt+X');
    await page.locator('#shortcut-mode [data-value="hold"]').click(); await page.locator('#mouse [data-value="middle"]').click(); await saved(page);
    assert.equal(disk(profile).shortcut.accelerator, 'CommandOrControl+Alt+X'); assert.equal(disk(profile).shortcut.mode, 'hold'); assert.equal(disk(profile).mouse, 'middle'); checks.push('Atajo grabado, mantener y soltar, botón del ratón');

    // Tu caso: una acción a medias ya no bloquea el resto. Se aplica el gesto y la acción conserva su versión anterior.
    await page.locator('[data-page="actions"]').click(); await page.locator('.row[data-id="files"]').click();
    await page.locator('#types [data-type="path"]').click(); await page.locator('#apps-close').click();
    await page.locator('[data-page="shortcut"]').click(); await page.locator('#shortcut-mode [data-value="double"]').click(); await page.locator('[data-setting="modifierTap"] [data-value="Control"]').click();
    await page.waitForFunction(() => document.querySelector('#save-state').dataset.state === 'partial');
    assert.equal(disk(profile).shortcut.mode, 'double'); assert.equal(disk(profile).modifierTap, 'Control'); assert.equal(disk(profile).items[0].type, 'system');
    await page.screenshot({ path: path.join(output, '04-gestos.png') });
    checks.push('Una acción a medias no bloquea: los gestos se aplican al instante');

    // Aplicaciones instaladas: se añaden desde la lista del sistema.
    await page.locator('[data-page="actions"]').click(); await page.locator('#add-app').click();
    await page.waitForSelector('.app-row', { timeout: 15000 });
    const appName = (await page.locator('.app-row').first().textContent()).trim();
    await page.locator('.app-row').first().click(); await settled(page);
    assert.ok(JSON.stringify(disk(profile)).includes(JSON.stringify(appName).slice(1, -1))); checks.push('Añadir una aplicación instalada (' + appName + ')');

    // Subgrupo dentro de un grupo.
    await page.locator('.row[data-id="edit"]').click(); await page.locator('#group-add-sub').click();
    const sub = await page.evaluate(() => document.querySelector('.row.selected').dataset.id);
    await page.locator('.row.selected + .row').click(); await page.locator('#action-url').fill('https://example.org'); await settled(page);
    const editGroup = disk(profile).items.find(i => i.id === 'edit');
    assert.ok(editGroup.items.some(i => i.id === sub && i.type === 'group' && i.items[0].target === 'https://example.org')); checks.push('Grupos dentro de grupos');
    await page.locator('#stage').screenshot({ path: path.join(output, '05-subgrupo.png') });

    // Anillo en vivo: se queda abierto y se redibuja con cada cambio.
    await page.locator('#pin').click(); await page.waitForTimeout(400);
    const live = app.windows().find(win => win.url().endsWith('overlay.html'));
    assert.equal(await overlayVisible(app), true);
    await page.locator('[data-page="appearance"]').click(); await page.locator('#accents .swatch').nth(7).click(); await settled(page); await page.waitForTimeout(300);
    assert.equal(await live.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#5aa2f0');
    await page.locator('#pin').click(); await page.waitForTimeout(300); assert.equal(await overlayVisible(app), false);
    checks.push('Anillo en vivo que se actualiza al cambiar ajustes');
    await page.locator('[data-page="actions"]').click(); await page.locator('.row[data-id="files"]').click(); await page.locator('#types [data-type="system"]').click(); await saved(page);

    // «Carpeta» admite cualquier carpeta del equipo, no solo las del sistema.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'aptic-carpeta-'));
    await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, folder);
    await page.locator('.row[data-id="desktop"]').click(); await page.locator('#system-target').selectOption('__other'); await settled(page);
    const chosen = disk(profile).items.find(i => i.id === 'desktop');
    assert.equal(chosen.type, 'folder'); assert.equal(chosen.target, folder); assert.equal(chosen.label, path.basename(folder));
    assert.match(await page.locator('#system-target option[value="__folder"]').textContent(), /Otra carpeta/);
    await page.locator('#system-target').selectOption('desktop'); await settled(page); assert.equal(disk(profile).items.find(i => i.id === 'desktop').type, 'system');
    checks.push('Elegir cualquier carpeta del equipo');

    // La × saca una acción del anillo a la biblioteca; arrastrar la devuelve.
    const ringBefore = disk(profile).items.length;
    await page.locator('.row[data-id="pictures"]').hover(); await page.locator('.row[data-id="pictures"] .row-remove').click(); await settled(page);
    assert.equal(disk(profile).items.length, ringBefore - 1); assert.ok(disk(profile).library.some(i => i.id === 'pictures'));
    // Arrastre HTML5 con eventos reales del navegador (Playwright no lo simula en Electron).
    const drag = (from, to) => page.evaluate(([a, b]) => { const src = document.querySelector(a), dst = document.querySelector(b), dt = new DataTransfer(); const r = dst.getBoundingClientRect(); const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + r.height * .8 };
      src.dispatchEvent(new DragEvent('dragstart', at)); dst.dispatchEvent(new DragEvent('dragover', at)); dst.dispatchEvent(new DragEvent('drop', at)); src.dispatchEvent(new DragEvent('dragend', at)); }, [from, to]);
    await drag('.tile[data-id="pictures"]', '.row[data-id="files"]'); await settled(page);
    assert.ok(disk(profile).items.some(i => i.id === 'pictures')); assert.ok(!disk(profile).library.some(i => i.id === 'pictures'));
    await page.locator('.tile[data-id="lib-music"] .tile-add').click(); await settled(page);
    assert.ok(disk(profile).items.some(i => i.id === 'lib-music'));
    checks.push('Quitar con la ×, arrastrar desde la biblioteca y añadir con +');
    await page.screenshot({ path: path.join(output, '06-biblioteca.png') });

    // Perfiles: uno nuevo copia el actual; cambiar desde fuera (atajo o bandeja) lo adopta el editor.
    await page.locator('#profile-add').click(); await page.locator('#profile-name').fill('Trabajo'); await settled(page);
    let conf = disk(profile); assert.equal(conf.profiles.length, 2); assert.equal(conf.profiles.find(p => p.id === conf.activeProfile).name, 'Trabajo');
    await page.locator('.row').nth(2).hover(); await page.locator('.row').nth(2).locator('.row-remove').click(); await settled(page);
    const workSize = disk(profile).items.length;
    await page.evaluate(() => window.aptic.profile('main')); await page.waitForFunction(() => document.querySelector('.profile-tab.active')?.textContent.includes('Principal'));
    conf = disk(profile); assert.equal(conf.activeProfile, 'main'); assert.equal(conf.profiles.find(p => p.name === 'Trabajo').items.length, workSize); assert.equal(conf.items.length, workSize + 1);
    await page.locator('.profile-tab', { hasText: 'Trabajo' }).click(); await settled(page); assert.equal(disk(profile).items.length, workSize);
    await page.locator('#profile-hotkey').focus(); await page.keyboard.press('Control+Alt+9'); await settled(page);
    assert.equal(disk(profile).profiles.find(p => p.name === 'Trabajo').hotkey, 'CommandOrControl+Alt+9');
    await page.screenshot({ path: path.join(output, '07-perfiles.png') });
    checks.push('Perfiles: crear, cambiar desde el editor y desde fuera, atajo propio');
    await page.locator('.profile-tab', { hasText: 'Principal' }).click(); await settled(page);

    await page.locator('[data-page="actions"]').click(); await page.locator('#try').click();
    const overlay = app.windows().find(win => win.url().endsWith('overlay.html')); assert.ok(overlay);
    overlay.on('pageerror', e => errors.push('overlay: ' + e.message));
    await overlay.waitForSelector('.ring[data-open] .ring-opt', { state: 'attached' }); await overlay.waitForTimeout(500);
    assert.equal(await overlay.locator('.ring-opt').count(), 10);
    await overlay.keyboard.press('ArrowRight'); assert.equal(await overlay.evaluate(() => document.activeElement.className.includes('ring-opt')), true);
    // El submenú se abre con Intro y se cierra con Retroceso, sin cerrar el anillo.
    const group = await overlay.evaluate(() => [...document.querySelectorAll('.ring-opt')].findIndex(b => b.dataset.id === 'edit'));
    await overlay.keyboard.press(String(group + 1)); await overlay.waitForSelector('.ring-arc .ring-sub', { state: 'attached' });
    assert.equal(await overlay.locator('.ring-sub').count(), 6);
    await overlay.screenshot({ path: path.join(output, '03-overlay.png') });
    await overlay.keyboard.press('Backspace'); assert.equal(await overlay.locator('.ring-sub').count(), 0); assert.equal(await overlayVisible(app), true);
    await overlay.keyboard.press('Escape'); await page.waitForTimeout(450); assert.equal(await overlayVisible(app), false); checks.push('Anillo real: teclado, submenú y cierre');

    // La X cierra el anillo aunque el cursor haya abierto un grupo al pasar por encima.
    await page.evaluate(() => window.aptic.showMenu()); await overlay.waitForSelector('.ring[data-open] .ring-opt', { state: 'attached' }); await overlay.waitForTimeout(450);
    const groupAt = await overlay.evaluate(() => { const b = document.querySelector('.ring-opt[data-id="edit"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await overlay.mouse.move(groupAt.x, groupAt.y); await overlay.waitForSelector('.ring-arc .ring-sub', { state: 'attached' });
    const hubAt = await overlay.evaluate(() => { const b = document.querySelector('.ring-hub').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await overlay.mouse.move(hubAt.x, hubAt.y); await overlay.mouse.click(hubAt.x, hubAt.y);
    await page.waitForTimeout(500); assert.equal(await overlayVisible(app), false); checks.push('La X cierra el anillo aunque haya un grupo abierto');

    // Clic en el sector (fuera del círculo) de «Configurar»: elige la acción y abre el editor.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')).hide());
    await page.evaluate(() => window.aptic.showMenu()); await overlay.waitForSelector('.ring[data-open] .ring-opt', { state: 'attached' }); await overlay.waitForTimeout(450);
    const point = await overlay.evaluate(() => {
      const ring = document.querySelector('.ring'), r = ring.getBoundingClientRect(), b = document.querySelector('.ring-opt[data-id="settings"]').getBoundingClientRect();
      const dx = b.left + b.width / 2 - r.left, dy = b.top + b.height / 2 - r.top, d = Math.hypot(dx, dy);
      return { x: r.left + dx / d * (d + b.width / 2 + 18), y: r.top + dy / d * (d + b.width / 2 + 18) };
    });
    await overlay.mouse.move(point.x, point.y); await overlay.mouse.click(point.x, point.y);
    await page.waitForTimeout(500); assert.equal(await overlayVisible(app), false); assert.equal(await editorVisible(app), true); checks.push('Clic en cualquier punto del sector elige la acción');

    const result = await page.evaluate(async () => { const s = await window.aptic.state(); s.config.items[0].type = 'url'; s.config.items[0].target = 'javascript:alert(1)'; const r = await window.aptic.save(s.config); const bad = await window.aptic.save({ ...s.config, accent: 'rojo' }).then(() => false, () => true); return { r, bad }; });
    assert.equal(result.bad, true); assert.ok(!JSON.stringify(disk(profile)).includes('javascript:')); assert.ok(result.r.issues.length >= 1);
    checks.push('IPC nunca guarda destinos peligrosos y rechaza ajustes no válidos');

    assert.deepEqual(errors, []); await app.close();
    app = await launch(profile); page = await editorOf(app);
    assert.ok(await page.locator('.row').count() >= 15); assert.equal(await page.locator('body').getAttribute('data-theme'), 'midnight'); assert.match(await page.locator('.row').first().textContent(), /Mis archivos/);
    checks.push('Persistencia después de reiniciar'); await app.close();

    // Una configuración de la versión 0.1 se abre y se traduce sola.
    const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'aptic-legacy-'));
    fs.writeFileSync(path.join(legacy, 'settings.json'), JSON.stringify({ version: 1, theme: 'charcoal', accent: '#f1768b', animation: 'spiral', duration: 280, radius: 104, size: 52, opacity: 96, labels: true, nativeIcons: true, closeOnBlur: true, position: 'cursor', shortcut: { accelerator: 'CommandOrControl+Alt+Space', mode: 'single', interval: 350 }, items: [{ id: 'a', label: 'Uno', type: 'system', target: 'home', icon: 'folder' }, { id: 'b', label: 'Dos', type: 'settings', target: '', icon: 'app' }] }));
    app = await launch(legacy); page = await editorOf(app);
    assert.equal(await page.locator('.row').count(), 2); assert.equal(await page.locator('body').getAttribute('data-theme'), 'carbon');
    checks.push('Migración desde la versión 0.1');
    console.log(JSON.stringify({ ok: true, checks, errors }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
