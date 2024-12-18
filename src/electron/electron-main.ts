/* eslint prefer-template:off */
const path = require('node:path');
const {
  BrowserWindow,
  // Menu,
  app,
  crashReporter,
  ipcMain,
} = require('electron/main');

app.commandLine.appendSwitch('--in-process-gpu', '--disable-direct-composition');

crashReporter.start({
  // productName: 'todo', // defaults to app.name, is that appropriate?
  submitURL: 'http://error.staging.dashingstrike.com/crashreports',
  ignoreSystemCrashHandler: true,
  globalExtra: {
    foo: 'bar',
  },
});

function greenworksTest() {
  let greenworks;
  try {
    // eslint-disable-next-line global-require, import/order
    greenworks = require('./greenworks/greenworks.js');
  } catch (e) {
    console.log(e);
    return;
  }
  function log(msg) {
    console.log('[GREENWORKS]', msg);
  }

  try {
    if (!greenworks.init()) {
      log('Error on initializing steam API.');
    } else {
      log('Steam API initialized successfully.');

      log('Cloud enabled: ' + greenworks.isCloudEnabled());
      log('Cloud enabled for user: ' + greenworks.isCloudEnabledForUser());

      greenworks.on('steam-servers-connected', function () {
        log('connected');
      });
      greenworks.on('steam-servers-disconnected', function () {
        log('disconnected');
      });
      greenworks.on('steam-server-connect-failure', function () {
        log('connected failure');
      });
      greenworks.on('steam-shutdown', function () {
        log('shutdown');
      });

      // greenworks.saveTextToFile('test_file.txt', 'test_content',
      //   function () {
      //     log('Save text to file successfully');
      //   },
      //   function (err) {
      //     log('Failed on saving text to file: ' + err);
      //   });

      // greenworks.readTextFromFile('test_file.txt', function (message) {
      //   log('Read text from file successfully.');
      // }, function (err) {
      //   log('Failed on reading text from file: ' + err);
      // });

      greenworks.getCloudQuota(
        function (a, b) {
          log('Cloud quota: ' + a + ',' + b);
        },
        function (err) {
          log('Failed on getting cloud quota: ' + err);
        });
      // The ACH_WIN_ONE_GAME achievement is available for the sample (id:480) game
      // greenworks.activateAchievement('ACH_WIN_ONE_GAME',
      //   function () {
      //     log('Activating achievement successfully');
      //   },
      //   function (err) {
      //     log('Failed on activating achievement: ' + err);
      //   });

      greenworks.getNumberOfPlayers(
        function (a) {
          log('Number of players ' + a);
        },
        function (err) {
          log('Failed on getting number of players: ' + err);
        });

      log('Numer of friends: ' +
          greenworks.getFriendCount(greenworks.FriendFlags.Immediate));
      let friends = greenworks.getFriends(greenworks.FriendFlags.Immediate);
      let friends_names = [];
      for (let i = 0; i < friends.length; ++i) {
        friends_names.push(friends[i].getPersonaName());
      }
      log('Friends: [' + friends_names.join(',') + ']');
    }
  } catch (e) {
    console.log(e);
  }
}

let win;

function toggleFullScreen() {
  win.setFullScreen(!win.isFullScreen());
}
function createWindow() {
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
  // win.webContents.toggleDevTools(); // TODO: only in dev mode

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

app.whenReady().then(() => {
  greenworksTest();
  ipcMain.handle('ping', () => 'pong');
  ipcMain.handle('fullscreen-toggle', toggleFullScreen);
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
