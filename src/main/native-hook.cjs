// El detector nativo vive aislado: un fallo del controlador no puede tumbar el editor.
// Escucha cuatro gestos, todos pasivos (la aplicación activa recibe también la tecla o el botón):
//  · doble pulsación de una combinación;
//  · mantener una combinación: se abre al pulsar y elige al soltar;
//  · mantener un botón del ratón (rueda o laterales), como el anillo de Logitech;
//  · doble toque de una tecla modificadora sola (Ctrl, Alt o Mayús).
const { DoubleTap } = require('./config.cjs');
const BUTTONS = { middle: 3, back: 4, forward: 5 };
let hook;
process.parentPort.on('message', ({ data }) => {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    hook = uIOhook;
    const send = (type, source) => process.parentPort.postMessage({ type, source });
    const modifierCodes = ['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight'].map(k => UiohookKey[k]);
    const keyboard = data.keyboard;
    if (keyboard) {
      const parts = keyboard.accelerator.split('+'), key = parts.pop();
      const code = UiohookKey[key];
      if (code === undefined) throw new Error('La tecla no está disponible para este modo.');
      const modifiers = new Set(parts.map(p => p === 'CommandOrControl' ? (process.platform === 'darwin' ? 'Command' : 'Control') : p));
      const matches = e => e.ctrlKey === modifiers.has('Control') && e.altKey === modifiers.has('Alt') && e.shiftKey === modifiers.has('Shift') && e.metaKey === (modifiers.has('Command') || modifiers.has('Super'));
      if (keyboard.mode === 'double') {
        const tap = new DoubleTap(keyboard.interval, () => send('trigger', 'shortcut'));
        hook.on('keydown', e => { if (e.keycode === code) tap.press(matches(e)); else if (!modifierCodes.includes(e.keycode)) tap.reset(); });
        hook.on('keyup', e => { if (e.keycode === code) tap.release(performance.now()); });
      } else {
        // Mantener: la repetición automática no vuelve a abrir; soltar la tecla elige.
        let held = false;
        hook.on('keydown', e => { if (e.keycode === code && !held && matches(e)) { held = true; send('down', 'shortcut'); } });
        hook.on('keyup', e => { if (e.keycode === code && held) { held = false; send('up', 'shortcut'); } });
      }
    }
    if (data.modifierTap && data.modifierTap !== 'none') {
      // Doble toque: pulsar y soltar la tecla sola dos veces. Cualquier otra tecla por medio
      // (Ctrl + C, por ejemplo) anula la cuenta, así que escribir no lo dispara.
      const own = { Control: ['Ctrl', 'CtrlRight'], Alt: ['Alt', 'AltRight'], Shift: ['Shift', 'ShiftRight'] }[data.modifierTap].map(k => UiohookKey[k]);
      const tap = new DoubleTap(keyboard?.interval || 350, () => send('trigger', 'modifier'));
      const down = new Set();
      hook.on('keydown', e => {
        if (own.includes(e.keycode)) { if (down.size === 0 || down.has(e.keycode)) tap.press(true); else tap.reset(); down.add(e.keycode); }
        else tap.reset();
      });
      hook.on('keyup', e => { if (own.includes(e.keycode)) { down.delete(e.keycode); tap.release(performance.now()); } });
      hook.on('mousedown', () => tap.reset());
    }
    const button = BUTTONS[data.mouse];
    if (button) {
      let held = false;
      hook.on('mousedown', e => { if (e.button === button && !held) { held = true; send('down', 'mouse'); } });
      hook.on('mouseup', e => { if (e.button === button && held) { held = false; send('up', 'mouse'); } });
    }
    hook.start(); send('ready');
  } catch (error) { process.parentPort.postMessage({ type: 'error', message: error.message }); }
});
