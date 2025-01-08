import assert from 'assert';
import { loadPendingDelta } from 'glov/client/engine';
import {
  ScoreUserInfo,
  fetchJSON2Timeout,
  scoreGetAuthHost,
  scoreLSD,
  scoreUserProviderSet,
} from 'glov/client/score';
import { platformOverrideParameter } from 'glov/common/platform';
import { callEach, unpromisify as utilUnpromisify } from 'glov/common/util';
import './electron_debug'; // for command registration

import type { SteamInitResponse } from 'electron/electron-preload';
import type { ErrorCallback, TSMap, VoidFunc } from 'glov/common/types';

export type Unpromisified<F> = {
  f: F;
  unpromisified: true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function electronUnpromisify<P extends any[], T=never>(
  f: (this: T, ...args: P) => void
): Unpromisified<(this: T, ...args: P) => void> {
  return {
    f: utilUnpromisify(f),
    unpromisified: true,
  };
}

const AUTH_CACHE_KEY = 'auth.cache';
const AUTH_REFRESH_TIME = 10*60; // refresh a new token if we're going to expire within 10 minutes

let steam_api = window.glov_electron?.steam;
let cur_steam_ids: string;

let steam_init_data: SteamInitResponse;

let last_rich_presence_keys: string[] = [];
function steamRichPresenceSet(status: string | null, others: TSMap<string> | null): void {
  assert(steam_api);
  if (!status) {
    steam_api.clearRichPresence();
    last_rich_presence_keys = [];
  } else {
    // steam_api.setRichPresence('status', 'In Menus'); // text only shown when friend clicks "get game info"
    // steam_api.setRichPresence('connect', null);
    // steam_api.setRichPresence('steam_display', '#StatusInMenus'); // LOCALIZED key to show in chat / friends list
    // steam_api.setRichPresence('steam_player_group', 'some UID');

    steam_api.setRichPresence('status', status);
    let seen_keys: TSMap<true> = {};
    for (let key in others) {
      let value: string = others[key]!;
      steam_api.setRichPresence(key, value);
      if (value) {
        seen_keys[key] = true;
      }
    }
    for (let ii = 0; ii < last_rich_presence_keys.length; ++ii) {
      let key = last_rich_presence_keys[ii];
      if (!seen_keys) {
        steam_api.setRichPresence(key, null);
      }
    }
    last_rich_presence_keys = Object.keys(seen_keys);
  }
}

type AuthResponse = {
  expire: number;
  token: string;
};

function steamScoreGetAccountInfo(cb: ErrorCallback<ScoreUserInfo, string>): void {
  cb(null, {
    user_id: `s${steam_init_data.steam_id}`,
    display_name: steam_init_data.display_name || null,
  });
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
  steam_api!.getEncryptedAppTicket('auth', electronUnpromisify(function (err: string | null, ticket?: string): void {
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
  }));
}

export function steamAchievementSet(api_name: string, unlocked: boolean): void {
  assert(steam_api);
  if (unlocked) {
    steam_api.activateAchievement(api_name);
  } else {
    steam_api.clearAchievement(api_name);
  }
}

export function steamAchievementShowProgress(api_name: string, cur: number, max: number): void {
  assert(steam_api);
  steam_api.indicateAchievementProgress(api_name, cur, max);
}

// In theory can get a timestamp here but, Greenworks doesn't provide it
export function steamAchievementGet(api_name: string, cb: ErrorCallback<boolean>): void {
  assert(steam_api);
  steam_api.getAchievement(api_name, electronUnpromisify(cb));
}

export function steamAchievementGetNames(cb: ErrorCallback<string[]>): void {
  assert(steam_api);
  steam_api.getAchievementNames(electronUnpromisify(cb));
}

export function steamStatGet(stat_name: string, cb: ErrorCallback<number>): void {
  assert(steam_api);
  steam_api.getStatInt(stat_name, electronUnpromisify(cb));
}

export function steamStatSet(stat_name: string, value: number): void {
  assert(steam_api);
  steam_api.setStat(stat_name, value);
  assert(false, 'Must add periodic code to call steamStoreStats() for this to work');
}

export function steamStatsStore(): void {
  assert(steam_api);
  steam_api.storeStats();
}

export function steamInit(next: VoidFunc): void {

  if (!steam_api) {
    return next();
  }
  loadPendingDelta(1);
  steam_api.init(electronUnpromisify(function (err: string | null, payload?: SteamInitResponse) {
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
        getAccountInfo: steamScoreGetAccountInfo,
        getAuthToken: steamScoreGetAuthToken,
        setName: null,
      });
      platformOverrideParameter('setRichPresence', steamRichPresenceSet);
    }
    loadPendingDelta(-1);
    next();
  }));
}
