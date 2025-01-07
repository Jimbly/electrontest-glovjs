import assert from 'assert';
import path from 'node:path';
import { crashReporter } from 'electron';
import {
  BrowserWindow,
  // Menu,
  app,
  ipcMain,
} from 'electron/main';
import {
  electronStorageGetJSON,
  electronStorageInit,
  electronStorageSetJSON,
  electronStorageWhenReady
} from './electron_storage-main';
import { steamInit } from './steam-main';

app.commandLine.appendSwitch('--in-process-gpu', '--disable-direct-composition');

const production_mode: boolean = app.getAppPath().includes('app.asar'); // app.isPackaged;
const allow_devtools = process.argv.includes('--devtools') || !production_mode;
crashReporter.start({
  submitURL: `http://error.${production_mode ? '' : 'staging.'}dashingstrike.com/crashreports`,
  ignoreSystemCrashHandler: true,
  globalExtra: {
    product: app.name, // otherwise gets "Electron"
    version: app.getVersion(), // otherwise gets Electron version
    ver_electron: process.versions.electron,
    ver_chrome: process.versions.chrome,
    ver_node: process.versions.node,
    ver_v8: process.versions.v8,
  },
});

electronStorageInit();
steamInit();

let win: BrowserWindow | null = null;

function debug(msg: string): void {
  console.debug(`[ElectronLifecycle] ${msg}`);
}

function toggleFullScreen(): void {
  assert(win);
  let new_fullscreen = !win.isFullScreen();
  win.setFullScreen(new_fullscreen);
  electronStorageSetJSON('settings-device.json', 'fullscreen', new_fullscreen);
}

function createWindow(): void {
  let default_fullscreen = production_mode;
  let fullscreen = electronStorageGetJSON('settings-device.json', 'fullscreen', default_fullscreen);
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 280,
    minHeight: 180,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      autoplayPolicy: 'no-user-gesture-required',
      // webSecurity: true, // maybe?
      // allowRunningInsecureContent: true, // maybe?
      devTools: allow_devtools,
    },
    fullscreen,
    // Reasonable to try:
    // titleBarStyle: 'hidden',
    // titleBarOverlay: true,
  });
  debug('Created window');
  win.setAspectRatio(1920/1080);
  win.removeMenu(); // Maybe better than Menu.setApplicationMenu on Mac?
  win.loadFile(path.join(__dirname, '../client/index.html'), {
    query: production_mode ? {} : { electrondebug: '1' },
  });
  if (!production_mode) {
    win.webContents.openDevTools();
  }

  win.webContents.on('before-input-event', function (unused, input) {
    if (!win) {
      return;
    }
    if (input.type === 'keyDown') {
      let key = input.key.toUpperCase();
      if (key === 'F12' ||
        (input.control && input.shift && key === 'I') ||
        (input.meta && input.alt && key === 'I')
      ) {
        win.webContents.toggleDevTools(); // note: ignored if `allow_devtools` is not true above
      }
      if (
        !input.shift && !input.control && input.alt && key === 'ENTER' ||
        !input.shift && !input.control && !input.alt && key === 'F11'
      ) {
        toggleFullScreen();
      }
    }
  });
  win.on('close', function () {
    win = null;
  });
}

app.whenReady().then(function () {
  electronStorageWhenReady(function () {
    ipcMain.handle('ping', () => 'pong');
    ipcMain.handle('fullscreen-toggle', toggleFullScreen);
    ipcMain.handle('open-devtools', function () {
      assert(win);
      win.webContents.openDevTools();
    });
    ipcMain.handle('crash-main', process.crash.bind(process));
    // Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', function () {
      // On Mac OS, create a window if we don't have one but are still running, I guess?
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
});
app.on('before-quit', function () {
  // unsure if this helps, but trying to track why electron processes are not exiting
  win?.close();
  if (production_mode) {
    // Just to be safe, make *sure* the process exits
    // Note: doesn't seem to help
    setTimeout(function () {
      debug('calling app.exit()');
      app.exit();
    }, 5000);
  }
});
app.on('window-all-closed', function () {
  debug('In my window-all-closed handler');
  //if (process.platform !== 'darwin')
  app.quit();
  // if (production_mode) { // Maybe want this
  //   debug('calling app.exit() directly');
  //   app.exit();
  // }
  debug('Exiting my window-all-closed handler');
});

app.on('render-process-gone', function () {
  // hard crash in render thread, just exit, crash report will have been sent
  app.quit();
});

[
  'ready',
  'window-all-closed',
  'before-quit',
  'will-quit',
  'quit',
  'open-file',
  'open-url',
  'activate',
  'did-become-active',
  'did-resign-active',
  'continue-activity',
  'will-continue-activity',
  'continue-activity-error',
  'activity-was-continued',
  'update-activity-state',
  'new-window-for-tab',
  // 'browser-window-blur',
  // 'browser-window-focus',
  'browser-window-created',
  'web-contents-created',
  'certificate-error',
  'select-client-certificate',
  'login',
  'gpu-info-update',
  'render-process-gone',
  'child-process-gone',
  'accessibility-support-changed',
  'session-created',
  'second-instance',
].forEach(function (msg) {
  app.on(msg as 'ready', function (param: unknown) {
    let text = msg;
    if (param !== undefined && !(param && typeof param === 'object')) {
      text += `(${param})`;
    }
    debug(text);
  });
});
