const fs = require('fs');
const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const UNPACK_EXTS = [
  '.node',
  '.dll',
  '.so',
  '.dylib',
  '.png',
  '.ogg',
];

module.exports = {
  packagerConfig: {
    asar: { // TODO: Only in production builds?
      // This is similar to `@electron-forge/plugin-auto-unpack-natives`, but also include DLLs, etc
      unpack: `{${UNPACK_EXTS.map((ext) => `**/*${ext}`).join(',')}}`,
    },
    ignore: function (filename) {
      if (!filename || filename === '/' || filename === '/package.json') {
        return false;
      }
      if (filename.endsWith('.map')) { // TODO: Only in production builds?
        return true;
      }
      if (filename.endsWith('.mp3')) {
        // .oggs should be sufficient and preferred
        return true;
      }
      if (filename.match(/greenworks\/lib\/\d+$/)) {
        return true;
      }
      if (filename.startsWith('/client') || filename.startsWith('/electron')) {
        return false;
      }
      if (filename.startsWith('/node_modules/')) {
        // TODO: need to at least include the native dependencies here, some way
        //   to let them all through and let forge prune the dev deps?
      }
      return true;
    },
    // extraResource: 'steam_appid.txt',
    afterCopy: [function (buildPath, electronVersion, platform, arch, callback) {
      let src = path.join(__dirname, 'steam_appid.txt');
      let dst = path.join(buildPath, '../../steam_appid.txt');
      fs.cp(src, dst, callback);
    }],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
    },
  ],
  plugins: [
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
