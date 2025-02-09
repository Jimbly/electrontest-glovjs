//////////////////////////////////////////////////////////////////////////
// Opinionated Electron support

const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const exec = require('./exec.js');
const sourcemapRemap = require('./sourcemap-remap');

function copy(job, done) {
  job.out(job.getFile());
  done();
}

module.exports = function (gb) {
  gb.addTarget('electron', path.join(__dirname, '../dist/game/build.electron'));

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
    name: 'electron-from-prod',
    input: [
      'prod.posthash:**',
    ],
    type: gb.SINGLE,
    func: function (job, done) {
      let file = job.getFile();
      let { relative } = file;
      if (!relative.endsWith('.js')) {
        job.out(file);
        return void done();
      }
      sourcemapRemap(function (job2, filename, next) {
        filename = filename.replace(/^https?:\/\/localhost(?::\d+)?\/sourcemap\/auto\/\d+\//, '../../../artifacts/client/');
        next(null, filename);
      }).func(job, done);
    },
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
      stdio: ['ignore', 'inherit', 'inherit'],
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
      stdio: ['ignore', 'inherit', 'inherit'],
    };
  }
  gb.task({
    name: 'electron-start',
    deps: ['electron-npm-install'],
    input: [
      'electron-to-root:**',
      'electron-from-dev:**',
      'electron-bundles:**',
    ],
    ...exec(forge([
      'start',
      // '--enable-logging',
      // '--inspect-electron',
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
      'electron-from-dev:**',
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

  gb.task({
    name: 'electron-package-prod',
    deps: [
      'electron-npm-install',
      'build_deps', // so that a TypeScript/eslint failure fails the build
    ],
    input: [
      'electron-to-root:**',
      'electron-from-dev:**',
      'electron-from-prod:client/**',
      //'electron-bundles:**',
    ],
    ...exec({
      ...forge([
        'package',
        '--',
        '--production',
        'electron-from-prod:client',
      ]),
      await: true,
      do_versioning: true,
    }),
  });
};
