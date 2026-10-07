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
  ring?.destroy();
  last = state; config = state.config; theme(config, state.dark); busy = false;
  ring = mountRadial(host, view(state), { mode: 'live', clips: state.clips, anchor: state.anchor, hold: state.hold, pinned: state.pinned, instant: instant || state.instant, hint: state.notice || (state.pinned ? 'Anillo en vivo' : 'Esc para cerrar'), onChoose: run, onClose: () => window.aptic.hideMenu() });
}
async function run(item) {
  if (busy) return; busy = true;
  // Un instante para que se vea qué se eligió; el proceso principal esconde la ventana.
  await new Promise(resolve => setTimeout(resolve, config.animation === 'none' ? 0 : Math.min(config.response ?? 70, 45)));
  try { await window.aptic.run(item.id); } catch { /* El editor muestra el error con detalle. */ }
}
window.aptic.onOpen(state => open(state));
window.aptic.onMenuHidden(() => { ring?.destroy(); ring = null; last = null; hovering = false; });
// Si cambian los ajustes con el anillo abierto, se redibuja al momento con los nuevos.
window.aptic.onState(state => {
  config = state.config; theme(config, state.dark);
  // Solo el anillo en vivo se redibuja: rehacer uno normal mientras se usa le robaría el clic.
  if (last?.pinned && state.pinned && ring && !busy) open({ ...last, clips: state.clips, config: state.config, dark: state.dark, hold: false }, { instant: true });
});
window.aptic.onPointer(point => ring?.queueTrack(point.x, point.y));
window.aptic.onRelease(() => { if (!busy) ring?.release(); });
document.addEventListener('pointermove', e => {
  ring?.queueTrack(e.clientX, e.clientY);
  // Fijado, la ventana deja pasar los clics salvo cuando el cursor está sobre el anillo.
  if (last?.pinned) {
    const over = !!e.target.closest?.('.ring button') || (ring && Math.hypot(e.clientX - ring.root.getBoundingClientRect().left, e.clientY - ring.root.getBoundingClientRect().top) < 40);
    if (over !== hovering) { hovering = over; window.aptic.overlayHover(over); }
  }
});
document.addEventListener('click', e => { if (!e.target.closest('button')) ring?.backgroundClick(e.clientX, e.clientY); });
document.addEventListener('pointerleave', () => ring?.clearAim());
let lastWheel = 0;
document.addEventListener('wheel', e => {
  if (!config?.wheelNavigation || busy || !e.deltaY) return;
  e.preventDefault();
  if (performance.now() - lastWheel < 90) return;
  lastWheel = performance.now(); ring?.move(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
function pointedClip(e) {
  const button = e.target.closest?.('[data-id]');
  const item = button ? find(config?.items || [], button.dataset.id) : ring?.aimedItem;
  return item?.type === 'clipboard' ? item : null;
}
async function captureClip(item, extra = {}) {
  if (busy) return; busy = true;
  try {
    await window.aptic.clipboard({ op: 'capture', slot: item.target, mode: item.fileMode || 'copy', ...extra });
    const label = host.querySelector('.ring-label'); if (label) label.textContent = 'Guardado en el espacio ' + item.target;
  } catch (error) {
    const label = host.querySelector('.ring-label'); if (label) label.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally { busy = false; }
}
document.addEventListener('contextmenu', e => { e.preventDefault(); const item = pointedClip(e); if (item) captureClip(item); else ring?.close(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    const item = pointedClip(e); if (item) { e.preventDefault(); captureClip(item); return; }
  }
  if (!busy) ring?.key(e);
});
document.addEventListener('dragover', e => { if (pointedClip(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('drop', e => {
  e.preventDefault(); const item = pointedClip(e); if (!item) return;
  const paths = [...e.dataTransfer.files].map(file => window.aptic.pathFor(file)).filter(Boolean);
  captureClip(item, paths.length ? { op: 'files', paths } : { op: 'text', text: e.dataTransfer.getData('text/plain') });
});
