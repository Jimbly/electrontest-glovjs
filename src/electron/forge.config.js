const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true, // TODO: Only in production builds?
    ignore: function (filename) {
      if (!filename || filename === '/' || filename === '/package.json') {
        return false;
      }
      if (filename.endsWith('.map')) { // TODO: Only in production builds?
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
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
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
