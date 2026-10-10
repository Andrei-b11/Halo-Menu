// El anillo de HALO. Nace del menú radial de LINDE: abrir, apuntar y elegir son un solo
// gesto. No hace falta llegar hasta el círculo: basta con empujar el cursor hacia él, y todo
// el sector se ilumina. Al soltar el gesto (o con un clic en cualquier punto del sector) se
// elige. Un grupo abre un arco alrededor de su sector, y un subgrupo, otro arco más afuera.
//
// El mismo módulo dibuja el menú real (modo «live») y las vistas previas del editor (modo
// «preview»), así que lo que se ve al configurar es exactamente lo que aparecerá.
//
// Movimiento: cada círculo tiene su sitio en --x/--y y todo lo que se mueve lo hace con
// transform y opacity, que el compositor anima sin pasar por el hilo principal. Las curvas
// no son cubic-bezier aproximadas: un muelle amortiguado se resuelve de forma exacta y se
// muestrea en fotogramas clave, así que la espiral describe de verdad una espiral y rebasa
// su sitio lo justo antes de asentarse, aunque el sistema esté ocupado abriendo la ventana.
import { icon } from './icons.js';
const geometry = globalThis.apticGeometry;
const DRAG = 14, REACH_PAD = 70, LABEL_GAP = 12, ARC_MARGIN = 22;
const compass = (dx, dy) => ((Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360 + 360) % 360;
const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const norm = a => ((a % 360) + 360) % 360;
const rad = deg => deg * Math.PI / 180;
const polar = (deg, r) => [Math.cos(rad(deg)) * r, Math.sin(rad(deg)) * r];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const px = n => Math.round(n * 100) / 100 + 'px';

// --- Curvas -------------------------------------------------------------------------------
// x(t) = 1 − e^(−ζωt)·(cos ω_d·t + ζ/√(1−ζ²)·sen ω_d·t), con ω elegida para que el muelle
// quede quieto justo en t = 1: así la duración configurada es la de verdad.
function springCurve(zeta) {
  const w = 6.2 / zeta, wd = w * Math.sqrt(1 - zeta * zeta), k = zeta / Math.sqrt(1 - zeta * zeta);
  return t => t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + k * Math.sin(wd * t));
}
const CURVES = { spring: springCurve(.64), bouncy: springCurve(.42), soft: springCurve(.82), smooth: t => 1 - Math.pow(1 - t, 4), linear: t => t };
const outCubic = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const inCurve = t => t * t;
// Una curva como función de easing de CSS: `linear(0, 0.08, …, 1)`.
const easeCache = new Map();
export function easing(name) {
  if (!easeCache.has(name)) { const f = CURVES[name] || CURVES.smooth; easeCache.set(name, 'linear(' + Array.from({ length: 41 }, (_, i) => f(i / 40).toFixed(4)).join(',') + ')'); }
  return easeCache.get(name);
}

// Cómo llega cada círculo según la animación elegida: desde qué fracción del radio, con
// cuánto giro extra, a qué escala y con qué escalonado respecto a «Secuencia de apertura».
const MOTION = {
  spiral: { r: 0, sweep: -75, scale: .35, stagger: 1 },
  expand: { r: 0, sweep: 0, scale: .35, stagger: 1 },
  bloom: { r: 1, sweep: 0, scale: 0, stagger: 1.8 },
  cascade: { r: 0, sweep: 0, scale: .35, stagger: 3.2 },
  pop: { r: 1, sweep: 0, scale: 0, stagger: .7, curve: 'bouncy' },
  orbit: { r: 1, sweep: -200, scale: .6, stagger: 0 },
  drop: { r: 1, sweep: 0, scale: .9, dy: -38, stagger: 1.2 },
  zoom: { r: 1.45, sweep: 0, scale: 1.25, stagger: 1, curve: 'smooth' },
  fade: { r: 1, sweep: 0, scale: .94, stagger: 0, curve: 'smooth' }
};
// Un viaje en coordenadas polares: el ángulo llega con una curva suave y el radio y la
// escala con la del movimiento, de modo que el círculo sigue un arco y no una recta.
function travel({ a0, r0, a1, r1, s0 = 1, s1 = 1, dy0 = 0, o0 = 0 }, curve, frames = 16) {
  const out = [];
  for (let k = 0; k <= frames; k++) {
    const t = k / frames, p = k === frames ? 1 : curve(t), s = outCubic(t);
    const [x, y] = polar(a0 + (a1 - a0) * s, r0 + (r1 - r0) * p);
    out.push({ offset: t, translate: px(x) + ' ' + px(y + dy0 * (1 - p)), transform: `scale(${Math.max(0, s0 + (s1 - s0) * p).toFixed(3)})`, opacity: k === frames ? 1 : +(o0 + (1 - o0) * outCubic(t / .42)).toFixed(3) });
  }
  return out;
}

export function theme(config, dark) {
  document.body.dataset.theme = config.theme === 'system' ? (dark ? 'carbon' : 'light') : config.theme;
  document.documentElement.style.setProperty('--accent', config.accent);
}

