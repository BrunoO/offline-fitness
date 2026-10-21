import { APP_CONFIG } from '@/constants';
import { compareActivitiesByUtcDesc, simpleLogger } from '@/shared';
import { useTheme } from '@/theme';
import * as Storage from '@/shared/services/storage';
import { useActivitiesDataContext } from '@/features/activities';
import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RestoreSummary, SyncProgress, pullBackupNow, pushBackupNow } from '../services/backupSync';
import { useWebDavBackup, validateProfile } from '../services/webdavAuth';

function formatLastSync(isoString: string): string {
  if (!isoString) return 'Never synced';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? 'Never synced' : `Last sync: ${date.toLocaleString()}`;
}

/**
 * Names up to 3 ids inline for the status line ("9.json, +2 more"). The full
 * lists travel in the summary (and trimmed to 25 in the logs); the status
 * line only needs enough to identify the files at a glance.
 */
function idSuffix(ids: readonly string[]): string {
  if (ids.length === 0) return '';
  const shown = ids.slice(0, 3).join(', ');
  return ` (${shown}${ids.length > 3 ? `, +${ids.length - 3} more` : ''})`;
}

/**
 * WebDAV backup controls for the drawer. Unconfigured: a small form for
 * the server account URL, username, password and profile name, validated
 * with a PROPFIND before being saved. Configured: manual "Sync now" and
 * "Restore" plus disconnect. No automatic syncing happens.
 */
export function BackupSection() {
  const theme = useTheme();
  const {
    isConfigured,
    username,
    profile,
    collectionUrl,
    connect,
    retrieveConnection,
    disconnect
  } = useWebDavBackup();
  const { setGlobalActivities, setTotalActivitiesStored } = useActivitiesDataContext();

  const [serverUrl, setServerUrl] = React.useState('');
  const [serverUser, setServerUser] = React.useState('');
  const [serverPassword, setServerPassword] = React.useState('');
  const [profileName, setProfileName] = React.useState('');
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
    const profileError = validateProfile(profileName);
    if (profileError) {
      setStatus(profileError);
      return;
    }
    setTesting(true);
    setStatus('Testing connection…');
    try {
      await connect(
        { rootUrl: serverUrl.trim(), username: serverUser.trim(), profile: profileName.trim() },
        serverPassword
      );
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
    Alert.alert(
      'Disconnect backup?',
      'This removes the stored server URL, username and password from this phone. The backup on the server is left untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnect();
              setStatus('Disconnected. Stored credentials removed.');
            } catch (error) {
              simpleLogger.error('WebDAV disconnect failed', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      ]
    );
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
          `${summary.uploadedActivities} activities + ${summary.uploadedStreams} streams uploaded, ` +
            `${summary.errors.length} failed. First error: ${summary.errors[0]}`
        );
      } else {
        setStatus(
          `Done: ${summary.uploadedActivities} activities + ${summary.uploadedStreams} streams uploaded` +
            idSuffix([...summary.uploadedActivityIds, ...summary.uploadedStreamNames]) +
            `, ${summary.skippedActivities} activities + ${summary.skippedStreams} streams unchanged` +
            (summary.deletedRemote > 0
              ? `, ${summary.deletedRemote} deleted${idSuffix(summary.deletedRemoteIds)}`
              : '')
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
                  `${summary.restoredActivities} activities + ${summary.restoredStreams} streams restored, ` +
                    `${summary.errors.length} failed. First error: ${summary.errors[0]}`
                );
              } else {
                setStatus(
                  `Restore done: ${summary.restoredActivities} activities` +
                    idSuffix(summary.restoredActivityIds) +
                    `, ${summary.restoredStreams} streams downloaded` +
                    idSuffix(summary.restoredStreamNames) +
                    `, ${summary.skippedActivities} activities + ${summary.skippedStreams} streams already present` +
                    (summary.refreshedStreamNames.length > 0
                      ? `, ${summary.refreshedStreamNames.length} refreshed` +
                        idSuffix(summary.refreshedStreamNames)
                      : '')
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

  const mutedColor = theme.textMuted;
  const textColor = theme.text;
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
          Account URL of your WebDAV server (e.g. Nextcloud:
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
        <TextInput
          style={inputStyle}
          placeholder="Profile name (e.g. your name)"
          placeholderTextColor={mutedColor}
          autoCapitalize="none"
          autoCorrect={false}
          value={profileName}
          onChangeText={setProfileName}
        />
        <Text style={{ color: mutedColor, marginBottom: 8, fontSize: 12 }}>
          Your backup goes to {APP_CONFIG.BACKUP_APP_ID}/{profileName.trim() || '<profile>'}. Use
          the same profile name on all your devices; people sharing one server account each pick
          their own.
        </Text>
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
        {username} · {profile}
      </Text>
      <Text style={{ color: mutedColor, fontSize: 12, marginBottom: 4 }} numberOfLines={2}>
        {collectionUrl}
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
        style={{ ...buttonStyle, opacity: isSyncing || isRestoring ? 0.5 : 1 }}
      >
        <Text style={{ color: textColor }}>Disconnect</Text>
      </TouchableOpacity>
      {status !== '' ? (
        <Text style={{ color: mutedColor, marginTop: 4 }} numberOfLines={3}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}
