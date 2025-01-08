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

type Timeout = ReturnType<typeof setTimeout>;
export type ElectronCrashAPI = {
  onError(cb: (param: CrashParam) => void): void;
  handlers: Partial<Record<string,
    (() => void) |
    (() => Promise<unknown>) |
    (() => Timeout)
  >>;
};

export type ElectonGlovAPI = {
  storage: ELectronStorage;
  steam: ELectronSteamAPI;
  crash: ElectronCrashAPI;
};

declare global {
  interface Window {
    elapi?: {
      fullscreenToggle(): void;
      openDevTools(): void;
    };
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

function crashSoft(): void {
  let a = null! as { b: { c: number } };
  a.b.c++;
}
function rejectSoft(): Promise<null> {
  return new Promise<null>(function (resolve, reject) {
    reject(new Error());
  });
}

export type CrashParam = {
  msg: string;
  file?: string | null;
  line?: number | null;
  col?: number | null;
  error: {
    stack?: string;
  } & Partial<Record<string, unknown>>;
};
let crash_handler: null | ((param: CrashParam) => void) = null;
let early_crash: CrashParam | null = null;
function handleCrash(param: CrashParam): void {
  if (crash_handler) {
    crash_handler(param);
  } else if (!early_crash) {
    early_crash = param;
  }
}
ipcRenderer.on('crash-msg', function (event, payload) {
  handleCrash(payload);
});
let crash_api: ElectronCrashAPI = {
  onError: function (cb: (param: CrashParam) => void) {
    crash_handler = cb;
    if (early_crash) {
      cb(early_crash);
      early_crash = null;
    }
  },
  handlers: {
    crash_preload_hard: process.crash.bind(process),

    crash_preload_now: function () {
      crashSoft();
    },
    crash_preload_later: function () {
      setTimeout(crashSoft, 100);
    },
    reject_preload_now: function () {
      rejectSoft();
    },
    reject_preload_later: function () {
      setTimeout(rejectSoft, 100);
    },

    crash_preload_now_ret: crashSoft,
    crash_preload_later_ret: setTimeout.bind(null, crashSoft, 100),
    reject_preload_now_ret: rejectSoft,
    reject_preload_later_ret: function () {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(new Error());
        }, 100);
      });
    },

    crash_main_now: function () {
      ipcRenderer.invoke('crash_main_now');
    },
    crash_main_later: function () {
      ipcRenderer.invoke('crash_main_later');
    },
    reject_main_now: function () {
      ipcRenderer.invoke('reject_main_now');
    },
    reject_main_later: function () {
      ipcRenderer.invoke('reject_main_later');
    },

    crash_main_now_ret: function () {
      return ipcRenderer.invoke('crash_main_now');
    },
    crash_main_later_ret: function () {
      return ipcRenderer.invoke('crash_main_later');
    },
    reject_main_now_ret: function () {
      return ipcRenderer.invoke('reject_main_now');
    },
    reject_main_later_ret: function () {
      return ipcRenderer.invoke('reject_main_later');
    },

    crash_main_hard: function () {
      ipcRenderer.invoke('crash_main_hard');
    },
  },
};


contextBridge.exposeInMainWorld('elapi', {
  fullscreenToggle: function () {
    ipcRenderer.invoke('fullscreen-toggle');
  },
  openDevTools: function () {
    ipcRenderer.invoke('open-devtools');
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
  crash: crash_api,
};
contextBridge.exposeInMainWorld('glov_electron', api);

window.addEventListener('error', function (event) {
  console.log('preload: received error event', event);
  handleCrash({
    msg: event.error ? String(event.error) : event.message,
    file: event.filename,
    line: event.lineno,
    col: event.colno,
    error: {
      stack: event.error?.stack || undefined,
      from: 'preload',
    },
  });
});

window.addEventListener('unhandledrejection', function (event) {
  console.log('preload: received unhandledrejection event', event);
  let errorobj = event.reason;
  if (!errorobj || typeof errorobj !== 'object') {
    errorobj = { stack: errorobj };
  }
  handleCrash({
    msg: String(event.reason),
    error: {
      stack: errorobj.stack,
      errortype: event.type,
      from: 'preload',
    },
  });
});
