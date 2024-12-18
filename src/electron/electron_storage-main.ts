import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  IpcMainInvokeEvent,
  app,
  ipcMain,
} from 'electron/main';

function forwardSlashes(str: string): string {
  return str.replace(/\\/g, '/');
}

let storage_root: string; // no trailing slash

let after_init_cbs: (() => void)[] | null = [];

export type DataObject = Partial<Record<string, unknown>>;

let data_store: Partial<Record<string, string | DataObject>> = Object.create(null);

let flush_queue: string[] = [];
let flush_in_progress = false;

function flushStep(): void {
  if (!flush_queue.length || flush_in_progress) {
    return;
  }
  flush_in_progress = true;
  let file = flush_queue.shift()!;
  let data = data_store[file];
  if (file.endsWith('.json')) {
    data = JSON.stringify(data, undefined, 2);
  }
  assert(typeof data === 'string');
  let output_file = `${storage_root}/${file}`;
  function writeFile(): void {
    assert(typeof data === 'string');
    fs.writeFile(output_file, data, function (err) {
      flush_in_progress = false;
      setImmediate(flushStep);
      if (err) {
        throw err;
      }
    });
  }
  if (file.includes('/')) {
    fs.mkdir(path.dirname(output_file), { recursive: true }, writeFile);
  } else {
    writeFile();
  }
}

function flushFile(file: string): void {
  if (flush_queue.includes(file)) {
    return;
  }
  flush_queue.push(file);
  setImmediate(flushStep);
}

function initDone(): void {
  console.log(`[ELECTRONSTORAGE] Storage initialized, ${Object.keys(data_store).length} files loaded`);
  let cbs = after_init_cbs!;
  after_init_cbs = null;
  for (let ii = 0; ii < cbs.length; ++ii) {
    cbs[ii]();
  }
}

function scanStorage(): void {
  let left = 0;
  function done(): void {
    --left;
    if (!left) {
      initDone();
    }
  }
  function scanDir(dir: string): void {
    ++left;
    let disk_dir = `${storage_root}${dir ? '/' : ''}${dir}`;
    fs.readdir(disk_dir, function (err, files: string[]) {
      if (err) {
        throw err;
      }
      files.forEach(function (filename) {
        if (filename[0] === '.') {
          return;
        }
        let file_disk_dir = `${disk_dir}/${filename}`;
        let file_dir = `${dir}${dir ? '/' : ''}${filename}`;
        ++left;
        fs.stat(file_disk_dir, function (err, stats) {
          if (err) {
            console.error(`Error statting ${file_disk_dir}`, err);
            return done();
          }
          if (stats.isDirectory()) {
            scanDir(file_dir);
            return done();
          }
          fs.readFile(file_disk_dir, 'utf8', function (err, data) {
            if (err) {
              console.error(`Error reading ${file_disk_dir}`, err);
              return done();
            }
            if (filename.endsWith('.json')) {
              try {
                data = JSON.parse(data);
              } catch (e) {
                console.error(`Error parsing ${file_disk_dir}`, e);
                return done();
              }
            }
            data_store[file_dir] = data;
            done();
          });
        });
      });
      done();
    });
  }
  scanDir('');
}

export function electronStorageInit(): void {
  // getAppPath =
  //    start: dist/game/build.electron
  //    pkg'd: dist/game/build.electron/out/glov-build-electron-win32-x64/resources/app.asar
  // getPath('exe') =
  //    start: dist\game\build.electron\node_modules\electron\dist\electron.exe
  //    pkg'd: dist\game\build.electron\out\glov-build-electron-win32-x64\glov-build-electron.exe
  let exe_path = forwardSlashes(app.getPath('exe'));
  if (exe_path.endsWith('/electron.exe') || exe_path.endsWith('/electron')) {
    // development, use getAppPath
    let app_path = forwardSlashes(app.getAppPath());
    if (app_path.endsWith('/')) {
      app_path = app_path.slice(0, -1);
    }
    if (app_path.endsWith('/dist/game/build.electron')) {
      // development running of electron-start
      storage_root = app_path.slice(0, app_path.length - '/dist/game/build.electron'.length);
    } else {
      // old path, should never happen?
      storage_root = app_path;
    }
  } else {
    // Running something packaged
    storage_root = path.dirname(exe_path);
  }
  storage_root = `${storage_root}/user`;
  console.log(`[ELECTRONSTORAGE] Using storage path: "${storage_root}"`);
  fs.exists(storage_root, function (exists) {
    if (exists) {
      return scanStorage();
    }
    fs.mkdir(storage_root, function (err) {
      if (err) {
        console.error(`Failed to create storage directory "${storage_root}":`, err);
        storage_root = forwardSlashes(`${app.getPath('userData')}/glov-user`);
        console.error(`Using fallback storage directory "${storage_root}"`);
        if (!fs.existsSync(storage_root)) {
          fs.mkdirSync(storage_root);
        }
      }
      scanStorage();
    });
  });

  ipcMain.handle('electron-storage-get-all', function () {
    return Promise.resolve(data_store);
  });
  ipcMain.handle('electron-storage-set-json', function (
    event: IpcMainInvokeEvent,
    file: string,
    field: string,
    value: string | undefined
  ) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    electronStorageSetJSON(file, field, value);
  });
}

export function electronStorageWhenReady(cb: () => void): void {
  if (after_init_cbs) {
    after_init_cbs.push(cb);
  } else {
    cb();
  }
}

export function electronStorageGetJSON<T=unknown>(file: string, field: string, def: T): T {
  assert(file.endsWith('.json'));
  let obj = data_store[file];
  if (obj) {
    assert(typeof obj === 'object');
  } else {
    obj = {};
  }
  let ret = obj[field];
  return ret === undefined ? def : ret as T;
}

export function electronStorageSetJSON(file: string, field: string, value: unknown): void {
  assert(file.endsWith('.json'));
  let obj = data_store[file];
  if (obj) {
    assert(typeof obj === 'object');
  } else {
    data_store[file] = obj = {};
  }
  if (obj[field] === value) {
    return;
  }
  if (value === undefined) {
    delete obj[field];
  } else {
    obj[field] = value;
  }

  flushFile(file);
}
