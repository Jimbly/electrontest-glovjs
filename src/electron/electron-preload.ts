import { contextBridge, ipcRenderer } from 'electron';

// window.addEventListener('DOMContentLoaded', () => {
//   const element = document.getElementById(selector);
// });

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
});

contextBridge.exposeInMainWorld('myapi', {
  fullscreenToggle: function () {
    ipcRenderer.invoke('fullscreen-toggle');
  },
  openDevTools: function () {
    ipcRenderer.invoke('open-devtools');
  },
  crash: function () {
    process.crash();
  },
  crashMain: function () {
    ipcRenderer.invoke('crash-main');
  },
});
