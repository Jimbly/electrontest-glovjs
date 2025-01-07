const assert = require('assert');
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
const IGNORE_EXTS = [ // in production builds, but not relevant to electron
  '.mp3', // .oggs should be sufficient and preferred
];

const is_production = process.argv.includes('--production');
const do_asar = is_production;

let after_copy = [function (buildPath, electronVersion, platform, arch, callback) {
  let src = path.join(__dirname, 'steam_appid.txt');
  let dst = path.join(buildPath, '../../steam_appid.txt');
  fs.cp(src, dst, callback);
}];
if (is_production) {
  // Copy the production minified versions of any files into the production electron package
  after_copy.push(function (buildPath, electronVersion, platform, arch, callback) {
    let prod_root = process.argv[process.argv.indexOf('--production') + 1];
    assert(prod_root.endsWith('/client'));
    prod_root = prod_root.slice(0, -'/client'.length);
    let artifacts_root = path.join(buildPath, '../../artifacts');
    // console.log('production overlay from', prod_root, 'to', buildPath, 'and', artifacts_root);
    function walk(dir, done) {
      let build_path = buildPath + (dir ? `/${dir}` : '');
      let prod_path = prod_root + (dir ? `/${dir}` : '');
      let artifacts_path = artifacts_root + (dir ? `/${dir}` : '');
      fs.readdir(prod_path, function (err, files) {
        if (err) {
          return void done(err);
        }
        let idx = 0;
        function step(err) {
          if (err) {
            return void done(err);
          }
          if (idx === files.length) {
            return void done();
          }
          let filename = files[idx++];
          let ext = `.${filename.split('.').pop()}`;
          if (IGNORE_EXTS.includes(ext)) {
            return void step();
          }
          fs.stat(`${build_path}/${filename}`, function (err, stat) {
            if (err) {
              if (err.code === 'ENOENT') {
                if (ext === '.html') {
                  // presumably excluded client target version
                  return void step();
                }
                // Exists in prod, but not in package, send to artifacts
                // console.log(`cp ${prod_path}/${filename} -> ${artifacts_path}/${filename}`);
                return void fs.cp(`${prod_path}/${filename}`, `${artifacts_path}/${filename}`, step);
              }
              return void done(err);
            }
            if (stat.isDirectory()) {
              return void walk(dir ? `${dir}/${filename}` : filename, step);
            }
            // console.log(`cp ${prod_path}/${filename} -> ${build_path}/${filename}`);
            fs.cp(`${prod_path}/${filename}`, `${build_path}/${filename}`, step);
          });
        }
        step();
      });
    }
    walk('', callback);
  });
}

module.exports = {
  outDir: is_production ? 'package-prod' : 'package-dev',
  packagerConfig: {
    asar: do_asar ? {
      // This is similar to `@electron-forge/plugin-auto-unpack-natives`, but also include DLLs, etc
      unpack: `{${UNPACK_EXTS.map((ext) => `**/*${ext}`).join(',')}}`,
    } : false,
    ignore: function (filename) {
      if (!filename || filename === '/' || filename === '/package.json') {
        return false;
      }
      let ext = `.${filename.split('.').pop()}`;
      if (ext === '.map' && is_production) {
        return true;
      }
      if (IGNORE_EXTS.includes(ext)) {
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
    afterCopy: after_copy,
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
      ...(do_asar ? {
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      } : {}),
    }),
  ],
};
