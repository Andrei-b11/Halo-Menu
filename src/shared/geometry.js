// Geometría del anillo, compartida por el proceso principal (tamaño de la ventana) y la
// interfaz (dónde va cada círculo). Igual que en LINDE, ningún radio se elige a ojo: dos
// círculos vecinos se separan por la cuerda entre sus centros menos su diámetro, así que
// fijando el hueco se despeja el radio:  R = (tamaño + hueco) / (2·sen(paso/2)).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.apticGeometry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SPREAD_MAX = 150, ARC_GAP = 16;
  const rad = deg => deg * Math.PI / 180;
  const radiusFor = (size, gap, stepDeg) => (size + gap) / (2 * Math.sin(rad(stepDeg) / 2));
  const gapFor = size => Math.max(10, Math.round(size * .28));
  // Cada nivel de grupos es un poco más pequeño que el anterior.
  const sizeAt = (size, level) => level === 0 ? size : Math.round(size * (level === 1 ? .84 : .74));
  const subSizeFor = size => sizeAt(size, 1);

  function ring(config, count) {
    const n = Math.max(count || config.items.length, 1), size = config.size;
    const fit = n < 2 ? 0 : radiusFor(size, gapFor(size), 360 / n);
    return { n, size, step: 360 / n, radius: Math.round(Math.max(config.radius, fit)) };
  }

  // El arco de un grupo empieza donde acaba el nivel de dentro, con un hueco que se lea como
  // anillo aparte, y se abre lo justo para que sus círculos no se toquen.
  function arc(config, count, parentRadius, level = 1) {
    const parentSize = sizeAt(config.size, level - 1), sub = sizeAt(config.size, level), gap = 10;
    const inner = Math.round(parentRadius + parentSize / 2 + sub / 2 + ARC_GAP);
    if (count < 2) return { sub, step: 0, spread: 0, radius: inner };
    const tight = 2 * Math.asin(Math.min(1, (sub + gap) / (2 * inner))) * 180 / Math.PI;
    const step = Math.min(tight, SPREAD_MAX / (count - 1));
    return { sub, step, spread: step * (count - 1), radius: Math.round(Math.max(inner, radiusFor(sub, gap, step))) };
  }

  // Lo más lejos que llega algo del centro, contando cualquier grupo y subgrupo abierto.
  function reach(config) {
    const main = ring(config);
    let outer = main.radius + config.size / 2;
    const visit = (items, radius, level) => {
      for (const item of items) {
        if (item.type !== 'group' || !Array.isArray(item.items) || !item.items.length) continue;
        const a = arc(config, item.items.length, radius, level);
        outer = Math.max(outer, a.radius + a.sub / 2);
        visit(item.items, a.radius, level + 1);
      }
    };
    visit(config.items, main.radius, 1);
    return Math.ceil(outer);
  }

  // La ventana del menú: lo bastante grande para el anillo entero, su etiqueta y la sombra.
  function windowSide(config) { return Math.max(440, Math.min(1600, 2 * (reach(config) + 76))); }

  return { radiusFor, gapFor, sizeAt, subSizeFor, ring, arc, reach, windowSide, SPREAD_MAX };
});
