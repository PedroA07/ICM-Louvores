const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('icm', {
  onProgress: (cb) => ipcRenderer.on('progress', (_, data) => cb(data)),
});
