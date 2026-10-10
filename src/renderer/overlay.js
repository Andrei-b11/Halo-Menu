import { mountRadial, theme, nativeIcon } from './radial.js';
const host = document.querySelector('#menu');
let ring = null, config = null, busy = false, last = null, hovering = false;

const find = (items, id) => { for (const item of items) { if (item.id === id) return item; const kid = item.items && find(item.items, id); if (kid) return kid; } return null; };
// Con un atajo directo de grupo, el anillo muestra ese grupo como si fuera el principal.
// Las acciones ocultas se guardan, pero no salen en el anillo (sus atajos directos siguen
// funcionando). Un grupo que se queda sin nada visible tampoco sale.
const shown = items => items.filter(item => !item.hidden).map(item => item.items ? { ...item, items: shown(item.items) } : item).filter(item => !item.items || item.items.length);
function view(state) {
  const group = state.rootId && find(state.config.items, state.rootId);
  const items = group?.items?.length >= 2 ? group.items : state.config.items, visible = shown(items);
  return { ...state.config, items: visible.length ? visible : items };
}
function open(state, { instant = false } = {}) {
  ring?.destroy();
  last = state; config = state.config; theme(config, state.dark); busy = false;
  ring = mountRadial(host, view(state), { mode: 'live', clips: state.clips, anchor: state.anchor, hold: state.hold, pinned: state.pinned, instant: instant || state.instant, hint: state.notice || (state.pinned ? 'Anillo en vivo' : 'Esc para cerrar'), onChoose: run, onClose: () => window.aptic.hideMenu() });
}
async function run(item) {
  if (busy) return; busy = true;
  // Un instante para que se vea el latido de lo elegido; el proceso principal esconde la ventana.
  const still = config.animation === 'none' || config.duration === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches;
  await new Promise(resolve => setTimeout(resolve, still ? 0 : 70));
  try { await window.aptic.run(item.id); } catch { /* El editor muestra el error con detalle. */ }
}
// Los iconos del sistema se piden antes de que haga falta enseñarlos: así el primer anillo
// no cambia de icono a mitad de la entrada.
const prefetch = items => { for (const item of items || []) { if (item.type !== 'group') nativeIcon(item); prefetch(item.items); } };
window.aptic.state().then(state => prefetch(state.config.items)).catch(() => {});
window.aptic.onOpen(state => open(state));
// Al esconderse, la ventana se vacía y avisa cuando ese fotograma vacío ya está en pantalla:
// es el que se verá primero la próxima vez que se abra, en vez del anillo anterior.
window.aptic.onMenuHidden(() => {
  ring?.destroy(); ring = null; last = null; hovering = false;
  host.replaceChildren();
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!ring) window.aptic.overlayBlank().catch(() => {}); }));
});
// Si cambian los ajustes con el anillo abierto, se redibuja al momento con los nuevos.
window.aptic.onState(state => {
  config = state.config; theme(config, state.dark); if (config.nativeIcons) prefetch(config.items);
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
// Guardar en un espacio desde el anillo: lo seleccionado en el Explorador que estaba delante
// (sin Ctrl + C), o si no, el portapapeles. Con Mayús se guarda en el otro modo: ruta al
// original en vez de copia, o al revés.
async function captureClip(item, extra = {}, flip = false) {
  if (busy) return; busy = true;
  const base = item.fileMode || 'copy', mode = flip ? (base === 'copy' ? 'reference' : 'copy') : base;
  const label = host.querySelector('.ring-label');
  if (label) { label.textContent = 'Guardando…'; host.querySelector('.ring')?.setAttribute('data-label', ''); }
  try {
    const result = await window.aptic.clipboard({ op: 'capture', slot: item.target, from: 'ring', ...extra, mode });
    const c = result?.captured, what = c?.count ? c.count + (c.count === 1 ? ' elemento' : ' elementos') + (mode === 'copy' ? ' · copia fija' : ' · ruta al original') : extra.op === 'files' ? 'Archivos guardados' : 'Texto guardado';
    if (label) { label.textContent = 'Espacio ' + item.target + ' · ' + what; delete label.dataset.text; }
  } catch (error) {
    const label = host.querySelector('.ring-label'); if (label) label.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally { busy = false; }
}
document.addEventListener('contextmenu', e => { e.preventDefault(); const item = pointedClip(e); if (item) captureClip(item, {}, e.shiftKey); else ring?.close(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    const item = pointedClip(e); if (item) { e.preventDefault(); captureClip(item, {}, e.shiftKey); return; }
  }
  if (!busy) ring?.key(e);
});
document.addEventListener('dragover', e => { if (pointedClip(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('drop', e => {
  e.preventDefault(); const item = pointedClip(e); if (!item) return;
  const paths = [...e.dataTransfer.files].map(file => window.aptic.pathFor(file)).filter(Boolean);
  captureClip(item, paths.length ? { op: 'files', paths } : { op: 'text', text: e.dataTransfer.getData('text/plain') }, e.shiftKey);
});
