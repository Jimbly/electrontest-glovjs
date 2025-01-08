import { cmd_parse } from 'glov/client/cmds';
import type { CrashParam } from 'electron/electron-preload';
import type { CmdRespFunc } from 'glov/common/cmd_parse';

let crash_api = window.glov_electron?.crash;
if (crash_api) {
  crash_api.onError(function (obj: CrashParam) {
    console.log('crashapi: received forwarded error', obj);
    if (window.onerror) {
      window.onerror(obj.msg, obj.file || undefined, obj.line || undefined, obj.col || undefined,
        obj.error as unknown as Error);
    }
  });
}

function crashSoft(): void {
  let a = null! as { b: { c: number } };
  a.b.c++;
}
function rejectSoft(): Promise<null> {
  return new Promise<null>(function (resolve, reject) {
    reject(new Error());
  });
}

cmd_parse.register({
  cmd: 'crash',
  usage: '/crash [main|preload|renderer] [crash|reject] [now|later|hard] [ret]',
  func: function (str: string, resp_func: CmdRespFunc) {
    let where = 'renderer';
    let type = 'crash';
    let when = 'now';
    let ret = false;
    let params = str.split(' ');
    for (let ii = 0; ii < params.length; ++ii) {
      let p = params[ii];
      switch (p) {
        case 'renderer':
        case 'main':
        case 'preload':
          where = p;
          break;
        case 'crash':
        case 'reject':
          type = p;
          break;
        case 'now':
        case 'later':
        case 'hard':
          when = p;
          break;
        case 'ret':
          ret = true;
          break;
        default:
          return void resp_func(`Unable to parse argument "${p}"`);
      }
    }

    if (where === 'renderer') {
      let fn = type === 'crash' ? crashSoft : rejectSoft;
      if (when === 'now') {
        fn();
      } else {
        setTimeout(fn, 100);
      }
    } else {
      if (!crash_api) {
        return resp_func('Electron crash API not presence');
      }
      let func = `${type}_${where}_${when}`;
      if (ret) {
        func += '_ret';
      }
      let fn = crash_api.handlers[func];
      if (!fn) {
        return resp_func(`No handler: "${func}"`);
      }
      fn();
    }
  },
});
