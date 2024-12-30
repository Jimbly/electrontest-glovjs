import assert from 'assert';
import { loadPendingDelta } from 'glov/client/engine';
import {
  fetchJSON2Timeout,
  scoreGetAuthHost,
  scoreLSD,
  scoreUserProviderSet,
} from 'glov/client/score';
import { callEach } from 'glov/common/util';

import type { SteamInitResponse } from 'electron/electron-preload';
import type { ErrorCallback, VoidFunc } from 'glov/common/types';

const AUTH_CACHE_KEY = 'auth.cache';
const AUTH_REFRESH_TIME = 10*60; // refresh a new token if we're going to expire within 10 minutes

let steam_api = window.glov_electron?.steam;
let cur_steam_ids: string;

let steam_init_data: SteamInitResponse;

type AuthResponse = {
  expire: number;
  token: string;
};

function steamScoreGetUserID(cb: ErrorCallback<string, string>): void {
  cb(null, `s${steam_init_data.steam_id}`);
}

type AuthCache = AuthResponse & {
  steam_ids: string;
};
let auth_cache: AuthCache | null = null;
let auth_query_in_flight: null | ErrorCallback<string | null, string>[] = null;
function steamScoreGetAuthToken(cb: null | ErrorCallback<string | null, string>): void {
  if (auth_cache) {
    let now_seconds = Date.now()/1000;
    if (auth_cache.expire < now_seconds) {
      // expired
      auth_cache = null;
    } else if (auth_cache.expire < now_seconds + AUTH_REFRESH_TIME) {
      // ask for new one (async), but use the one we've got
      cb?.(null, auth_cache.token);
      cb = null;
    } else {
      // just use the one we've got
      return cb?.(null, auth_cache.token);
    }
  }
  if (auth_query_in_flight) {
    if (cb) {
      auth_query_in_flight.push(cb);
    }
    return;
  }
  auth_query_in_flight = [];
  if (cb) {
    auth_query_in_flight.push(cb);
  }
  steam_api!.getEncryptedAppTicket('auth', function (err: string | null, ticket?: string): void {
    if (err) {
      // If getting an error here, likely Steam is in Offline mode, or is offline
      callEach(auth_query_in_flight, auth_query_in_flight = null, err);
      return;
    }
    // post to auth endpoint
    let userid = `s${steam_init_data.steam_id}`;
    let url = `${scoreGetAuthHost()}/api/auth?userid=${userid}&ticket=${ticket}`;
    fetchJSON2Timeout<AuthResponse>(url, 20000, function (err: string | undefined, res: AuthResponse) {
      if (err) {
        callEach(auth_query_in_flight, auth_query_in_flight = null, err);
        return;
      }
      assert(res);
      assert(res.expire);
      assert(res.token);
      assert.equal(typeof res.token, 'string');
      auth_cache = {
        steam_ids: cur_steam_ids,
        ...res,
      };
      scoreLSD()[AUTH_CACHE_KEY] = JSON.stringify(auth_cache);
      callEach(auth_query_in_flight, auth_query_in_flight = null, null, res.token);
    });
  });
}

export function steamInit(next: VoidFunc): void {

  if (!steam_api) {
    return next();
  }
  loadPendingDelta(1);
  steam_api.init(function (err: string | null, payload?: SteamInitResponse) {
    if (err || !payload!.initialized) {
      console.log('[STEAM] Steam failed to initialize', err);
    } else {
      assert(payload);
      steam_init_data = payload;
      console.log(`[STEAM] Steam initialized, AppID=${steam_init_data.app_id}, SteamID=${steam_init_data.steam_id}`);
      cur_steam_ids = `${steam_init_data.app_id},${steam_init_data.steam_id}`;
      let cache_str = scoreLSD()[AUTH_CACHE_KEY];
      if (cache_str) {
        try {
          let cache_entry = JSON.parse(cache_str) as AuthCache;
          if (cache_entry.steam_ids === cur_steam_ids) {
            auth_cache = cache_entry;
          }
        } catch (e) {
          console.error('Error parsing auth cache:', e);
        }
      }

      scoreUserProviderSet({
        provider_id: 'steam',
        getUserID: steamScoreGetUserID,
        getAuthToken: steamScoreGetAuthToken,
      });
    }
    loadPendingDelta(-1);
    next();
  });
}