// Iconos del sistema: se guardan las respuestas para que redibujar no parpadee.
const nativeCache = new Map();
export function nativeIcon(item) {
  if (!['system', 'path'].includes(item.type) || !item.target) return null;
  const key = item.type + '|' + item.target;
  if (!nativeCache.has(key)) {
    const entry = { value: undefined };
    entry.promise = window.aptic.icon({ type: item.type, target: item.target }).then(v => (entry.value = v || null)).catch(() => (entry.value = null));
    nativeCache.set(key, entry);
  }
  return nativeCache.get(key);
}
const picture = src => { const img = new Image(); img.alt = ''; img.draggable = false; img.decoding = 'sync'; img.src = src; return img; };
// Pinta en `el` lo que corresponde a la acción: imagen propia, icono del sistema o dibujo.
export function paintGlyph(el, item, config) {
  if (item.image) { el.replaceChildren(picture(item.image)); return; }
  el.innerHTML = icon(item.icon, config.iconStyle);
  if (!config.nativeIcons || item.type === 'group') return;
  const entry = nativeIcon(item); if (!entry) return;
  const show = data => { if (data) el.replaceChildren(picture(data)); };
  if (entry.value !== undefined) show(entry.value); else entry.promise.then(data => { if (el.isConnected) show(data); });
}

// Ruta de identificadores desde el anillo hasta una acción: ['edit', 'more', 'paste'].
export function pathTo(items, id, trail = []) {
  for (const item of items) {
    if (item.id === id) return [...trail, item.id];
    if (item.items) { const found = pathTo(item.items, id, [...trail, item.id]); if (found) return found; }
  }
  return null;
}

