// El anillo de HALO. Nace del menú radial de LINDE: abrir, apuntar y elegir son un solo
// gesto. No hace falta llegar hasta el círculo: basta con empujar el cursor hacia él, y todo
// el sector se ilumina. Al soltar el gesto (o con un clic en cualquier punto del sector) se
// elige. Un grupo abre un arco alrededor de su sector, y un subgrupo, otro arco más afuera.
//
// El mismo módulo dibuja el menú real (modo «live») y las vistas previas del editor (modo
// «preview»), así que lo que se ve al configurar es exactamente lo que aparecerá.
import { icon } from './icons.js';
const geometry = globalThis.apticGeometry;
const DRAG = 14, REACH_PAD = 70, LABEL_GAP = 12, ARC_MARGIN = 22;
const compass = (dx, dy) => ((Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360 + 360) % 360;
const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const norm = a => ((a % 360) + 360) % 360;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
// Pinta en `el` lo que corresponde a la acción: imagen propia, icono del sistema o dibujo.
export function paintGlyph(el, item, config) {
  if (item.image) { const img = new Image(); img.alt = ''; img.src = item.image; el.replaceChildren(img); return; }
  el.innerHTML = icon(item.icon, config.iconStyle);
  if (!config.nativeIcons || item.type === 'group') return;
  const entry = nativeIcon(item); if (!entry) return;
  const show = data => { if (!data) return; const img = new Image(); img.alt = ''; img.src = data; el.replaceChildren(img); };
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

  host.replaceChildren();
  const root = document.createElement('div');
  root.className = 'ring';
  Object.assign(root.dataset, { style: config.style, shape: config.shape, animation: reduced() ? 'none' : config.animation, labels: config.labels, hub: config.hub, mode: live ? 'live' : 'preview' });
  if (config.pointer) root.dataset.pointer = '';
  if (!config.itemBorder) root.dataset.borderless = '';
  if (options.pinned) root.dataset.pinned = '';
  const set = (k, v) => root.style.setProperty(k, v);
  set('--n', config.items.length); set('--ring-r', ringR + 'px'); set('--size', size + 'px'); set('--hub', hubSize + 'px');
  set('--icon', Math.round(size * config.iconScale / 100) + 'px'); set('--d', config.duration + 'ms');
  set('--opacity', config.opacity + '%'); set('--veil', config.veil + '%'); set('--shadow', (config.shadow / 100).toFixed(2));
  set('--label-size', config.labelSize + 'px'); set('--step', main.step + 'deg'); set('--rot', config.rotation + 'deg');
  set('--aim-scale', (config.aimScale / 100).toFixed(2));
  set('--sub', geometry.sizeAt(size, 1) + 'px'); set('--sub-icon', Math.round(geometry.sizeAt(size, 1) * config.iconScale / 100) + 'px');
  if (options.zoom && options.zoom !== 1) root.style.scale = options.zoom;
  if (options.instant) root.classList.add('no-anim');

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

  const disc = document.createElement('div'); disc.className = 'ring-disc';
  const pointer = document.createElement('div'); pointer.className = 'ring-pointer';
  const hub = document.createElement('button');
  hub.type = 'button'; hub.className = 'ring-hub'; hub.setAttribute('aria-label', live ? 'Cerrar' : 'Repetir animación'); hub.title = live ? 'Cerrar (Esc)' : 'Repetir animación';
  const hubGlyph = document.createElement('span'); hubGlyph.className = 'ring-hub-glyph';
  hubGlyph.innerHTML = config.hub === 'logo' ? icon('ring') : config.hub === 'dot' ? '<i></i>' : icon('close');
  const hubText = document.createElement('span'); hubText.className = 'ring-hub-text'; hubText.textContent = hint;
  hub.append(hubGlyph, hubText);
  // La X siempre cierra el anillo entero, aunque haya un grupo abierto (volver atrás es Esc o Retroceso).
  hub.onclick = e => { e.stopPropagation(); close(); };
  const label = document.createElement('div'); label.className = 'ring-label'; label.setAttribute('aria-live', 'polite');
  root.append(disc, pointer);

  const petal = (item, i, cls, level) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.style.setProperty('--i', i); b.dataset.level = level;
    b.setAttribute('role', 'menuitem'); b.setAttribute('aria-label', item.label); b.dataset.id = item.id;
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
    return b;
  };

  // Niveles abiertos: el anillo (0) y, encima, los arcos de grupos y subgrupos.
  const levels = [];
  {
    const angles = config.items.map((_, i) => -90 + config.rotation + main.step * i);
    const buttons = config.items.map((item, i) => {
      const b = petal(item, i, 'ring-opt', 0);
      b.style.setProperty('--a', angles[i] + 'deg');
      b.onclick = e => { e.stopPropagation(); choose(0, i); };
      b.onfocus = () => setAim({ level: 0, i }, false);
      root.append(b); return b;
    });
    levels.push({ items: config.items, angles, buttons, radius: ringR, size, step: main.step, spread: 360, base: 0, el: null, open: null });
  }
  root.append(hub, label);
  root.setAttribute('role', 'menu'); root.setAttribute('aria-label', 'Acciones rápidas');
  host.append(root);

  let aim = null, moved = false, closed = false, pointerAngle = null;
  let holding = !!options.hold, start = null;

  // Cierra los niveles por encima de `keep` (el anillo es el nivel 0).
  function truncate(keep) {
    while (levels.length > keep + 1) { const gone = levels.pop(); gone.el.remove(); }
    const top = levels[keep]; if (top.open !== null) { top.buttons[top.open]?.classList.remove('open'); top.open = null; }
    if (levels.length === 1) root.removeAttribute('data-arc');
    placeLabel();
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
    const angles = kids.map((_, j) => base - a.spread / 2 + a.step * j);
    const buttons = kids.map((kid, j) => {
      const b = petal(kid, j, 'ring-sub', depth);
      b.style.setProperty('--a', angles[j] + 'deg');
      b.onclick = e => { e.stopPropagation(); choose(depth, j); };
      b.onfocus = () => setAim({ level: depth, i: j }, false);
      el.append(b); return b;
    });
    levels.push({ items: kids, angles, buttons, radius: a.radius, size: a.sub, step: a.step, spread: a.spread, base, el, open: null });
    root.insertBefore(el, hub);
    placeLabel();
    if (root.classList.contains('no-anim')) el.dataset.open = '';
    else requestAnimationFrame(() => { el.dataset.open = ''; });
  }

  // La etiqueta nunca pisa un círculo: se mide el que más baja y se coloca debajo; si ahí no
  // cabe en la ventana, se sube por encima del que más sube.
  function placeLabel() {
    let low = -Infinity, high = Infinity;
    for (const lv of levels) lv.angles.forEach(deg => { const y = Math.sin(deg * Math.PI / 180) * lv.radius, s = lv.size + tagRoom; low = Math.max(low, y + s / 2); high = Math.min(high, y - s / 2); });
    const height = label.offsetHeight || 26, width = label.offsetWidth || 0;
    const room = host.clientHeight || innerHeight;
    const below = !live || cy + low + LABEL_GAP + height <= room - 8;
    set('--label-y', (below ? low + LABEL_GAP + height / 2 : high - LABEL_GAP - height / 2) + 'px');
    const W = host.clientWidth || innerWidth;
    const nudge = live ? Math.max(10 + width / 2 - cx, 0) + Math.min(W - 10 - width / 2 - cx, 0) : 0;
    set('--label-x', Math.round(nudge) + 'px');
  }

  const itemAt = a => a && levels[a.level] ? levels[a.level].items[a.i] : null;
  function setAim(next, cancel) {
    if (cancel) root.dataset.cancel = ''; else root.removeAttribute('data-cancel');
    if (JSON.stringify(next || null) === JSON.stringify(aim)) return;
    aim = next || null;
    levels.forEach((lv, l) => lv.buttons.forEach((b, i) => b.classList.toggle('aim', !!aim && aim.level === l && aim.i === i)));
    const item = itemAt(aim);
    if (aim && item) {
      // El indicador gira por el camino corto: de 350° a 10° son veinte grados, no trescientos cuarenta.
      const lv = levels[aim.level], target = lv.angles[aim.i];
      pointerAngle = pointerAngle == null ? target : pointerAngle + ((norm(target - pointerAngle) + 540) % 360 - 180);
      set('--aim', pointerAngle + 'deg'); set('--aim-step', (aim.level ? Math.max(lv.step, 18) : main.step) + 'deg');
      set('--aim-r', lv.radius + 'px');
      root.dataset.aiming = aim.level ? 'sub' : 'opt';
      const saved = item.type === 'clipboard' ? options.clips?.[item.target] : null;
      label.textContent = item.type === 'clipboard' ? item.label + ' · ' + (saved ? saved.preview.slice(0, 60) : 'Vacío') : item.label;
      hubText.textContent = item.label; root.dataset.label = ''; placeLabel();
    } else { root.removeAttribute('data-aiming'); root.removeAttribute('data-label'); hubText.textContent = hint; }
    options.onAim?.(item);
  }
  const nearestIn = (lv, ang) => { let best = 0, bestD = Infinity; lv.angles.forEach((deg, i) => { const d = apart(ang, norm(deg + 90)); if (d < bestD) { bestD = d; best = i; } }); return best; };
  function locate(x, y) {
    const rect = root.getBoundingClientRect(), scale = options.zoom || 1;
    return { dx: (x - rect.left) / scale, dy: (y - rect.top) / scale };
  }
  function track(x, y) {
    if (closed) return;
    const { dx, dy } = locate(x, y), dist = Math.hypot(dx, dy);
    if (!start) start = { dx, dy };
    if (Math.hypot(dx - start.dx, dy - start.dy) > DRAG) moved = true;
    if (dist < hubSize / 2) return setAim(null, true);
    const top = levels[levels.length - 1];
    if (dist > top.radius + top.size / 2 + REACH_PAD) return setAim(null, false);
    const ang = compass(dx, dy);
    // Del arco más externo hacia dentro: manda el nivel en cuya franja está el cursor. Sin
    // este margen, al salir hacia fuera se cruzan sectores vecinos y el objetivo saltaría.
    for (let l = levels.length - 1; l >= 1; l--) {
      const lv = levels[l], inner = levels[l - 1];
      const band = (inner.radius + inner.size / 2 + lv.radius - lv.size / 2) / 2;
      if (dist >= band && apart(ang, norm(lv.base + 90)) <= lv.spread / 2 + ARC_MARGIN) {
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

  function choose(level, i) {
    if (closed || !levels[level]) return;
    const item = levels[level].items[i];
    if (!item) return;
    if (item.type === 'group') {
      openGroupAt(level, i); options.onSelect?.(item);
      if (live) requestAnimationFrame(() => levels[level + 1]?.buttons[0]?.focus({ preventScroll: true }));
      return;
    }
    if (!live) { options.onSelect?.(item); setAim({ level, i }, false); return; }
    root.dataset.chosen = ''; levels.forEach(lv => lv.buttons.forEach(b => b.classList.toggle('chosen', b.dataset.id === item.id)));
    options.onChoose?.(item);
  }

  // Soltar el gesto: si se apuntó, se elige; si se volvió al centro, se cancela; si ni siquiera
  // se movió, el anillo se queda abierto y funciona a clics.
  function release() {
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

  function close() {
    // Si ya se estaba cerrando y la ventana sigue ahí, se pide esconderla otra vez: nunca se queda atascado.
    if (closed) { if (live) options.onClose?.(); return Promise.resolve(); }
    if (!live) { replay(); options.onClose?.(); return Promise.resolve(); }
    closed = true;
    root.dataset.closing = ''; root.removeAttribute('data-open');
    const wait = root.dataset.animation === 'none' ? 0 : Math.min(340, config.duration * .75 + config.items.length * 6);
    return new Promise(resolve => setTimeout(() => { options.onClose?.(); resolve(); }, wait));
  }

  function replay() {
    truncate(0); setAim(null, false);
    root.removeAttribute('data-open'); root.removeAttribute('data-closing'); root.removeAttribute('data-chosen');
    levels[0].buttons.forEach(b => b.classList.remove('chosen'));
    void root.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => { root.dataset.open = ''; }));
  }

  function move(delta) {
    const level = Number(document.activeElement?.dataset?.level ?? levels.length - 1);
    const list = (levels[level] || levels[0]).buttons;
    list[(list.indexOf(document.activeElement) + delta + list.length) % list.length].focus({ preventScroll: true });
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

  if (options.instant) { root.dataset.open = ''; placeLabel(); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-anim'))); }
  else requestAnimationFrame(() => requestAnimationFrame(() => { root.dataset.open = ''; placeLabel(); }));
  if (live && !options.pinned) { root.tabIndex = -1; root.focus({ preventScroll: true }); }

  // Lo que se edita en el estudio se marca en el anillo, también dentro de un grupo.
  function mark(id) { root.querySelectorAll('.selected-item').forEach(b => b.classList.remove('selected-item')); root.querySelector('[data-id="' + CSS.escape(id) + '"]')?.classList.add('selected-item'); }
  // Abre, nivel a nivel, los grupos que llevan hasta una acción.
  function reveal(id) {
    const trail = pathTo(config.items, id); if (!trail) return;
    let level = 0;
    for (const step of trail) {
      const lv = levels[level], i = lv.items.findIndex(item => item.id === step);
      if (i < 0 || lv.items[i].type !== 'group') break;
      openGroupAt(level, i); level++;
    }
  }
  return {
    root, track, release, close, replay, key, backgroundClick, place, mark, reveal,
    get buttons() { return levels[0].buttons; },
    get aimedItem() { return aim ? levels[aim.level]?.items[aim.i] : null; },
    clearAim: () => setAim(null, false),
    aimAt: i => { if (!closed && config.items[i]) setAim({ level: 0, i }, false); },
    openGroup: id => reveal(id),
    get depth() { return levels.length - 1; }
  };
}
