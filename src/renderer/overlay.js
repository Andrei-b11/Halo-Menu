import { mountRadial, theme } from './radial.js';
const host = document.querySelector('#menu');
let ring = null, config = null, busy = false, last = null, hovering = false;

const find = (items, id) => { for (const item of items) { if (item.id === id) return item; const kid = item.items && find(item.items, id); if (kid) return kid; } return null; };
// Con un atajo directo de grupo, el anillo muestra ese grupo como si fuera el principal.
function view(state) {
  const group = state.rootId && find(state.config.items, state.rootId);
  return group?.items?.length >= 2 ? { ...state.config, items: group.items } : state.config;
}
function open(state, { instant = false } = {}) {
  last = state; config = state.config; theme(config, state.dark); busy = false;
  ring = mountRadial(host, view(state), { mode: 'live', anchor: state.anchor, hold: state.hold, pinned: state.pinned, instant: instant || state.instant, hint: state.notice || (state.pinned ? 'Anillo en vivo' : 'Esc para cerrar'), onChoose: run, onClose: () => window.aptic.hideMenu() });
}
async function run(item) {
  if (busy) return; busy = true;
  // Un instante para que se vea qué se eligió; el proceso principal esconde la ventana.
  await new Promise(resolve => setTimeout(resolve, config.animation === 'none' ? 0 : 90));
  try { await window.aptic.run(item.id); } catch { /* El editor muestra el error con detalle. */ }
}
window.aptic.onOpen(state => open(state));
// Si cambian los ajustes con el anillo abierto, se redibuja al momento con los nuevos.
window.aptic.onState(state => {
  config = state.config; theme(config, state.dark);
  // Solo el anillo en vivo se redibuja: rehacer uno normal mientras se usa le robaría el clic.
  if (last?.pinned && state.pinned && ring && !busy) open({ ...last, config: state.config, dark: state.dark, hold: false }, { instant: true });
});
window.aptic.onPointer(point => ring?.track(point.x, point.y));
window.aptic.onRelease(() => ring?.release());
document.addEventListener('pointermove', e => {
  ring?.track(e.clientX, e.clientY);
  // Fijado, la ventana deja pasar los clics salvo cuando el cursor está sobre el anillo.
  if (last?.pinned) {
    const over = !!e.target.closest?.('.ring button') || (ring && Math.hypot(e.clientX - ring.root.getBoundingClientRect().left, e.clientY - ring.root.getBoundingClientRect().top) < 40);
    if (over !== hovering) { hovering = over; window.aptic.overlayHover(over); }
  }
});
document.addEventListener('click', e => { if (!e.target.closest('button')) ring?.backgroundClick(e.clientX, e.clientY); });
document.addEventListener('contextmenu', e => { e.preventDefault(); ring?.close(); });
document.addEventListener('keydown', e => { ring?.key(e); });
