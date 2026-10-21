import { APP_CONFIG } from '@/constants';
import { simpleLogger } from '@/shared';
import * as Storage from '@/shared/services/storage';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { WebDavConfig, ensureDavFolder, testDavConnection } from './webdavTransport';

/**
 * WebDAV backup configuration: server root URL + username + profile label in
 * AsyncStorage, password in expo-secure-store (keychain/keystore — a
 * credential must not sit in plain AsyncStorage). "Connected" simply means
 * a stored config whose credentials last passed a PROPFIND test; there is
 * no session or token to manage, unlike the old Google Drive flow.
 *
 * Layout on the server — the user types the account root, the app composes
 * the collection:
 *
 *   <root>/offline-fitness/<profile>/
 *     collection.json   ← app id + profile + layout version that own this folder
 *     activities/       ← <activityId>.json
 *     streams/          ← <activityId>.json (layout version 2: binary 'OF' payload)
 *     sync-state.json   ← md5 index + tombstones
 *
 * The app id keeps this app's data apart from any other app on the same
 * account; the profile label keeps two athletes sharing one account apart
 * from each other. The label identifies the *athlete*, not the device: the
 * same person on two phones uses the same label, so they share one backup.
 */

const PASSWORD_KEY = 'webdav_backup_password';

const PROFILE_MAX_LENGTH = 64;
// A label becomes a folder name, so it is restricted to characters that are
// safe in a URL path without escaping. Restricting (rather than encoding)
// keeps the path readable and avoids double-encoding surprises.
const PROFILE_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * The collection URL for a server root and profile label. Exported so the
 * UI can show the resolved path (a typo in a label is otherwise invisible).
 */
export function collectionUrlFor(rootUrl: string, profile: string): string {
  const root = rootUrl.replace(/\/+$/, '');
  return `${root}/${APP_CONFIG.BACKUP_APP_ID}/${profile}`;
}

/**
 * Validates a profile label. Returns an error message, or null when the
 * label is acceptable. The label is required: it is the only thing keeping
 * two athletes on one account from writing into the same collection.
 */
export function validateProfile(profile: string): string | null {
  const trimmed = profile.trim();
  if (trimmed.length === 0) {
    return 'A profile name is required. It separates your backup from others using the same account.';
  }
  if (trimmed.length > PROFILE_MAX_LENGTH) {
    return `The profile name must be ${PROFILE_MAX_LENGTH} characters or fewer.`;
  }
  if (!PROFILE_PATTERN.test(trimmed)) {
    return 'The profile name may only contain letters, digits, dots, dashes and underscores.';
  }
  if (trimmed === '.' || trimmed === '..') {
    return 'The profile name cannot be "." or "..".';
  }
  return null;
}

export async function saveWebDavConfig(
  config: { rootUrl: string; username: string; profile: string },
  password: string
): Promise<void> {
  await Storage.storeStringValue(Storage.WEBDAV_BASE_URL_KEY, config.rootUrl);
  await Storage.storeStringValue(Storage.WEBDAV_USERNAME_KEY, config.username);
  await Storage.storeStringValue(Storage.WEBDAV_PROFILE_KEY, config.profile);
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
  await Storage.storeStringValue(Storage.WEBDAV_CONNECTED_KEY, '1');
}

export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  const rootUrl = await Storage.retrieveStringValue(Storage.WEBDAV_BASE_URL_KEY);
  const username = await Storage.retrieveStringValue(Storage.WEBDAV_USERNAME_KEY);
  const profile = await Storage.retrieveStringValue(Storage.WEBDAV_PROFILE_KEY);
  if (!rootUrl || !username || !profile) return null;
  const password = await SecureStore.getItemAsync(PASSWORD_KEY);
  if (password === null) return null;
  return {
    baseUrl: collectionUrlFor(rootUrl, profile),
    rootUrl,
    profile,
    username,
    password
  };
}

export async function clearWebDavConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
  await Storage.storeStringValue(Storage.WEBDAV_BASE_URL_KEY, '');
  await Storage.storeStringValue(Storage.WEBDAV_USERNAME_KEY, '');
  await Storage.storeStringValue(Storage.WEBDAV_PROFILE_KEY, '');
  await Storage.storeStringValue(Storage.WEBDAV_CONNECTED_KEY, '0');
}

export type WebDavBackupHook = {
  isConfigured: boolean;
  rootUrl: string;
  username: string;
  profile: string;
  /** The resolved collection on the server, shown so a typo is visible. */
  collectionUrl: string;
  connect: (
    config: {
      rootUrl: string;
      username: string;
      profile: string;
    },
    password: string
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  retrieveConnection: () => Promise<void>;
};

/**
 * Hook for the drawer's WebDAV backup section. Unlike Google, connecting
 * is just: validate the credentials with a PROPFIND, then persist them.
 */
export function useWebDavBackup(): WebDavBackupHook {
  const [isConfigured, setConfigured] = React.useState(false);
  const [rootUrl, setRootUrl] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [profile, setProfile] = React.useState('');

  const retrieveConnection = React.useCallback(async () => {
    const config = await loadWebDavConfig();
    setRootUrl(config?.rootUrl ?? '');
    setUsername(config?.username ?? '');
    setProfile(config?.profile ?? '');
    setConfigured(config !== null);
  }, []);

  const connect = React.useCallback(
    async (config: { rootUrl: string; username: string; profile: string }, password: string) => {
      const profileError = validateProfile(config.profile);
      if (profileError) throw new Error(profileError);

      const credentials = { username: config.username, password };
      const profile = config.profile.trim();
      // Check the account root first: the collection does not exist yet.
      await testDavConnection({
        ...credentials,
        baseUrl: config.rootUrl,
        rootUrl: config.rootUrl,
        profile
      });

      // Create <root>/offline-fitness/<profile>/ — one level at a time, a
      // server rejects a nested MKCOL whose parent is missing.
      await ensureDavFolder(
        { ...credentials, baseUrl: config.rootUrl, rootUrl: config.rootUrl, profile },
        APP_CONFIG.BACKUP_APP_ID,
        profile
      );

      // Confirm the collection itself is reachable with these credentials.
      const collectionUrl = collectionUrlFor(config.rootUrl, profile);
      await testDavConnection({
        ...credentials,
        baseUrl: collectionUrl,
        rootUrl: config.rootUrl,
        profile
      });

      await saveWebDavConfig(
        { rootUrl: config.rootUrl, username: config.username, profile: config.profile.trim() },
        password
      );
      setRootUrl(config.rootUrl);
      setUsername(config.username);
      setProfile(config.profile.trim());
      setConfigured(true);
      simpleLogger.log('WebDAV backup connected', { rootUrl: config.rootUrl, profile });
    },
    []
  );

  const disconnect = React.useCallback(async () => {
    await clearWebDavConfig();
    setRootUrl('');
    setUsername('');
    setProfile('');
    setConfigured(false);
  }, []);

  return {
    isConfigured,
    rootUrl,
    username,
    profile,
    collectionUrl: profile ? collectionUrlFor(rootUrl, profile) : '',
    connect,
    disconnect,
    retrieveConnection
  };
}
