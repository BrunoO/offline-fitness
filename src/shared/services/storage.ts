// https://react-native-async-storage.github.io/async-storage/docs/install
import { STORAGE_KEYS } from '@/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { simpleLogger } from './SimpleLogger';
import type { Activity } from '../types/types';

const ACTIVITY_KEY = STORAGE_KEYS.ACTIVITY_PREFIX;

export const WEBDAV_CONNECTED_KEY = STORAGE_KEYS.WEBDAV_CONNECTED;
export const WEBDAV_BASE_URL_KEY = STORAGE_KEYS.WEBDAV_BASE_URL;
export const WEBDAV_USERNAME_KEY = STORAGE_KEYS.WEBDAV_USERNAME;
export const WEBDAV_PROFILE_KEY = STORAGE_KEYS.WEBDAV_PROFILE;
export const BACKUP_LAST_SYNC_KEY = STORAGE_KEYS.BACKUP_LAST_SYNC;
export const WEBDAV_TOMBSTONES_KEY = STORAGE_KEYS.WEBDAV_TOMBSTONES;
export const MANUAL_LAST_TYPE_KEY = STORAGE_KEYS.MANUAL_LAST_TYPE;
export const MANUAL_CUSTOM_TYPES_KEY = STORAGE_KEYS.MANUAL_CUSTOM_TYPES;
export const RECORDING_LAST_PROFILE_KEY = STORAGE_KEYS.RECORDING_LAST_PROFILE;

export interface StorageSchema {
  [WEBDAV_CONNECTED_KEY]: boolean;
  [WEBDAV_BASE_URL_KEY]: string;
  [WEBDAV_USERNAME_KEY]: string;
  [WEBDAV_PROFILE_KEY]: string;
  [BACKUP_LAST_SYNC_KEY]: number;
  [WEBDAV_TOMBSTONES_KEY]: string;
  [MANUAL_LAST_TYPE_KEY]: string;
  [MANUAL_CUSTOM_TYPES_KEY]: string;
  [RECORDING_LAST_PROFILE_KEY]: string;
}

/**
 * Creates a key for an activity.
 * @param activity The activity to create a key for.
 * @returns The key for the activity.
 */
function makeActivityKey(activity: { id: string }): string {
  return ACTIVITY_KEY + activity.id;
}

/** Shared AsyncStorage write path used by the typed store* helpers. */
async function storeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    simpleLogger.error('ERROR saving key ' + key + ' ' + e);
  }
}

/**
 * Stores an integer value in AsyncStorage.
 * @param key The key to store the value under.
 * @param value The value to store.
 */
export async function storeIntValue(key: string, value: number): Promise<void> {
  await storeJson(key, value);
}

/**
 * Stores a value in AsyncStorage.
 * @param key The key to store the value under.
 * @param value The value to store.
 */
export async function storeValue<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  await storeJson(key, value);
}

/**
 * Stores a string value in AsyncStorage.
 * @param key The key to store the value under.
 * @param value The value to store.
 */
export async function storeStringValue(key: string, value: string): Promise<void> {
  await storeJson(key, value);
}

/**
 * Retrieves an integer value from AsyncStorage.
 * @param key The key to retrieve the value from.
 * @returns The integer value, or 0 if the key does not exist.
 */
export const retrieveIntValue = async (key: string): Promise<number> => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue == null ? 0 : JSON.parse(jsonValue);
  } catch (e) {
    simpleLogger.error('ERROR retrieving key ' + key + e);
    return 0;
  }
};

/**
 * Retrieves a string value from AsyncStorage.
 * @param key The key to retrieve the value from.
 * @returns The string value, or an empty string if the key does not exist.
 */
export const retrieveStringValue = async (key: string): Promise<string> => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue == null ? '' : JSON.parse(jsonValue);
  } catch (e) {
    simpleLogger.error('ERROR retrieving key ' + key + ' ' + e);
    return '';
  }
};

/**
 * Retrieves a value from AsyncStorage.
 * @param key The key to retrieve the value from.
 * @returns The value, or undefined if the key does not exist.
 */
export const retrieveValue = async <K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | undefined> => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    if (jsonValue == null) {
      return undefined;
    }
    return JSON.parse(jsonValue) as StorageSchema[K];
  } catch (e) {
    simpleLogger.error('ERROR retrieving key ' + key + ' ' + e);
    return undefined;
  }
};

/**
 * Stores multiple activities in AsyncStorage.
 * @param activities The activities to store.
 */
