/* eslint prefer-template:off */

export function greenworksTest(): void {
  let greenworks;
  try {
    // eslint-disable-next-line global-require, import/order
    greenworks = require('./greenworks/greenworks.js');
  } catch (e) {
    console.log(e);
    return;
  }
  function log(msg: string): void {
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
