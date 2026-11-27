// Exposes the desktop-only settings API to pages from the local server.
// The API key can be sent in (save / test) but is never handed back to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ziweiDesktop', {
  ai: {
    getConfig: () => ipcRenderer.invoke('ai-config:get'),
    save: (settings) => ipcRenderer.invoke('ai-config:save', settings),
    test: (settings) => ipcRenderer.invoke('ai-config:test', settings),
    skip: () => ipcRenderer.invoke('ai-config:skip'),
  },
});
