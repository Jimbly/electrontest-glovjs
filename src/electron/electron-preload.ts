import { contextBridge, ipcRenderer } from 'electron';
import type { NetErrorCallback } from 'glov/common/types';

// Wraps a callback so that it escapes implicit try/catches from callbacks fired
//   within Promises.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unpromisify<P extends any[], T=never>(f: (this: T, ...args: P) => void): (this: T, ...args: P) => void {
  return function (this: T): void {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this, prefer-rest-params, @typescript-eslint/no-explicit-any
    setImmediate((f as any).apply.bind(f, this, arguments));
  };
}

function errorString(e: Error | DataObject | string | unknown) : string {
  let msg = String(e);
  if (msg === '[object Object]') {
    try {
      msg = JSON.stringify(e);
    } catch (ignored) {
      // ignored
    }
  }
  if (e && (e as Error).stack && (e as Error).message) {
    // Error object or similar
    // Just grabbing the message, but could do something with the stack similar to error handler in bootstrap.js
    msg = String((e as Error).message);
  }
  msg = msg.slice(0, 600); // Not too huge
  return msg;
}


type DataObject = Partial<Record<string, unknown>>;

export type ELectronStorage = {
  getAll(): Promise<Partial<Record<string, string | DataObject>>>;
  setJSON(file: string, field: string, value: unknown): void;
  setFile(file: string, value: string | undefined): void;
};

export type SteamInitResponse = {
  initialized: boolean;
  steam_id: string;
  app_id: string;
};

export type ELectronSteamAPI = {
  init(cb: NetErrorCallback<SteamInitResponse>): void;
  getEncryptedAppTicket(content: string, cb: NetErrorCallback<string>): void;
};

export type ElectonGlovAPI = {
  storage: ELectronStorage;
  steam: ELectronSteamAPI;
};

declare global {
  interface Window {
    glov_electron?: ElectonGlovAPI;
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

let api: ElectonGlovAPI = {
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
  steam: {
    init: function (cb: NetErrorCallback<SteamInitResponse>): void {
      ipcRenderer.invoke('steam-init').then(unpromisify(function (payload: SteamInitResponse) {
        cb(null, payload);
      }), function (err: unknown) {
        cb(errorString(err));
      });
    },
    getEncryptedAppTicket: function (content: string, cb: NetErrorCallback<string>): void {
      ipcRenderer.invoke('steam-getEncryptedAppTicket', content).then(unpromisify(function (payload: string) {
        cb(null, payload);
      }), function (err: unknown) {
        cb(errorString(err));
      });
    },
  },
};
contextBridge.exposeInMainWorld('glov_electron', api);
