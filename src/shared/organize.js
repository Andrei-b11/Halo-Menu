// Transactional editor operations: all limits are checked before the UI commits.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.haloOrganize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function collect(items, ids, parent = null, level = 0) {
    return items.flatMap(item => ids.has(item.id) ? [{ item, list: items, parent, level }] : item.items ? collect(item.items, ids, item, level + 1) : []);
  }
  const height = item => item.items ? 1 + Math.max(0, ...item.items.map(height)) : 0;
  const maximum = node => node.parent ? 12 : 16;
  const minimum = node => node.parent ? 1 : 2;
  function organize(value, ids, operation, option) {
    const config = structuredClone(value), nodes = collect(config.items, new Set(ids));
    const fail = message => { throw new Error(message); };
    if (!nodes.length) fail('Selecciona al menos una acción del anillo.');
    const byList = new Map();
    nodes.forEach(node => { if (!byList.has(node.list)) byList.set(node.list, []); byList.get(node.list).push(node); });
    const fresh = item => { item.id = crypto.randomUUID().slice(0, 18); delete item.hotkey; item.items?.forEach(fresh); };
    const remove = () => nodes.forEach(node => node.list.splice(node.list.indexOf(node.item), 1));
    let selected = nodes.map(node => node.item.id);
    if (operation === 'library') {
      if (config.library.length + nodes.length > 40) fail('No caben todas las acciones en la biblioteca (máximo 40).');
      for (const [list, entries] of byList) if (list.length - entries.length < minimum(entries[0])) fail(entries[0].parent ? 'Cada grupo debe conservar al menos una acción.' : 'El anillo debe conservar al menos dos acciones.');
      remove(); config.library.push(...nodes.map(node => node.item)); selected = [];
    } else if (operation === 'group') {
      if (nodes.length < 2) fail('Selecciona al menos dos acciones para agrupar.');
      if (byList.size !== 1) fail('Para agrupar, selecciona acciones del mismo nivel.');
      if (nodes.length > 12) fail('Un grupo admite hasta 12 acciones.');
      const first = nodes[0], index = first.list.indexOf(first.item);
      if (first.list.length - nodes.length + 1 < minimum(first)) fail(first.parent ? 'El grupo debe conservar al menos una acción.' : 'El anillo debe conservar al menos dos acciones.');
      if (nodes.some(node => node.level + 1 + height(node.item) > 2)) fail('Solo caben dos niveles de grupos.');
      const group = { id: crypto.randomUUID().slice(0, 18), label: 'Nuevo grupo', type: 'group', target: '', icon: 'layers', color: '', items: nodes.map(node => node.item) };
      remove(); first.list.splice(index, 0, group); selected = [group.id];
    } else if (operation === 'duplicate') {
      for (const [list, entries] of byList) if (list.length + entries.length > maximum(entries[0])) fail('No caben todas las copias: máximo 16 acciones en el anillo y 12 por grupo.');
      selected = nodes.map(node => {
        const copy = structuredClone(node.item); fresh(copy); copy.label = (copy.label + ' (copia)').slice(0, 50);
        node.list.splice(node.list.indexOf(node.item) + 1, 0, copy); return copy.id;
      });
    } else if (operation === 'color') {
      if (option !== '' && !/^#[\da-f]{6}$/i.test(option)) fail('Elige un color válido.');
      nodes.forEach(node => node.item.color = option);
    } else fail('Operación no disponible.');
    return { config, selected, count: nodes.length };
  }
  return { collect, organize };
});
