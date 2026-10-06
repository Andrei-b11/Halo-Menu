// This integration test uses genuine OS key events. Run on an interactive desktop.
const { _electron:electron }=require('playwright-core');
const { uIOhook,UiohookKey:Key }=require('uiohook-napi');
const { defaults }=require('../src/main/config.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(test){const until=Date.now()+6000;while(Date.now()<until){if(await test())return;await delay(50);}throw Error('Native integration timed out');}
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'aptic-native-')),config=defaults();
  config.shortcut.accelerator='Control+Alt+F11';fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(config));
  const app=await electron.launch({executablePath:process.env.HALO_TEST_EXE || require('electron'),args:[...(process.env.HALO_TEST_EXE?[]:[path.resolve(__dirname,'..')]),'--aptic-profile='+profile],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});
  const checks=[];
  try{
    await app.firstWindow();await waitFor(()=>Promise.resolve(app.windows().some(w=>w.url().endsWith('/index.html'))));
    const page=app.windows().find(w=>w.url().endsWith('/index.html'));await page.waitForSelector('.row');
    await page.waitForFunction(async()=>(await window.aptic.state()).shortcutStatus==='Activo');
    const visible=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('· Menú')).isVisible());
    uIOhook.keyTap(Key.F11,[Key.Ctrl,Key.Alt]);await waitFor(visible);checks.push('Atajo global real abre el menú');
    await page.evaluate(()=>window.aptic.hideMenu());
    await app.evaluate(({globalShortcut})=>globalShortcut.register('Control+Alt+F12',()=>{}));
    const rejected=await page.evaluate(async()=>{const s=await window.aptic.state();s.config.shortcut.accelerator='Control+Alt+F12';try{await window.aptic.save(s.config);return false;}catch{return true;}});assert.ok(rejected);assert.equal((await page.evaluate(()=>window.aptic.state())).config.shortcut.accelerator,'Control+Alt+F11');checks.push('Conflicto de atajo conserva el anterior');
    await page.evaluate(async()=>{const s=await window.aptic.state();s.config.shortcut={accelerator:'Control+Alt+F10',mode:'double',interval:450};await window.aptic.save(s.config);});
    await delay(600);
    // One press and auto-repeat without release must not open the menu.
    uIOhook.keyToggle(Key.Ctrl,'down');uIOhook.keyToggle(Key.Alt,'down');uIOhook.keyToggle(Key.F10,'down');
    await delay(60);uIOhook.keyToggle(Key.F10,'down');await delay(60);assert.equal(await visible(),false);
    uIOhook.keyToggle(Key.F10,'up');await delay(80);assert.equal(await visible(),false);
    uIOhook.keyTap(Key.F10);uIOhook.keyToggle(Key.Alt,'up');uIOhook.keyToggle(Key.Ctrl,'up');await waitFor(visible);checks.push('Doble pulsación real e inmunidad a repetición sin soltar');
    await page.evaluate(()=>window.aptic.hideMenu());
    await page.evaluate(async()=>{const s=await window.aptic.state();s.config.items[0].type='path';s.config.items[0].target='C:\\HALO_missing_test_file_828299.exe';await window.aptic.save(s.config);try{await window.aptic.run(s.config.items[0].id);}catch{}});
    assert.match(await page.locator('#notice').innerText(),/No se pudo ejecutar/);checks.push('Acción inexistente presenta error recuperable');
    console.log(JSON.stringify({ok:true,checks},null,2));
  }finally{uIOhook.keyToggle(Key.F10,'up');uIOhook.keyToggle(Key.Alt,'up');uIOhook.keyToggle(Key.Ctrl,'up');await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
