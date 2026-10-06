// Envía combinaciones de teclas a la aplicación activa (acciones «Atajo de teclado» y
// «Pegar texto»). Aislado como el detector: si el controlador falla, el editor sigue vivo.
let keys;
process.parentPort.on('message', ({ data }) => {
  try {
    if (!keys) keys = require('uiohook-napi');
    const { uIOhook, UiohookKey } = keys;
    const parts = data.accelerator.split('+'), key = parts.pop();
    const code = UiohookKey[key];
    if (code === undefined) throw new Error('Tecla no disponible: ' + key);
    const modifiers = parts.map(part => {
      if (part === 'CommandOrControl') return process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl;
      return { Control: UiohookKey.Ctrl, Command: UiohookKey.Meta, Super: UiohookKey.Meta, Alt: UiohookKey.Alt, Shift: UiohookKey.Shift }[part];
    });
    uIOhook.keyTap(code, modifiers);
    process.parentPort.postMessage({ type: 'done', id: data.id });
  } catch (error) { process.parentPort.postMessage({ type: 'error', id: data.id, message: error.message }); }
});
process.parentPort.postMessage({ type: 'ready' });
