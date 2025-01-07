/* eslint prefer-template:off */
import {
  IpcMainInvokeEvent,
  ipcMain,
} from 'electron/main';
import { SteamInitResponse } from './electron-preload';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let greenworks: any;

let steam_init_data = {
  initialized: false,
} as SteamInitResponse;

function log(...msg: (string|number)[]): void {
  console.log('[GREENWORKS]', ...msg);
}

export function greenworksInit(): void {
  try {
    // eslint-disable-next-line global-require, import/order
    greenworks = require('./greenworks/greenworks.js');
  } catch (e) {
    console.log(e);
    return;
  }

  try {
    if (!greenworks.init()) {
      log('Error on initializing steam API.');
    } else {
      log('Steam API initialized successfully.');

      steam_init_data = {
        initialized: true,
        app_id: greenworks.getAppId(),
        steam_id: greenworks.getSteamId().getRawSteamID(),
        display_name: greenworks.getSteamId().getPersonaName()
      };

      log('App ID: ' + steam_init_data.app_id);
      log('Steam ID: ' + steam_init_data.steam_id);

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
        function (a: number, b: number) {
          log('Cloud quota: ' + a + ',' + b);
        },
        function (err: string) {
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
        function (a: number) {
          log('Number of players ' + a);
        },
        function (err: string) {
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

export function steamInit(): void {
  if (!process.argv.includes('--no-steam')) {
    greenworksInit();
  }

  ipcMain.handle('steam-init', function () {
    return Promise.resolve(steam_init_data);
  });

  ipcMain.handle('steam-getEncryptedAppTicket', function (event: IpcMainInvokeEvent, content: string) {
    return new Promise(function (resolve, reject) {
      log('Requesting encrypted app ticket...');
      greenworks!.getEncryptedAppTicket(content, function (ticket: Buffer): void {
        log('Received app ticket');
        resolve(ticket.toString('base64url'));
      });
    });
  });

  ipcMain.handle('steam-setRichPresence', function (event: IpcMainInvokeEvent, key: string, value: string) {
    greenworks!.setRichPresence(key, value);
  });
  ipcMain.handle('steam-clearRichPresence', function (event: IpcMainInvokeEvent) {
    greenworks!.clearRichPresence();
  });

  function nop(): void {
    // nothing
  }
  function logError(api: string, err: unknown): void {
    log(`Error calling "${api}": ${err}`);
  }
  ipcMain.handle('steam-activateAchievement', function (event: IpcMainInvokeEvent, api_name: string) {
    greenworks!.activateAchievement(api_name, nop, logError.bind(null, 'activateAchievement'));
  });
  ipcMain.handle('steam-clearAchievement', function (event: IpcMainInvokeEvent, api_name: string) {
    greenworks!.clearAchievement(api_name, nop, logError.bind(null, 'clearAchievement'));
  });
  ipcMain.handle('steam-indicateAchievementProgress', function (
    event: IpcMainInvokeEvent, api_name: string, cur: number, max: number
  ) {
    greenworks!.indicateAchievementProgress(api_name, cur, max);
  });
  ipcMain.handle('steam-getAchievement', function (event: IpcMainInvokeEvent, api_name: string) {
    return new Promise(function (resolve, reject) {
      greenworks!.getAchievement(api_name, resolve, reject);
    });
  });
  ipcMain.handle('steam-getAchievementNames', function (event: IpcMainInvokeEvent) {
    return Promise.resolve(greenworks!.getAchievementNames());
  });
  ipcMain.handle('steam-getStatInt', function (event: IpcMainInvokeEvent, stat_name: string) {
    return Promise.resolve(greenworks!.getStatInt(stat_name));
  });
  ipcMain.handle('steam-setStat', function (event: IpcMainInvokeEvent, stat_name: string, value: number) {
    greenworks!.setStat(stat_name, value);
  });
  ipcMain.handle('steam-storeStats', function (event: IpcMainInvokeEvent) {
    greenworks!.storeStats(nop, logError.bind(null, 'storeStats'));
  });
}
