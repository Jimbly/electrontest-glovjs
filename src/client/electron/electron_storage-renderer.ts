// No imports except types and localStorage, need 0% chance of registering settings, etc before our hook
import assert from 'assert';
import { localStorageAddExternalStore } from 'glov/client/local_storage';
import { unpromisify } from 'glov/common/util';
import type { DataObject, TSMap, VoidFunc } from 'glov/common/types';

let electron_storage = window.glov_electron?.storage;

let after_init_cbs: (() => void)[] | null = electron_storage ? [] : null;

let data_store: TSMap<string | DataObject>;

function settingsFile(key: string): string | null {
  // TODO: this is just for ui_test, this needs to be configurable, or a better heuristic
  if (key.startsWith('flag_')) {
    return 'settings-user.json';
  } else if (false) {
    return 'settings-device.json';
  } else if (key.startsWith('uitest.')) {
    return 'file';
  }
  return null;
}

function filenameForKey(key: string): string {
  return `files/${key}.txt`;
}

if (electron_storage) {
  localStorageAddExternalStore({
    test: function (key: string): boolean {
      return Boolean(settingsFile(key));
    },
    get: function (key: string): string | undefined {
      let settings_file = settingsFile(key);
      assert(settings_file);
      if (settings_file === 'file') {
        let entry = data_store[filenameForKey(key)] as string | undefined;
        return entry;
      }
      let obj = data_store[settings_file] as TSMap<string> | undefined;
      if (!obj) {
        return undefined;
      }
      return obj[key];
    },
    set: function (key: string, value: string | undefined): void {
      let settings_file = settingsFile(key);
      assert(settings_file);
      if (settings_file === 'file') {
        electron_storage!.setFile(filenameForKey(key), value);
        return;
      }
      let obj = data_store[settings_file] as TSMap<string> | undefined;
      if (!obj) {
        obj = data_store[settings_file] = {};
      }
      if (value === undefined) {
        delete obj[key];
      } else {
        obj[key] = value;
      }
      electron_storage!.setJSON(settings_file, key, value);
    },
  });
}

export function electronStorageInit(): void {
  if (electron_storage) {
    electron_storage.getAll().then(unpromisify(function (payload: TSMap<string | DataObject>) {
      data_store = payload;
      console.log(`[ELECTRONSTORAGE] Storage initialized, ${Object.keys(data_store).length} files loaded`);
      let cbs = after_init_cbs!;
      after_init_cbs = null;
      for (let ii = 0; ii < cbs.length; ++ii) {
        cbs[ii]();
      }
    }));
  }
}

export function electronStorageWhenReady(cb: VoidFunc): void {
  if (after_init_cbs) {
    after_init_cbs.push(cb);
  } else {
    cb();
  }
}
