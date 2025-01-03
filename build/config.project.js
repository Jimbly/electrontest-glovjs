const argv = require('minimist')(process.argv.slice(2));
const exec = require('./exec.js');
const sourcemapRemap = require('./sourcemap-remap');

function copy(job, done) {
  job.out(job.getFile());
  done();
}

module.exports = function (config, gb) {
  config.bundles.push({
    entrypoint: 'worker',
    deps: 'worker_deps',
    is_worker: true,
    do_version: null,
  });
  config.extra_index.push({
    name: 'multiplayer',
    defines: {
      PLATFORM: 'web',
      ENV: 'multiplayer',
    },
    zip: false,
  }, {
    name: 'entity',
    defines: {
      PLATFORM: 'web',
      ENV: 'entity',
    },
    zip: false,
  }, {
    // example .zip for itch.io publishing
    name: 'itch',
    defines: {
      ...config.default_defines,
      PLATFORM: 'web',
    },
    zip: true,
  });

  // Spine support
  // Note: Runtime requires a Spine license to use in any product.
  config.client_fsdata.push(
    'client/spine/**.atlas',
    'client/spine/**.skel',
    'client/spine/**.json',
  );


  //////////////////////////////////////////////////////////////////////////
  // Electron support
  gb.task({
    name: 'electron-from-dev',
    input: [
      'client_dev_outputs:**',
      'client_dev_outputs:!**/*.bundle.js',
      'client_dev_outputs:!client/*.html', // exclude other index.htmls
      // 'client_dev_outputs:client/index_entity.html',
      // 'client_dev_outputs:client/index_multiplayer.html',
      'client_dev_outputs:client/index.html',
      'server_dev_outputs:electron/**',
      'server_dev_outputs:!electron/forge.config.js*',
      'electron/greenworks/lib/**',
    ],
    target: 'electron',
    type: gb.SINGLE,
    func: copy,
  });
  gb.task({
    name: 'electron-bundles',
    input: [
      'client_dev_outputs:**/*.bundle.js',
    ],
    target: 'electron',
    type: gb.SINGLE,
    ...sourcemapRemap(function (job, filename, next) {
      // don't require a dev server running for electron-start
      filename = filename.replace(/^https?:\/\/localhost(?::\d+)?\//, '');
      next(null, filename);
    }),
  });
  gb.task({
    name: 'electron-to-root',
    input: [
      'electron/package*.json',
      'electron/forge.config.js',
      'electron/steam_appid.txt',
    ],
    target: 'electron',
    type: gb.SINGLE,
    func: function (job, done) {
      let file = job.getFile();
      job.out({
        relative: file.relative.split('/').pop(),
        contents: file.contents,
      });
      done();
    }
  });
  gb.task({
    name: 'electron-npm-install',
    input: [
      'electron-to-root:package*.json',
    ],
    ...exec({
      await: true,
      cwd: 'dist/game/build.electron',
      cmd: 'npm',
      args: [
        'install',
        '--no-fund',
        '--no-audit',
        '--no-save',
      ],
      stdio: 'inherit',
      shell: true,
      do_versioning: true,
    }),
  });
  function forge(args) {
    return {
      cwd: 'dist/game/build.electron',
      cmd: 'node',
      args: [
        'node_modules/@electron-forge/cli/dist/electron-forge.js',
      ].concat(args),
      stdio: 'inherit',
    };
  }
  gb.task({
    name: 'electron-start',
    deps: ['electron-npm-install'],
    input: [
      'electron-to-root:**',
      'server_dev_outputs:electron/**',
      'electron-from-dev:client/**',
      'electron-bundles:**',
    ],
    ...exec(forge([
      'start',
      // '--enable-logging',
      '--inspect-electron',
      // '--inspect-brk-electron',
    ].concat(argv.steam === false ? ['--', '--no-steam'] : []))),
  });

  gb.task({
    name: 'electron-start-dev',
    deps: [
      'build_deps', // for linting, typescript, etc
      'electron-start',
    ],
  });

  gb.task({
    name: 'electron-package-dev',
    deps: ['electron-npm-install'],
    input: [
      'electron-to-root:**',
      'server_dev_outputs:electron/**',
      'electron-from-dev:client/**',
      'electron-bundles:**',
    ],
    ...exec({
      ...forge([
        'package',
      ]),
      await: true,
      do_versioning: true,
    }),
  });

  // TODO: electron-package-prod - does similar as all of above (also a
  //   electron-start-prod for testing?) but with prod output files, and also
  //   has build_deps as a dep so it errors if TypeScript/eslint fails
};
