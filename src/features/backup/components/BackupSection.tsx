import { blueGrey300, gray100, gray800 } from '@/constants/colors';
import { compareActivitiesByUtcDesc, simpleLogger } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { useActivitiesDataContext } from '@/features/activities';
import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native';
import { RestoreSummary, SyncProgress, pullBackupNow, pushBackupNow } from '../services/backupSync';
import { useWebDavBackup } from '../services/webdavAuth';

function formatLastSync(isoString: string): string {
  if (!isoString) return 'Never synced';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? 'Never synced' : `Last sync: ${date.toLocaleString()}`;
}

/**
 * WebDAV backup controls for the drawer. Unconfigured: a small form for
 * the server collection URL, username and password, validated with a
 * PROPFIND before being saved. Configured: manual push-only "Sync now"
 * plus disconnect. No automatic syncing happens.
 */
export function BackupSection() {
  const colorScheme = useColorScheme();
  const { isConfigured, baseUrl, username, connect, retrieveConnection, disconnect } =
    useWebDavBackup();
  const { setGlobalActivities, setTotalActivitiesStored } = useActivitiesDataContext();

  const [serverUrl, setServerUrl] = React.useState('');
  const [serverUser, setServerUser] = React.useState('');
  const [serverPassword, setServerPassword] = React.useState('');
  const [isTesting, setTesting] = React.useState(false);
  const [isSyncing, setSyncing] = React.useState(false);
  const [isRestoring, setRestoring] = React.useState(false);
  const [lastSync, setLastSync] = React.useState('');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    retrieveConnection().catch(error => {
      simpleLogger.error('Failed to retrieve WebDAV configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    Storage.retrieveStringValue(Storage.BACKUP_LAST_SYNC_KEY)
      .then(setLastSync)
      .catch(() => undefined);
  }, [retrieveConnection]);

  const handleConnect = async () => {
    if (!serverUrl.trim() || !serverUser.trim() || !serverPassword) {
      setStatus('Server URL, username and password are all required.');
      return;
    }
    setTesting(true);
    setStatus('Testing connection…');
    try {
      await connect({ baseUrl: serverUrl.trim(), username: serverUser.trim() }, serverPassword);
      setServerPassword('');
      setStatus('Connected.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      simpleLogger.error('WebDAV connect failed', { error: message });
      setStatus(
        message.includes('401') || message.includes('403')
          ? 'Connection failed: the server rejected the URL or credentials.'
          : `Connection failed: ${message}`
      );
    }
    setTesting(false);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setStatus('Disconnected. Stored credentials removed.');
    } catch (error) {
      simpleLogger.error('WebDAV disconnect failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setStatus('Starting backup…');
    try {
      const onProgress = (progress: SyncProgress) => {
        setStatus(`${progress.phase}: ${progress.done}/${progress.total}`);
      };
      const summary = await pushBackupNow(onProgress);
      setLastSync(summary.syncedAt);
      if (summary.errors.length > 0) {
        setStatus(`Done with ${summary.errors.length} errors (see logs)`);
        Alert.alert(
          'Backup completed with errors',
          `${summary.uploadedActivities + summary.uploadedStreams} uploaded, ${summary.errors.length} failed. First error: ${summary.errors[0]}`
        );
      } else {
        setStatus(
          `Done: ${summary.uploadedActivities + summary.uploadedStreams} uploaded, ` +
            `${summary.skippedActivities + summary.skippedStreams} unchanged (skipped)` +
            (summary.deletedRemote > 0 ? `, ${summary.deletedRemote} deleted` : '')
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      simpleLogger.error('WebDAV backup failed', { error: message });
      setStatus(`Backup failed: ${message}`);
      Alert.alert('Backup failed', message);
    }
    setSyncing(false);
  };

  /**
   * Re-reads all activities from local storage into app state, the same
   * way useActivities.loadFromLocal does, so restored items appear without
   * a restart.
   */
  const reloadActivitiesFromStorage = React.useCallback(async () => {
    const keys = await Storage.getAllActivitiesKeys();
    const loaded = await Storage.loadAllActivities(keys);
    setGlobalActivities([...loaded].sort(compareActivitiesByUtcDesc));
    setTotalActivitiesStored(keys.length);
  }, [setGlobalActivities, setTotalActivitiesStored]);

  const handleRestore = () => {
    Alert.alert(
      'Restore from backup',
      'Download activities and streams from the WebDAV server that are missing on this device? Existing local data is never overwritten.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(true);
            setStatus('Starting restore…');
            try {
              const onProgress = (progress: SyncProgress) => {
                setStatus(`restore ${progress.phase}: ${progress.done}/${progress.total}`);
              };
              const summary: RestoreSummary = await pullBackupNow(onProgress);
              await reloadActivitiesFromStorage();
              if (summary.errors.length > 0) {
                setStatus(`Restore done with ${summary.errors.length} errors (see logs)`);
                Alert.alert(
                  'Restore completed with errors',
                  `${summary.restoredActivities + summary.restoredStreams} restored, ${summary.errors.length} failed. First error: ${summary.errors[0]}`
                );
              } else {
                setStatus(
                  `Restore done: ${summary.restoredActivities} activities, ` +
                    `${summary.restoredStreams} streams downloaded, ` +
                    `${summary.skippedActivities + summary.skippedStreams} already present`
                );
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              simpleLogger.error('WebDAV restore failed', { error: message });
              setStatus(`Restore failed: ${message}`);
              Alert.alert('Restore failed', message);
            }
            setRestoring(false);
          }
        }
      ]
    );
  };

  const mutedColor = colorScheme === 'dark' ? blueGrey300 : gray800;
  const textColor = colorScheme === 'dark' ? gray100 : gray800;
  const inputStyle = {
    borderWidth: 1,
    borderColor: mutedColor,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: textColor,
    marginBottom: 8
  };
  const buttonStyle = {
    alignItems: 'center' as const,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: mutedColor,
    paddingVertical: 8,
    marginBottom: 4
  };

  if (!isConfigured) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ color: textColor, fontWeight: 'bold', marginBottom: 4 }}>WebDAV Backup</Text>
        <Text style={{ color: mutedColor, marginBottom: 8, fontSize: 12 }}>
          Server URL of the backup folder (e.g. Nextcloud:
          https://host:8080/remote.php/dav/files/USER/), plus username and password (app password
          recommended).
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Server URL"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={serverUrl}
          onChangeText={setServerUrl}
        />
        <TextInput
          style={inputStyle}
          placeholder="Username"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          value={serverUser}
          onChangeText={setServerUser}
        />
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={serverPassword}
          onChangeText={setServerPassword}
        />
        <TouchableOpacity onPress={handleConnect} disabled={isTesting} style={buttonStyle}>
          <Text style={{ color: textColor }}>{isTesting ? 'Testing…' : 'Connect'}</Text>
        </TouchableOpacity>
        {status !== '' ? (
          <Text style={{ color: mutedColor, marginTop: 4 }} numberOfLines={3}>
            {status}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ color: textColor, fontWeight: 'bold', marginBottom: 4 }}>WebDAV Backup</Text>
      <Text style={{ color: mutedColor, fontSize: 12 }} numberOfLines={1}>
        {baseUrl} ({username})
      </Text>
      <Text style={{ color: mutedColor, marginBottom: 8 }}>{formatLastSync(lastSync)}</Text>
      <TouchableOpacity
        onPress={handleSyncNow}
        disabled={isSyncing || isRestoring}
        style={{ ...buttonStyle, opacity: isSyncing || isRestoring ? 0.5 : 1 }}
      >
        <Text style={{ color: textColor }}>{isSyncing ? 'Backing up…' : 'Sync now'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleRestore}
        disabled={isSyncing || isRestoring}
        style={{ ...buttonStyle, opacity: isSyncing || isRestoring ? 0.5 : 1 }}
      >
        <Text style={{ color: textColor }}>{isRestoring ? 'Restoring…' : 'Restore'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDisconnect}
        disabled={isSyncing || isRestoring}
        style={{ paddingVertical: 4 }}
      >
        <Text style={{ color: mutedColor }}>Disconnect</Text>
      </TouchableOpacity>
      {status !== '' ? (
        <Text style={{ color: mutedColor, marginTop: 4 }} numberOfLines={3}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}