export function mountRadial(host, config, options = {}) {
  const live = options.mode === 'live';
  const hint = options.hint || '';
  const main = geometry.ring(config);
  const size = config.size, ringR = main.radius;
  const center = config.labels === 'center';
  const hubSize = center ? Math.round(Math.max(56, Math.min(150, ringR * 2 - size - 30))) : config.hubSize;
  const reachR = geometry.reach(config);
  const tagRoom = config.labels === 'always' ? 30 : 0;
  const zoom = options.zoom || 1;
  const anim = reduced() ? 'none' : config.animation;
  const d = anim === 'none' ? 0 : config.duration;
  const motion = () => d > 0 && !reduced();
  const curveName = m => config.easing === 'linear' ? 'linear' : config.easing === 'smooth' ? 'smooth' : (m?.curve || 'spring');
  const springy = name => name === 'spring' || name === 'bouncy';

  host.replaceChildren();
  const root = document.createElement('div');
  root.className = 'ring';
  Object.assign(root.dataset, { style: config.style, shape: config.shape, animation: anim, labels: config.labels, hub: config.hub, mode: live ? 'live' : 'preview' });
  if (config.pointer) root.dataset.pointer = '';
  if (!config.itemBorder) root.dataset.borderless = '';
  if (options.pinned) root.dataset.pinned = '';
  const set = (k, v) => root.style.setProperty(k, v);
  set('--n', config.items.length); set('--ring-r', ringR + 'px'); set('--size', size + 'px'); set('--hub', hubSize + 'px');
  set('--icon', Math.round(size * config.iconScale / 100) + 'px'); set('--d', config.duration + 'ms');
  set('--opacity', config.opacity + '%'); set('--veil', config.veil + '%'); set('--shadow', (config.shadow / 100).toFixed(2));
  set('--label-size', config.labelSize + 'px'); set('--step', main.step + 'deg'); set('--rot', config.rotation + 'deg');
  set('--aim-scale', (config.aimScale / 100).toFixed(2));
  set('--response', (config.response ?? 70) + 'ms'); set('--stagger', (config.stagger ?? 50) / 1000);
  set('--border-width', (config.borderWidth ?? 1) + 'px'); set('--roundness', (config.roundness ?? 31) + '%');
  set('--dwell', (config.dwellDelay ?? 750) + 'ms');
  root.dataset.easing = config.easing || 'spring';
  if (config.customRingColors) {
    set('--bg', config.ringBackground); set('--panel', config.ringBackground); set('--surface', config.ringBackground);
    set('--text', config.ringForeground); set('--muted', `color-mix(in srgb,${config.ringForeground} 65%,${config.ringBackground})`);
    set('--accent', config.ringAccent); set('--line', `color-mix(in srgb,${config.ringForeground} 16%,transparent)`);
  }
  set('--sub', geometry.sizeAt(size, 1) + 'px'); set('--sub-icon', Math.round(geometry.sizeAt(size, 1) * config.iconScale / 100) + 'px');
  if (zoom !== 1) root.style.scale = zoom;

  // Dónde nace: en el punto pedido, metido hacia dentro si no cabe entero.
  let cx = 0, cy = 0;
  function place() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    const a = options.anchor || { x: w / 2, y: h / 2 };
    const pad = reachR + 10;
    cx = live ? Math.max(Math.min(pad, w / 2), Math.min(a.x, w - Math.min(pad, w / 2))) : a.x;
    cy = live ? Math.max(Math.min(pad, h / 2), Math.min(a.y, h - Math.min(pad, h / 2))) : a.y;
    set('--cx', cx + 'px'); set('--cy', cy + 'px');
  }
  place();

  const layer = cls => { const el = document.createElement('div'); el.className = cls; el.setAttribute('aria-hidden', 'true'); return el; };
  const disc = layer('ring-disc'), lane = layer('ring-track'), pointer = layer('ring-pointer');
  const hub = document.createElement('button');
  hub.type = 'button'; hub.className = 'ring-hub'; hub.setAttribute('aria-label', live ? 'Cerrar' : 'Repetir animación'); hub.title = live ? 'Cerrar (Esc)' : 'Repetir animación';
  const notch = layer('ring-notch');
  const hubGlyph = document.createElement('span'); hubGlyph.className = 'ring-hub-glyph';
  hubGlyph.innerHTML = config.hub === 'logo' ? icon('ring') : config.hub === 'dot' ? '<i></i>' : icon('close');
  const hubText = document.createElement('span'); hubText.className = 'ring-hub-text'; hubText.textContent = hint;
  hub.append(notch, hubGlyph, hubText);
  // La X siempre cierra el anillo entero, aunque haya un grupo abierto (volver atrás es Esc o Retroceso).
  hub.onclick = e => { e.stopPropagation(); close(); };
  const label = document.createElement('div'); label.className = 'ring-label'; label.setAttribute('aria-live', 'polite');
  root.append(disc, lane, pointer);

  const petal = (item, i, cls, level, deg, radius) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.style.setProperty('--i', i); b.dataset.level = level;
    b.setAttribute('role', 'menuitem'); b.setAttribute('aria-label', item.label); b.dataset.id = item.id;
    if (options.editable) b.title = item.label + (item.note ? ' — ' + item.note : '') + (item.hidden ? ' · Oculta en el anillo' : '') + ' · Arrastra para mover, agrupar o guardar en la biblioteca';
    if (item.hidden) b.dataset.hidden = '';
    if (item.type === 'clipboard') {
      b.title = options.clips?.[item.target]?.preview || 'Espacio vacío · guarda contenido desde el editor';
      const badge = document.createElement('small'); badge.className = 'clip-badge'; badge.textContent = item.target; b.append(badge);
    }
    if (item.type === 'group') { b.dataset.more = ''; b.setAttribute('aria-haspopup', 'menu'); }
    if (item.color) { b.dataset.tint = ''; b.style.setProperty('--tint', item.color); }
    const g = document.createElement('span'); g.className = 'ring-glyph';
    paintGlyph(g, item, config);
    b.append(g);
    if (config.labels === 'always') { const tag = document.createElement('span'); tag.className = 'ring-tag'; tag.textContent = item.label; b.append(tag); }
    seat(b, deg, radius);
    return b;
  };
  // Su sitio: el ángulo se guarda en --a (grados) y la posición ya resuelta en --x/--y.
  function seat(b, deg, radius) {
    const [x, y] = polar(deg, radius);
    b.style.setProperty('--a', deg + 'deg'); b.style.setProperty('--x', px(x)); b.style.setProperty('--y', px(y));
    b._seat = { deg, radius, x, y };
  }

  // Niveles abiertos: el anillo (0) y, encima, los arcos de grupos y subgrupos.
  const levels = [];
  {
    const angles = config.items.map((_, i) => -90 + config.rotation + main.step * i);
    const buttons = config.items.map((item, i) => {
      const b = petal(item, i, 'ring-opt', 0, angles[i], ringR);
      b.onclick = e => { e.stopPropagation(); choose(0, i); };
      b.onfocus = () => setAim({ level: 0, i }, false);
      root.append(b); return b;
    });
    levels.push({ items: config.items, angles, buttons, radius: ringR, size, step: main.step, spread: 360, base: 0, el: null, open: null, parentId: null });
  }
  root.append(hub, label);
  root.setAttribute('role', 'menu'); root.setAttribute('aria-label', 'Acciones rápidas');
  host.append(root);

  let aim = null, moved = false, closed = false, pointerAngle = null, dwellTimer = null, trackFrame = null, pendingPoint = null;
  let holding = !!options.hold, start = null, quiet = !!options.instant;

  // --- Entrada ------------------------------------------------------------------------------
  const running = new Set();
  function play(el, frames, timing) {
    const a = el.animate(frames, { fill: 'backwards', ...timing });
    running.add(a); a.finished.then(() => running.delete(a), () => running.delete(a));
    return a;
  }
  function stopAll() { for (const a of running) a.cancel(); running.clear(); }
  function entrance() {
    stopAll();
    if (!motion()) return 0;
    const m = MOTION[anim] || MOTION.spiral, curve = curveName(m), f = CURVES[curve];
    const length = Math.round(d * (springy(curve) ? 1.35 : 1));
    const each = d * (config.stagger ?? 50) / 1000 * m.stagger;
    let last = 0;
    levels[0].buttons.forEach((b, i) => {
      const { deg, radius } = b._seat, delay = i * each;
      play(b, travel({ a0: deg + m.sweep, r0: radius * m.r, a1: deg, r1: radius, s0: m.scale, dy0: m.dy || 0 }, f), { duration: length, delay, easing: 'linear' });
      last = Math.max(last, delay + length);
    });
    play(hub, [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: Math.round(d * 1.2), easing: easing(config.easing === 'spring' ? 'spring' : curve) });
    play(hubGlyph, [{ rotate: '-90deg' }, { rotate: '0deg' }], { duration: Math.round(d * 1.2), easing: easing(config.easing === 'spring' ? 'bouncy' : curve) });
    play(disc, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: Math.round(d * 1.1), easing: easing('smooth') });
    play(lane, [{ transform: 'scale(.45) rotate(-40deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: Math.round(d * 1.15), easing: easing(springy(curve) ? 'soft' : curve) });
    return last;
  }

  // Cierra los niveles por encima de `keep` (el anillo es el nivel 0).
  function truncate(keep) {
    while (levels.length > keep + 1) retire(levels.pop());
    const top = levels[keep]; if (top.open !== null) { top.buttons[top.open]?.classList.remove('open'); top.open = null; }
    if (levels.length === 1) root.removeAttribute('data-arc');
    if (aim && aim.level > keep) setAim(null, false);
  }
  // Un arco que se cierra vuelve a su círculo antes de irse; mientras tanto ya no se toca.
  function retire(lv) {
    const el = lv.el; el.classList.add('retiring'); el.setAttribute('aria-hidden', 'true'); el.inert = true;
    if (!motion() || quiet) { el.remove(); return; }
    const time = Math.round(Math.min(170, Math.max(100, d * .45)));
    lv.buttons.forEach((b, j) => {
      const now = getComputedStyle(b), [x, y] = polar(lv.base, lv.fromR);
      const from = { translate: now.translate, transform: now.transform, opacity: now.opacity };
      b.getAnimations().forEach(a => a.cancel());
      b.animate([from, { translate: px(x) + ' ' + px(y), transform: 'scale(.3)', opacity: 0 }], { duration: time, delay: (lv.buttons.length - 1 - j) * 6, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
    });
    lv.band?.animate([{ opacity: 1 }, { opacity: 0, transform: `scale(${(lv.fromR / lv.radius).toFixed(3)})` }], { duration: time, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => el.remove(), time + lv.buttons.length * 6 + 20);
  }
  // La banda del arco: una pista curva tenue detrás de sus círculos, que sale del grupo.
  function band(a, base, sub) {
    const svgNS = 'http://www.w3.org/2000/svg', pad = Math.asin(Math.min(1, (sub / 2 + 5) / a.radius)) * 180 / Math.PI;
    const from = base - a.spread / 2 - pad, to = base + a.spread / 2 + pad, [x0, y0] = polar(from, a.radius), [x1, y1] = polar(to, a.radius);
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'ring-band'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)}A${a.radius} ${a.radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`);
    path.style.strokeWidth = sub + 14 + 'px';
    svg.append(path); return svg;
  }
  function openGroupAt(level, i) {
    const parent = levels[level];
    if (parent.open === i && levels.length > level + 1) return;
    const item = parent.items[i], kids = item.items || [];
    truncate(level);
    if (!kids.length) return;
    parent.open = i; parent.buttons[i].classList.add('open');
    const depth = level + 1, a = geometry.arc(config, kids.length, parent.radius, depth), base = parent.angles[i];
    root.dataset.arc = '';
    const el = document.createElement('div'); el.className = 'ring-arc'; el.dataset.level = depth; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', item.label);
    el.style.setProperty('--arc-r', a.radius + 'px'); el.style.setProperty('--from-r', parent.radius + 'px'); el.style.setProperty('--n', kids.length);
    el.style.setProperty('--sub', a.sub + 'px'); el.style.setProperty('--sub-icon', Math.round(a.sub * config.iconScale / 100) + 'px');
    const strip = band(a, base, a.sub); el.append(strip);
    const angles = kids.map((_, j) => base - a.spread / 2 + a.step * j);
    const buttons = kids.map((kid, j) => {
      const b = petal(kid, j, 'ring-sub', depth, angles[j], a.radius);
      b.onclick = e => { e.stopPropagation(); choose(depth, j); };
      b.onfocus = () => setAim({ level: depth, i: j }, false);
      el.append(b); return b;
    });
    levels.push({ items: kids, angles, buttons, radius: a.radius, fromR: parent.radius, size: a.sub, step: a.step, spread: a.spread, base, el, band: strip, open: null, parentId: item.id });
    root.insertBefore(el, hub);
    el.dataset.open = '';
    placeLabel();
    if (!motion() || quiet) return;
    // Brota del círculo que lo abre: cada círculo sale de su sector y se abre en abanico.
    // En «Halo» los subcírculos saltan desde el grupo con un rebote más vivo.
    const halo = config.style === 'halo', curve = halo && springy(curveName()) ? 'bouncy' : curveName(), f = CURVES[curve], time = Math.round(Math.min(d, 360) * (springy(curve) ? 1.3 : .9));
    strip.animate([{ transform: `scale(${(parent.radius / a.radius).toFixed(3)})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: time, easing: easing('smooth'), fill: 'backwards' });
    buttons.forEach((b, j) => b.animate(travel({ a0: base, r0: parent.radius, a1: angles[j], r1: a.radius, s0: halo ? 0 : .3 }, f, 14), { duration: time, delay: j * Math.min(halo ? 30 : 22, d * .06), easing: 'linear', fill: 'backwards' }));
  }

  // La etiqueta nunca pisa un círculo: se mide el que más baja y se coloca debajo; si ahí no
  // cabe en la ventana, se sube por encima del que más sube.
  function placeLabel() {
    let low = -Infinity, high = Infinity;
    for (const lv of levels) lv.angles.forEach(deg => { const y = Math.sin(rad(deg)) * lv.radius, s = lv.size + tagRoom; low = Math.max(low, y + s / 2); high = Math.min(high, y - s / 2); });
    const height = label.offsetHeight || 26, width = label.offsetWidth || 0;
    const room = host.clientHeight || innerHeight;
    const below = !live || cy + low + LABEL_GAP + height <= room - 8;
    set('--label-y', (below ? low + LABEL_GAP + height / 2 : high - LABEL_GAP - height / 2) + 'px');
    const W = host.clientWidth || innerWidth;
    const nudge = live ? Math.max(10 + width / 2 - cx, 0) + Math.min(W - 10 - width / 2 - cx, 0) : 0;
    set('--label-x', Math.round(nudge) + 'px');
  }
  // El texto nuevo entra con un pequeño deslizamiento, sin parpadear.
  function relabel(el, text, sub = '') {
    if (el.dataset.text === text + '|' + sub) return;
    el.dataset.text = text + '|' + sub;
    if (sub) { const b = document.createElement('b'), small = document.createElement('small'); b.textContent = text; small.textContent = sub; el.replaceChildren(b, small); }
    else el.textContent = text;
    if (motion() && !quiet) el.animate([{ opacity: .35, translate: '0 3px' }, { opacity: 1, translate: '0 0' }], { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  const itemAt = a => a && levels[a.level] ? levels[a.level].items[a.i] : null;
  function setAim(next, cancel) {
    if (cancel) root.dataset.cancel = ''; else root.removeAttribute('data-cancel');
    if ((!next && !aim) || (next && aim && next.level === aim.level && next.i === aim.i)) return;
    clearTimeout(dwellTimer); root.querySelector('.dwelling')?.classList.remove('dwelling');
    aim = next || null;
    levels.forEach((lv, l) => lv.buttons.forEach((b, i) => b.classList.toggle('aim', !!aim && aim.level === l && aim.i === i)));
    const item = itemAt(aim);
    if (aim && item) {
      // El indicador gira por el camino corto: de 350° a 10° son veinte grados, no trescientos cuarenta.
      const lv = levels[aim.level], target = lv.angles[aim.i];
      const first = pointerAngle == null;
      pointerAngle = first ? target : pointerAngle + ((norm(target - pointerAngle) + 540) % 360 - 180);
      if (first || !root.dataset.aiming) { pointer.style.transition = notch.style.transition = 'none'; requestAnimationFrame(() => { pointer.style.transition = notch.style.transition = ''; }); }
      pointer.style.rotate = notch.style.rotate = (pointerAngle + 90) + 'deg';
      set('--aim', pointerAngle + 'deg'); set('--aim-step', (aim.level ? Math.max(lv.step, 18) : main.step) + 'deg');
      set('--aim-r', lv.radius + 'px'); set('--aim-size', lv.size + 'px');
      root.dataset.aiming = aim.level ? 'sub' : 'opt';
      const saved = item.type === 'clipboard' ? options.clips?.[item.target] : null;
      relabel(label, item.type === 'clipboard' ? item.label + ' · ' + (saved ? saved.preview.slice(0, 60) : 'Vacío') : item.label, item.note || '');
      relabel(hubText, item.label); root.dataset.label = ''; placeLabel();
    } else { root.removeAttribute('data-aiming'); root.removeAttribute('data-label'); hubText.textContent = hint; delete hubText.dataset.text; }
    options.onAim?.(item);
    if (live && config.selectionMode === 'dwell' && aim && item && item.type !== 'group' && !holding && !options.pinned) {
      const target = { ...aim }; levels[aim.level].buttons[aim.i].classList.add('dwelling');
      dwellTimer = setTimeout(() => { if (!closed && aim?.level === target.level && aim?.i === target.i) choose(target.level, target.i); }, config.dwellDelay);
    }
  }
  const nearestIn = (lv, ang) => { let best = 0, bestD = Infinity; lv.angles.forEach((deg, i) => { const dd = apart(ang, norm(deg + 90)); if (dd < bestD) { bestD = dd; best = i; } }); return best; };
  function locate(x, y) {
    const rect = root.getBoundingClientRect();
    return { dx: (x - rect.left) / zoom, dy: (y - rect.top) / zoom };
  }
  function track(x, y) {
    if (closed) return;
    const { dx, dy } = locate(x, y), dist = Math.hypot(dx, dy);
    if (!start) start = { dx, dy };
    if (Math.hypot(dx - start.dx, dy - start.dy) > DRAG) moved = true;
    if (dist < hubSize / 2) return setAim(null, true);
    if (config.selectionMode === 'precise') {
      for (let l = levels.length - 1; l >= 0; l--) {
        const lv = levels[l];
        const i = lv.angles.findIndex(deg => Math.hypot(dx - Math.cos(rad(deg)) * lv.radius, dy - Math.sin(rad(deg)) * lv.radius) <= lv.size * config.aimScale / 200);
        if (i >= 0) { if (live && lv.items[i].type === 'group') openGroupAt(l, i); return setAim({ level: l, i }, false); }
      }
      return setAim(null, false);
    }
    const top = levels[levels.length - 1];
    if (dist > top.radius + top.size / 2 + REACH_PAD) return setAim(null, false);
    const ang = compass(dx, dy);
    // Del arco más externo hacia dentro: manda el nivel en cuya franja está el cursor. Sin
    // este margen, al salir hacia fuera se cruzan sectores vecinos y el objetivo saltaría.
    for (let l = levels.length - 1; l >= 1; l--) {
      const lv = levels[l], inner = levels[l - 1];
      const strip = (inner.radius + inner.size / 2 + lv.radius - lv.size / 2) / 2;
      if (dist >= strip && apart(ang, norm(lv.base + 90)) <= lv.spread / 2 + ARC_MARGIN) {
        const i = nearestIn(lv, ang);
        if ((live || options.hoverArcs) && lv.items[i].type === 'group') openGroupAt(l, i);
        else if (levels.length > l + 1 && dist < lv.radius + lv.size / 2 + 6) truncate(l);
        return setAim({ level: l, i }, false);
      }
    }
    const i = nearestIn(levels[0], ang);
    if (live || options.hoverArcs) { if (config.items[i].type === 'group') openGroupAt(0, i); else if (dist < ringR + size / 2 + 6) truncate(0); }
    setAim({ level: 0, i }, false);
  }

  // Lo elegido late una vez y lo demás se aparta: se lee qué pasó sin esperar a nada.
  function flash(item) {
    root.dataset.chosen = '';
    levels.forEach(lv => lv.buttons.forEach(b => {
      const mine = b.dataset.id === item.id; b.classList.toggle('chosen', mine);
      if (!motion()) return;
      if (mine) b.animate([{ scale: getComputedStyle(b).scale === 'none' ? '1' : getComputedStyle(b).scale }, { scale: 1.26, offset: .4 }, { scale: 1.16 }], { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      else b.animate([{ opacity: getComputedStyle(b).opacity }, { opacity: .16 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
    }));
  }
  function choose(level, i) {
    if (closed || !levels[level]) return;
    pendingPoint = null; cancelAnimationFrame(trackFrame); trackFrame = null;
    clearTimeout(dwellTimer); root.querySelector('.dwelling')?.classList.remove('dwelling');
    const item = levels[level].items[i];
    if (!item) return;
    if (item.type === 'group') {
      openGroupAt(level, i); options.onSelect?.(item);
      if (live) requestAnimationFrame(() => levels[level + 1]?.buttons[0]?.focus({ preventScroll: true }));
      return;
    }
    if (!live) { options.onSelect?.(item); setAim({ level, i }, false); return; }
    flash(item);
    options.onChoose?.(item);
  }

  // Soltar el gesto: si se apuntó, se elige; si se volvió al centro, se cancela; si ni siquiera
  // se movió, el anillo se queda abierto y funciona a clics.
  function release() {
    flushTrack();
    if (!holding || closed) return;
    holding = false;
    if (!moved) return;
    if (!aim) return close();
    choose(aim.level, aim.i);
  }

  function back() {
    if (levels.length < 2) return false;
    const parent = levels[levels.length - 2], at = parent.open;
    truncate(levels.length - 2); setAim(null, false);
    parent.buttons[at]?.focus({ preventScroll: true });
    return true;
  }

  // Cerrar es abrir del revés y más deprisa: todo se recoge hacia el centro —el último en
  // salir es el primero en volver— y el anillo ya no se puede tocar mientras dura.
  function collapse() {
    if (!motion()) return 0;
    const time = Math.round(Math.min(230, Math.max(110, d * .6))), inPlace = ['bloom', 'fade', 'pop'].includes(anim);
    let last = 0;
    levels.forEach((lv, l) => lv.buttons.forEach((b, i) => {
      const now = getComputedStyle(b), from = { translate: now.translate, transform: now.transform, opacity: now.opacity };
      b.getAnimations().forEach(a => a.cancel());
      const [x, y] = l ? polar(lv.base, lv.fromR) : inPlace ? [b._seat.x, b._seat.y] : polar(b._seat.deg + 40, b._seat.radius * .12);
      const delay = (lv.buttons.length - 1 - i) * 7;
      b.animate([from, { translate: px(x) + ' ' + px(y), transform: `scale(${inPlace ? .7 : .3})`, opacity: 0 }], { duration: time, delay, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
      last = Math.max(last, time + delay);
    }));
    const out = (el, to, extra = 0) => { el.getAnimations().forEach(a => a.cancel()); el.animate([{}, to], { duration: time, delay: extra, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' }); };
    out(hub, { transform: 'scale(.4)', opacity: 0 }, Math.min(60, config.items.length * 7));
    out(hubGlyph, { rotate: '90deg' });
    out(disc, { transform: 'scale(.2)', opacity: 0 });
    out(lane, { transform: 'scale(.3) rotate(40deg)', opacity: 0 });
    levels.forEach(lv => lv.band && out(lv.band, { opacity: 0 }));
    return last + 10;
  }
  function close() {
    clearTimeout(dwellTimer); cancelAnimationFrame(trackFrame); pendingPoint = null;
    // Si ya se estaba cerrando y la ventana sigue ahí, se pide esconderla otra vez: nunca se queda atascado.
    if (closed) { if (live) options.onClose?.(); return Promise.resolve(); }
    if (!live) { replay(); options.onClose?.(); return Promise.resolve(); }
    closed = true; stopAll();
    root.dataset.closing = ''; root.removeAttribute('data-open');
    const wait = collapse();
    return new Promise(resolve => setTimeout(() => { options.onClose?.(); resolve(); }, wait));
  }

  let readyTimer = 0;
  function settle(after) { root.classList.remove('settled'); clearTimeout(readyTimer); readyTimer = setTimeout(() => root.classList.add('settled'), after); }
  function replay() {
    truncate(0); setAim(null, false);
    root.removeAttribute('data-closing'); root.removeAttribute('data-chosen');
    levels[0].buttons.forEach(b => { b.classList.remove('chosen'); b.getAnimations().forEach(a => a.cancel()); });
    root.dataset.open = '';
    settle(entrance());
  }

  function move(delta) {
    pendingPoint = null;
    const level = Number(document.activeElement?.dataset?.level ?? levels.length - 1);
    const list = (levels[level] || levels[0]).buttons;
    const focused = list.indexOf(document.activeElement), index = focused < 0 ? (aim?.level === level ? aim.i : delta > 0 ? -1 : 0) : focused;
    list[(index + delta + list.length) % list.length].focus({ preventScroll: true });
  }
  function key(e) {
    if (closed) return false;
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      if (!back() && e.key === 'Escape') close();
      return true;
    }
    if (['ArrowRight', 'ArrowDown'].includes(e.key) || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(1); return true; }
    if (['ArrowLeft', 'ArrowUp'].includes(e.key) || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); move(-1); return true; }
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1, l = levels.length - 1;
      if (levels[l].items[n]) choose(l, n);
      return true;
    }
    return false;
  }
  // Un clic en cualquier punto del sector elige lo apuntado: el blanco es el sector entero.
  function backgroundClick(x, y) {
    if (closed) return;
    track(x, y);
    if (!aim) { if (live && !options.pinned) close(); return; }
    choose(aim.level, aim.i);
  }
  // Both the native cursor stream and DOM events share one update per frame.
  function flushTrack() {
    if (!pendingPoint) return;
    const point = pendingPoint; pendingPoint = null; track(point.x, point.y);
  }
  function queueTrack(x, y) {
    pendingPoint = { x, y };
    if (trackFrame !== null) return;
    trackFrame = requestAnimationFrame(() => { trackFrame = null; flushTrack(); });
  }
  function destroy() { closed = true; clearTimeout(dwellTimer); clearTimeout(readyTimer); cancelAnimationFrame(trackFrame); pendingPoint = null; stopAll(); }

  root.dataset.open = '';
  placeLabel();
  settle(quiet ? 0 : entrance());
  quiet = false;
  if (live && !options.pinned) { root.tabIndex = -1; root.focus({ preventScroll: true }); }

  // Lo que se edita en el estudio se marca en el anillo, también dentro de un grupo.
  function mark(id) { root.querySelectorAll('.selected-item').forEach(b => b.classList.remove('selected-item')); root.querySelector('.ring-arc:not(.retiring) [data-id="' + CSS.escape(id) + '"],.ring-opt[data-id="' + CSS.escape(id) + '"]')?.classList.add('selected-item'); }
  // Abre, nivel a nivel, los grupos que llevan hasta una acción.
  function reveal(id, { instant = false } = {}) {
    const trail = pathTo(config.items, id); if (!trail) return;
    const was = quiet; quiet = quiet || instant;
    let level = 0;
    for (const step of trail) {
      const lv = levels[level], i = lv.items.findIndex(item => item.id === step);
      if (i < 0 || lv.items[i].type !== 'group') break;
      openGroupAt(level, i); level++;
    }
    if (level < levels.length - 1) truncate(level);
    quiet = was;
  }

  // --- Edición en el estudio ------------------------------------------------------------
  // El editor arrastra con el puntero y pregunta aquí dónde está cada círculo (en pantalla),
  // abre un hueco entre dos vecinos, ilumina un destino o deja tenue lo que se levanta.
  const visible = () => levels.flatMap((lv, l) => lv.buttons.map((b, i) => ({ b, lv, l, i })));
  function slots() {
    const r = root.getBoundingClientRect();
    // x/y es su sitio de siempre (para decidir el destino sin que huya del cursor); vx/vy,
    // donde se ve ahora mismo, apartado o no (para que al soltar viaje desde ahí).
    return visible().map(({ b, lv, l, i }) => {
      const [hx, hy] = b._home ? polar(b._home.deg, b._home.radius) : [b._seat.x, b._seat.y];
      return { id: b.dataset.id, el: b, level: l, index: i, count: lv.items.length, parentId: lv.parentId, angle: lv.angles[i], x: r.left + hx * zoom, y: r.top + hy * zoom, vx: r.left + b._seat.x * zoom, vy: r.top + b._seat.y * zoom, size: lv.size * zoom, radius: lv.radius * zoom, cx: r.left, cy: r.top, step: l === 0 ? main.step : lv.step };
    });
  }
  let gapEl = null, nudged = [];
  function unnudge() { nudged.forEach(b => { seat(b, b._home.deg, b._home.radius); delete b._home; }); nudged = []; }
  function gap(level, index) {
    const lv = levels[level]; if (!lv) return clearGap();
    const n = lv.items.length, ring = level === 0, step = ring ? main.step : (lv.step || 24);
    let at, prev = null, next = null;
    if (ring) { prev = lv.buttons[(index - 1 + n) % n]; next = lv.buttons[index % n]; at = lv.angles[(index - 1 + n) % n] + step / 2; }
    else if (index <= 0) { next = lv.buttons[0]; at = lv.angles[0] - step * .75; }
    else if (index >= n) { prev = lv.buttons[n - 1]; at = lv.angles[n - 1] + step * .75; }
    else { prev = lv.buttons[index - 1]; next = lv.buttons[index]; at = (lv.angles[index - 1] + lv.angles[index]) / 2; }
    unnudge();
    // Los dos vecinos se apartan de verdad y los siguientes los acompañan un poco: el hueco
    // se lee como un sitio libre, no como una rendija.
    const push = Math.min(step * .42, 22), list = lv.buttons, at0 = prev ? list.indexOf(prev) : -1, at1 = next ? list.indexOf(next) : -1;
    const moves = [[prev, -push], [next, push]];
    if (n >= 5) moves.push([at0 >= 0 ? list[ring ? (at0 - 1 + n) % n : at0 - 1] : null, -push * .4], [at1 >= 0 ? list[ring ? (at1 + 1) % n : at1 + 1] : null, push * .4]);
    const done = new Set();
    for (const [b, shift] of moves) {
      if (!b || done.has(b) || b.classList.contains('drag-source')) continue;
      done.add(b); b._home = { deg: b._seat.deg, radius: b._seat.radius }; seat(b, b._home.deg + shift, b._home.radius); nudged.push(b);
    }
    const [x, y] = polar(at, lv.radius);
    if (!gapEl) { gapEl = layer('ring-gap'); root.insertBefore(gapEl, hub); gapEl.style.setProperty('--x', px(x)); gapEl.style.setProperty('--y', px(y)); requestAnimationFrame(() => gapEl?.classList.add('on')); }
    gapEl.style.setProperty('--gap-size', lv.size + 'px'); gapEl.style.setProperty('--x', px(x)); gapEl.style.setProperty('--y', px(y));
    const rr = root.getBoundingClientRect();
    return { x: rr.left + x * zoom, y: rr.top + y * zoom, size: lv.size * zoom };
  }
  function clearGap() { unnudge(); if (gapEl) { const el = gapEl; gapEl = null; el.classList.remove('on'); setTimeout(() => el.remove(), 180); } }
  function target(id) { root.querySelectorAll('.drop-target').forEach(b => b.classList.remove('drop-target')); if (id) root.querySelector('.ring-arc:not(.retiring) [data-id="' + CSS.escape(id) + '"],.ring-opt[data-id="' + CSS.escape(id) + '"]')?.classList.add('drop-target'); }
  function lift(id) { root.querySelectorAll('.drag-source').forEach(b => b.classList.remove('drag-source')); if (id) root.querySelectorAll('[data-id="' + CSS.escape(id) + '"]').forEach(b => b.classList.add('drag-source')); }
  // Tras cambiar el orden, cada círculo sale de donde se veía antes y viaja a su sitio nuevo.
  function flipFrom(before, { landing } = {}) {
    if (!before || !motion()) return;
    const r = root.getBoundingClientRect(), f = easing(config.easing === 'linear' ? 'linear' : config.easing === 'smooth' ? 'smooth' : 'soft');
    for (const { b } of visible()) {
      const was = before.get(b.dataset.id), x = r.left + b._seat.x * zoom, y = r.top + b._seat.y * zoom;
      if (b.dataset.id === landing) continue;
      if (!was) { b.animate([{ opacity: 0, scale: .4 }, { opacity: 1, scale: 1 }], { duration: 300, easing: f }); continue; }
      const dx = (was.x - x) / zoom, dy = (was.y - y) / zoom;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
      b.animate([{ translate: px(b._seat.x + dx) + ' ' + px(b._seat.y + dy) }, { translate: px(b._seat.x) + ' ' + px(b._seat.y) }], { duration: 420, easing: f });
    }
  }

  return {
    root, track, queueTrack, release, close, replay, key, backgroundClick, place, mark, reveal, destroy, move,
    slots, gap, clearGap, target, lift, flipFrom,
    get zoom() { return zoom; },
    get buttons() { return levels[0].buttons; },
    get aimedItem() { return aim ? levels[aim.level]?.items[aim.i] : null; },
    clearAim: () => { pendingPoint = null; setAim(null, false); },
    aimAt: i => { if (!closed && config.items[i]) setAim({ level: 0, i }, false); },
    openGroup: id => reveal(id),
    get depth() { return levels.length - 1; }
  };
}
