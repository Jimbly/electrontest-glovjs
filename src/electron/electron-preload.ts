import { contextBridge, ipcRenderer } from 'electron';
import type { Unpromisified } from 'client/electron/steam-renderer';
import type { NetErrorCallback } from 'glov/common/types';

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
  display_name: string;
};

export type ELectronSteamAPI = {
  init(cb: Unpromisified<NetErrorCallback<SteamInitResponse>>): void;
  getEncryptedAppTicket(content: string, cb: Unpromisified<NetErrorCallback<string>>): void;
  setRichPresence(key: string, value: string | null): void;
  clearRichPresence(): void;
  activateAchievement(api_name: string): void;
  clearAchievement(api_name: string): void;
  indicateAchievementProgress(api_name: string, cur: number, max: number): void;
  getAchievement(api_name: string, cb: Unpromisified<NetErrorCallback<boolean>>): void;
  getAchievementNames(cb: Unpromisified<NetErrorCallback<string[]>>): void;
  getStatInt(stat_name: string, cb: Unpromisified<NetErrorCallback<number>>): void;
  setStat(stat_name: string, value: number): void;
  storeStats(): void;
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

function invokeToCb<T>(p: Promise<T>, cb: Unpromisified<NetErrorCallback<T>>): void {
  if (!cb.unpromisified) {
    console.error('steam API requires electronUnpromisified function');
  }
  p.then(function (payload: T) {
    cb.f(null, payload);
  }, function (err: unknown) {
    cb.f(errorString(err));
  });
}
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
    init: function (cb: Unpromisified<NetErrorCallback<SteamInitResponse>>): void {
      invokeToCb(ipcRenderer.invoke('steam-init'), cb);
    },
    getEncryptedAppTicket: function (content: string, cb: Unpromisified<NetErrorCallback<string>>): void {
      invokeToCb(ipcRenderer.invoke('steam-getEncryptedAppTicket', content), cb);
    },
    setRichPresence(key: string, value: string | null): void {
      ipcRenderer.invoke('steam-setRichPresence', key, value || '');
    },
    clearRichPresence(): void {
      ipcRenderer.invoke('steam-clearRichPresence');
    },
    activateAchievement(api_name: string): void {
      ipcRenderer.invoke('steam-activateAchievement', api_name);
    },
    clearAchievement(api_name: string): void {
      ipcRenderer.invoke('steam-clearAchievement', api_name);
    },
    indicateAchievementProgress(api_name: string, cur: number, max: number): void {
      ipcRenderer.invoke('steam-indicateAchievementProgress', api_name, cur, max);
    },
    getAchievement(api_name: string, cb: Unpromisified<NetErrorCallback<boolean>>): void {
      invokeToCb(ipcRenderer.invoke('steam-getAchievement', api_name), cb);
    },
    getAchievementNames(cb: Unpromisified<NetErrorCallback<string[]>>): void {
      invokeToCb(ipcRenderer.invoke('steam-getAchievementNames'), cb);
    },
    getStatInt(stat_name: string, cb: Unpromisified<NetErrorCallback<number>>): void {
      invokeToCb(ipcRenderer.invoke('steam-getStatInt', stat_name), cb);
    },
    setStat(stat_name: string, value: number): void {
      ipcRenderer.invoke('steam-setStat', stat_name, value);
    },
    storeStats(): void {
      ipcRenderer.invoke('steam-storeStats');
    },
  },
};
contextBridge.exposeInMainWorld('glov_electron', api);