export const storeMultiActivities = async (activities: Activity[]): Promise<void> => {
  const toStore: [string, string][] = activities.map((a: Activity) => [
    makeActivityKey(a),
    JSON.stringify(a)
  ]);
  try {
    await AsyncStorage.multiSet(toStore);
  } catch (e) {
    simpleLogger.error('ERROR saving activities ' + e);
  }
};

/**
 * Stores a single activity in AsyncStorage.
 * @param activity The activity to store.
 */
export const storeActivity = async (activity: Activity): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(activity);
    await AsyncStorage.setItem(makeActivityKey(activity), jsonValue);
  } catch (e) {
    simpleLogger.error('ERROR saving activity ' + e);
  }
};

/**
 * Removes a single activity from AsyncStorage.
 * @param activity The activity to remove.
 */
export const removeActivity = async (activity: Activity): Promise<void> => {
  try {
    await AsyncStorage.removeItem(makeActivityKey(activity));
  } catch (e) {
    simpleLogger.error('ERROR removing activity ' + e);
  }
};

// --- WebDAV backup tombstones ---------------------------------------------
// Deleted-activity ids awaiting propagation to the backup server, mapped to
// their deletion time. A tombstone is removed only once the push has applied
// it remotely (or the activity came back locally first: local wins).

export type ActivityTombstones = Record<string, string>;

export const retrieveActivityTombstones = async (): Promise<ActivityTombstones> => {
  try {
    const raw = await AsyncStorage.getItem(WEBDAV_TOMBSTONES_KEY);
    return raw ? (JSON.parse(raw) as ActivityTombstones) : {};
  } catch (e) {
    simpleLogger.error('ERROR loading backup tombstones ' + e);
    return {};
  }
};

export const storeActivityTombstones = async (tombstones: ActivityTombstones): Promise<void> => {
  try {
    await AsyncStorage.setItem(WEBDAV_TOMBSTONES_KEY, JSON.stringify(tombstones));
  } catch (e) {
    simpleLogger.error('ERROR saving backup tombstones ' + e);
  }
};

/**
 * Records a deleted activity so the next backup push removes it remotely.
 * Deliberately NOT called by removeAllActivities (wiping the device must
 * not delete the backup).
 */
export const addActivityTombstone = async (id: string): Promise<void> => {
  const tombstones = await retrieveActivityTombstones();
  tombstones[id] = new Date().toISOString();
  await storeActivityTombstones(tombstones);
};

/**
 * Gets all activity keys from AsyncStorage.
 * @returns An array of all activity keys.
 */
export const getAllActivitiesKeys = async (): Promise<string[]> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter(k => k.startsWith(ACTIVITY_KEY));
  } catch (e) {
    simpleLogger.error('ERROR getting keys ' + e);
    return [];
  }
};

/**
 * Loads all activities from AsyncStorage.
 * @param keys The keys of the activities to load.
 * @returns An array of all activities.
 */
export const loadAllActivities = async (keys: readonly string[]): Promise<Activity[]> => {
  simpleLogger.log('trying to load #keys=' + keys.length);
  try {
    const values = await AsyncStorage.multiGet(keys);
    return values.map(([, value]) => {
      const activity = JSON.parse(value!);
      if (activity.type === 'Swim') {
        // strava does not support swimming activities
        // this is a workaround
        // they just recommend to use a watch instead of the app
        // in my case elapsed_time is a good enough approx of moving_time
        //
        // Since `applySwimMovingTime` the importers store this canonically,
        // so for imported records this is a no-op that also protects the
        // backup md5 (push hashes what it loads). It still matters for
        // records written by older builds.
        activity.moving_time = activity.elapsed_time;
      }
      return activity;
    });
  } catch (e) {
    simpleLogger.error('ERROR loading all activities ' + e);
    return [];
  }
};

/**
 * Removes all activities from AsyncStorage.
 */
export const removeAllActivities = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const activityKeys = keys.filter(k => k.startsWith(ACTIVITY_KEY));
    await AsyncStorage.multiRemove(activityKeys);
    simpleLogger.log('Done removing activities');
  } catch (e) {
    simpleLogger.error('error while removing activities ', e);
  }
};

/**
 * Removes all keys from AsyncStorage.
 */
export const removeAppKeys = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    simpleLogger.log(`Keys: ${keys}`); // Just to see what's going on
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    simpleLogger.error('error while removing keys ', e);
  }
  simpleLogger.log('Done');
};
