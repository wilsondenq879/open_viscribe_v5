const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopRipple', {
  onShowRipple(callback) {
    ipcRenderer.on('show-ripple', (_, payload) => callback(payload));
  },
  onRippleState(callback) {
    ipcRenderer.on('ripple-state', (_, payload) => callback(payload));
  },
  getRippleState() {
    return ipcRenderer.invoke('get-ripple-state');
  },
  quit() {
    ipcRenderer.send('quit-app');
  }
});
