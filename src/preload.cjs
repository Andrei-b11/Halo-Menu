const { contextBridge, ipcRenderer, webUtils } = require('electron');
const listen = channel => callback => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('aptic', {
  state: () => ipcRenderer.invoke('state'), defaults: () => ipcRenderer.invoke('defaults'),
  clipboard: request => ipcRenderer.invoke('clipboard', request),
  save: value => ipcRenderer.invoke('save', value), icon: spec => ipcRenderer.invoke('icon', spec),
  run: id => ipcRenderer.invoke('run', id), showMenu: () => ipcRenderer.invoke('show-menu'),
  hideMenu: () => ipcRenderer.invoke('hide-menu'), openEditor: () => ipcRenderer.invoke('open-editor'),
  pick: kind => ipcRenderer.invoke('pick', kind), pickImage: () => ipcRenderer.invoke('pick-image'), apps: () => ipcRenderer.invoke('apps'),
  pinMenu: on => ipcRenderer.invoke('pin-menu', on), profile: id => ipcRenderer.invoke('profile', id), overlayHover: over => ipcRenderer.invoke('overlay-hover', over),
  pathFor: file => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  export: value => ipcRenderer.invoke('export', value), import: () => ipcRenderer.invoke('import'),
  window: action => ipcRenderer.invoke('window', action), quit: () => ipcRenderer.invoke('quit'),
  onState: listen('state'), onOpen: listen('open'), onPointer: listen('pointer'), onRelease: listen('release'), onGesture: listen('gesture')
});
