const path = require('node:path');
const {
  BrowserWindow,
  // Menu,
  app,
  crashReporter,
  ipcMain,
} = require('electron/main');

crashReporter.start({
  // productName: 'todo', // defaults to app.name, is that appropriate?
  submitURL: 'http://error.staging.dashingstrike.com/crashreports',
  ignoreSystemCrashHandler: true,
  globalExtra: {
    foo: 'bar',
  },
});

let win;
const createWindow = () => {
  // let production_mode = app.isPackaged;
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 280,
    minHeight: 180,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      // nodeIntegration: true, // may want this for Steamworks integration?
      autoplayPolicy: 'no-user-gesture-required',
      // webSecurity: true, // maybe?
      // allowRunningInsecureContent: true, // maybe?
      // devTools: false, // TODO: default to this in production mode
    },
    // fullscreen: true, TODO: default to this in production mode
    // Reasonable to try:
    // titleBarStyle: 'hidden',
    // titleBarOverlay: true,
  });
  win.setAspectRatio(1920/1080);
  win.removeMenu(); // Maybe better than Menu.setApplicationMenu on Mac?
  win.loadFile(path.join(__dirname, '../client/index.html'));

  win.webContents.on('before-input-event', function (unused, input) {
    if (input.type === 'keyDown' && (
      input.key === 'F12' ||
      (input.ctrl && input.shift && input.code === 'KeyI') ||
      (input.meta && input.alt && input.code === 'KeyI')
    )) {
      win.webContents.toggleDevTools();
    }
  });
};

app.whenReady().then(() => {
  ipcMain.handle('ping', () => 'pong');
  ipcMain.handle('fullscreen-toggle', function () {
    win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('open-devtools', function () {
    win.webContents.openDevTools();
  });
  ipcMain.handle('crash-main', process.crash.bind(process));
  // Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    // On Mac OS, create a window if we don't have one but are still running, I guess?
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  //if (process.platform !== 'darwin')
  app.quit();
});
