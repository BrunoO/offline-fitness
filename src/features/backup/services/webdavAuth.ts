import { simpleLogger } from '@/shared';
import * as Storage from '@/shared/services/storage';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { WebDavConfig, testDavConnection } from './webdavTransport';

/**
 * WebDAV backup configuration: server collection URL + username in
 * AsyncStorage, password in expo-secure-store (keychain/keystore — a
 * credential must not sit in plain AsyncStorage). "Connected" simply means
 * a stored config whose credentials last passed a PROPFIND test; there is
 * no session or token to manage, unlike the old Google Drive flow.
 */

const PASSWORD_KEY = 'webdav_backup_password';

export async function saveWebDavConfig(
  config: Omit<WebDavConfig, 'password'>,
  password: string
): Promise<void> {
  await Storage.storeStringValue(Storage.WEBDAV_BASE_URL_KEY, config.baseUrl);
  await Storage.storeStringValue(Storage.WEBDAV_USERNAME_KEY, config.username);
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
  await Storage.storeStringValue(Storage.WEBDAV_CONNECTED_KEY, '1');
}

export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  const baseUrl = await Storage.retrieveStringValue(Storage.WEBDAV_BASE_URL_KEY);
  const username = await Storage.retrieveStringValue(Storage.WEBDAV_USERNAME_KEY);
  if (!baseUrl || !username) return null;
  const password = await SecureStore.getItemAsync(PASSWORD_KEY);
  if (password === null) return null;
  return { baseUrl, username, password };
}

export async function clearWebDavConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
  await Storage.storeStringValue(Storage.WEBDAV_BASE_URL_KEY, '');
  await Storage.storeStringValue(Storage.WEBDAV_USERNAME_KEY, '');
  await Storage.storeStringValue(Storage.WEBDAV_CONNECTED_KEY, '0');
}

export type WebDavBackupHook = {
  isConfigured: boolean;
  baseUrl: string;
  username: string;
  connect: (config: Omit<WebDavConfig, 'password'>, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
  retrieveConnection: () => Promise<void>;
};

/**
 * Hook for the drawer's WebDAV backup section. Unlike Google, connecting
 * is just: validate the credentials with a PROPFIND, then persist them.
 */
export function useWebDavBackup(): WebDavBackupHook {
  const [isConfigured, setConfigured] = React.useState(false);
  const [baseUrl, setBaseUrl] = React.useState('');
  const [username, setUsername] = React.useState('');

  const retrieveConnection = React.useCallback(async () => {
    const config = await loadWebDavConfig();
    setBaseUrl(config?.baseUrl ?? '');
    setUsername(config?.username ?? '');
    setConfigured(config !== null);
  }, []);

  const connect = React.useCallback(
    async (config: Omit<WebDavConfig, 'password'>, password: string) => {
      await testDavConnection({ ...config, password });
      await saveWebDavConfig(config, password);
      setBaseUrl(config.baseUrl);
      setUsername(config.username);
      setConfigured(true);
      simpleLogger.log('WebDAV backup connected', { baseUrl: config.baseUrl });
    },
    []
  );

  const disconnect = React.useCallback(async () => {
    await clearWebDavConfig();
    setBaseUrl('');
    setUsername('');
    setConfigured(false);
  }, []);

  return { isConfigured, baseUrl, username, connect, disconnect, retrieveConnection };
}
