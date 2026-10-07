const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { DoubleTap } = require('../src/main/config.cjs');
function detector(mode) {
  const hook = new EventEmitter(), port = new EventEmitter(), messages = []; let now = 0;
  hook.start = () => {}; port.postMessage = message => messages.push(message);
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/main/native-hook.cjs'), 'utf8'), {
    process: { parentPort: port, platform: 'win32' }, performance: { now: () => now },
    require: name => name === './config.cjs' ? { DoubleTap } : { uIOhook: hook, UiohookKey: {} }
  });
  port.emit('message', { data: { mouse: 'back', mouseMode: mode, interval: 300 } });
  return { emit: (name, time, button = 4) => { now = time; hook.emit(name, { button }); }, events: () => messages.filter(m => m.source === 'mouse').map(m => m.type) };
}
test('mouse hold emits a single down and release; other buttons do not activate', () => {
  const d = detector('hold'); d.emit('mousedown', 0, 3); d.emit('mouseup', 1, 3); d.emit('mousedown', 10); d.emit('mousedown', 20); d.emit('mouseup', 40);
  assert.deepEqual(d.events(), ['down', 'up']);
});
test('mouse single click opens once and release does not choose an action', () => {
  const d = detector('single'); d.emit('mousedown', 10); d.emit('mousedown', 20); d.emit('mouseup', 40);
  assert.deepEqual(d.events(), ['trigger']);
});
test('mouse double click requires two releases within the configured interval', () => {
  const d = detector('double'); d.emit('mousedown', 10); d.emit('mouseup', 40); d.emit('mousedown', 500); d.emit('mouseup', 550);
  assert.deepEqual(d.events(), []); d.emit('mousedown', 600); d.emit('mouseup', 650); assert.deepEqual(d.events(), ['trigger']);
});
