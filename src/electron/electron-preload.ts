import { contextBridge, ipcRenderer } from 'electron';

type DataObject = Partial<Record<string, unknown>>;

export type ELectronStorage = {
  getAll(): Promise<Partial<Record<string, string | DataObject>>>;
  setJSON(file: string, field: string, value: unknown): void;
  setFile(file: string, value: string | undefined): void;
};

declare global {
  interface Window {
    glov_electron?: {
      storage: ELectronStorage;
    };
  }
}

// window.addEventListener('DOMContentLoaded', () => {
//   const element = document.getElementById(selector);
// });

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('conf_platform', 'electron');

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

contextBridge.exposeInMainWorld('glov_electron', {
  storage: {
    getAll: function () {
      return ipcRenderer.invoke('electron-storage-get-all');
    },
    setJSON: function (file: string, field: string, value: unknown): void {
      ipcRenderer.invoke('electron-storage-set-json', file, field, value);
    },
    setFile: function (file: string, value: string | undefined): void {
      ipcRenderer.invoke('electron-storage-set-file', file, value);
    },
    // on: function (message: string, func: (payload: unknown) => void) {
    //   ipcRenderer.on(message, function (event, payload) {
    //     func(payload);
    //   });
    // }
  },
});
