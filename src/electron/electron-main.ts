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

crashReporter.start({
  // productName: 'todo', // defaults to app.name, is that appropriate?
  submitURL: 'http://error.staging.dashingstrike.com/crashreports',
  ignoreSystemCrashHandler: true,
  globalExtra: {
    foo: 'bar',
  },
});

electronStorageInit();
steamInit();

let win: BrowserWindow;

export function mainWindow(): BrowserWindow {
  return win;
}

function toggleFullScreen(): void {
  let new_fullscreen = !win.isFullScreen();
  win.setFullScreen(new_fullscreen);
  electronStorageSetJSON('settings-device.json', 'fullscreen', new_fullscreen);
}

function createWindow(): void {
  const production_mode = app.isPackaged;
  let default_fullscreen = false; // TODO: default to this in production mode
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
      // devTools: false, // TODO: default to this in production mode
    },
    fullscreen,
    // Reasonable to try:
    // titleBarStyle: 'hidden',
    // titleBarOverlay: true,
  });
  win.setAspectRatio(1920/1080);
  win.removeMenu(); // Maybe better than Menu.setApplicationMenu on Mac?
  win.loadFile(path.join(__dirname, '../client/index.html'), {
    query: production_mode ? {} : { electrondebug: '1' },
  });
  win.webContents.openDevTools(); // TODO: only in dev mode

  win.webContents.on('before-input-event', function (unused, input) {
    if (input.type === 'keyDown') {
      // console.log('!!!!', input);
      let key = input.key.toUpperCase();
      // TODO: only in dev mode or with command argument, or maybe above logic handles that?
      if (key === 'F12' ||
        (input.control && input.shift && key === 'I') ||
        (input.meta && input.alt && key === 'I')
      ) {
        win.webContents.toggleDevTools();
      }
      if (
        !input.shift && !input.control && input.alt && key === 'ENTER' ||
        !input.shift && !input.control && !input.alt && key === 'F11'
      ) {
        toggleFullScreen();
      }
    }
  });
}

app.whenReady().then(function () {
  electronStorageWhenReady(function () {
    ipcMain.handle('ping', () => 'pong');
    ipcMain.handle('fullscreen-toggle', toggleFullScreen);
    ipcMain.handle('open-devtools', function () {
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

app.on('window-all-closed', function () {
  //if (process.platform !== 'darwin')
  app.quit();
});
