import { BackupSection } from '@/features/backup';
import { useActivitiesContext } from '@/features/activities';
import { GpsTracker } from '@/features/recording/services/gpsTracker';
import { PalettePicker, ResolvedTheme, useTheme } from '@/theme';
import {
  SheetFooter,
  createSheetFrameStyles,
  getAllActivitiesKeys,
  removeAllActivities,
  simpleLogger
} from '@/shared';
import React, { useMemo } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The app's global settings: the colour palette and the WebDAV backup.
 *
 * These are app-wide concerns, so they are reached from the drawer's "Settings"
 * item rather than living in the drawer body. `BackupSection` used to render
 * there, which put four live `TextInput`s and a per-file sync progress update
 * inside a panel that never unmounts — and left the keyboard able to resize the
 * drawer while it was open.
 *
 * Not exported from the `@/shared` barrel: like `CustomDrawer`, it imports a
 * feature module, and it has exactly one consumer (`App.tsx`), which imports it
 * directly.
 */

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function SettingsModal({
  visible,
  onClose
}: Readonly<SettingsModalProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [sessionCount, setSessionCount] = React.useState(0);
  const [storageSize, setStorageSize] = React.useState(0);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isIgnoringBattery, setIsIgnoringBattery] = React.useState<boolean | null>(null);
  const [isRequestingBattery, setIsRequestingBattery] = React.useState(false);
  const [splitsAudioEnabled, setSplitsAudioEnabled] = React.useState(true);
  const [splitsHapticEnabled, setSplitsHapticEnabled] = React.useState(true);
  const [splitsInterval, setSplitsInterval] = React.useState(1000);
  const { totalActivitiesStored, setTotalActivitiesStored, setGlobalActivities } =
    useActivitiesContext();
  const [isClearingActivities, setIsClearingActivities] = React.useState(false);

  // Load recording diagnostics when the modal opens.
  React.useEffect(() => {
    if (!visible) return;
    let isMounted = true;
    const load = async () => {
      try {
        const sessions = await GpsTracker.listSessions();
        const size = await GpsTracker.getStorageSize();
        const caps = await GpsTracker.getCapabilities();
        const [audio, haptic, interval] = await Promise.all([
          AsyncStorage.getItem('splitsAudioEnabled'),
          AsyncStorage.getItem('splitsHapticEnabled'),
          AsyncStorage.getItem('splitsIntervalMeters')
        ]);
        if (isMounted) {
          setSessionCount(sessions.length);
          setStorageSize(size);
          setIsIgnoringBattery(caps.canExemptBattery);
          if (audio !== null) setSplitsAudioEnabled(audio === 'true');
          if (haptic !== null) setSplitsHapticEnabled(haptic === 'true');
          if (interval !== null) setSplitsInterval(Number.parseInt(interval, 10) || 1000);
        }
      } catch (_cause) {
        // The module may be unavailable (iOS stub, stale dev client).
      }
    };
    void load();
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        void load();
      }
    });
    return () => {
      isMounted = false;
      appStateSubscription.remove();
    };
  }, [visible]);

  const handleDeleteAll = React.useCallback(async () => {
    setIsDeleting(true);
    try {
      await GpsTracker.deleteAllSessions();
      setSessionCount(0);
      setStorageSize(0);
    } catch (_cause) {
      // ignore
    }
    setIsDeleting(false);
  }, []);

  const handleRequestBatteryExemption = React.useCallback(async () => {
    setIsRequestingBattery(true);
    try {
      const granted = await GpsTracker.requestIgnoreBatteryOptimization();
      if (granted) {
        const caps = await GpsTracker.getCapabilities();
        setIsIgnoringBattery(caps.canExemptBattery);
      }
    } catch (_cause) {
      // ignore — module may be unavailable
    }
    setIsRequestingBattery(false);
  }, []);

  const handleToggleAudio = React.useCallback((value: boolean) => {
    setSplitsAudioEnabled(value);
    void AsyncStorage.setItem('splitsAudioEnabled', String(value));
  }, []);

  const handleToggleHaptic = React.useCallback((value: boolean) => {
    setSplitsHapticEnabled(value);
    void AsyncStorage.setItem('splitsHapticEnabled', String(value));
  }, []);

  const handleIntervalChange = React.useCallback((value: number) => {
    setSplitsInterval(value);
    void AsyncStorage.setItem('splitsIntervalMeters', String(value));
  }, []);

  const handleClearActivities = React.useCallback(() => {
    Alert.alert(
      'Clear Local Activities',
      'This deletes all activity records on this phone so a fresh Restore can refill them (for example after the backup was corrected elsewhere). Cached tracks are kept and reused. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (isClearingActivities) return;
            setIsClearingActivities(true);
            try {
              await removeAllActivities();
              const remaining = await getAllActivitiesKeys();
              if (remaining.length > 0) {
                throw new Error(
                  `${remaining.length} record${remaining.length === 1 ? '' : 's'} could not be deleted`
                );
              }
              setTotalActivitiesStored(0);
              setGlobalActivities([]);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              simpleLogger.error('Clear Local Activities failed', {
                error: message
              });
              Alert.alert(
                'Could not clear activities',
                `${message}. Nothing was discarded from the display — try again, and restore only once this succeeds.`
              );
            } finally {
              setIsClearingActivities(false);
            }
          }
        }
      ]
    );
  }, [isClearingActivities, setGlobalActivities, setTotalActivitiesStored]);

  let batteryStatusText = 'No';
  if (isIgnoringBattery === null) {
    batteryStatusText = '—';
  } else if (isIgnoringBattery) {
    batteryStatusText = 'Yes';
  }

  let batteryButtonLabel = 'Request exemption';
  if (isRequestingBattery) {
    batteryButtonLabel = 'Opening settings…';
  } else if (isIgnoringBattery) {
    batteryButtonLabel = 'Already exempt';
  }

  // Don't mount the form while it is closed. On Android `Modal` already
  // renders null when hidden, but on iOS its children stay mounted after the
  // first show until the dismiss event lands, so the guard is what keeps the
  // backup inputs and their secure-store read from lingering there. (Same
  // reason `ProgressOverlay` guards.)
  if (!visible) {
    return <></>;
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <Text style={styles.sectionNote}>
              Pick the colour palette. It applies straight away and is remembered, so there is
              nothing to save.
            </Text>
            <PalettePicker />

            <Text style={styles.sectionTitle}>WebDAV Backup</Text>
            {/* Cancels the section's own drawer padding so its fields line up with
                the palette rows above it. */}
            <View style={styles.backupSection}>
              <BackupSection />
            </View>

            <Text style={styles.sectionTitle}>Recording diagnostics</Text>
            <Text style={styles.sectionNote}>
              Fix logs are kept for 30 days, device-only, for debugging. They never leave the
              device.
            </Text>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Sessions retained</Text>
              <Text style={styles.diagnosticsValue}>{sessionCount}</Text>
            </View>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Size on disk</Text>
              <Text style={styles.diagnosticsValue}>{formatBytes(storageSize)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete all recording sessions"
              disabled={isDeleting || sessionCount === 0}
              onPress={() => {
                Alert.alert(
                  'Delete all recording sessions?',
                  'This removes every fix log on this device. It cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete all',
                      style: 'destructive',
                      onPress: () => void handleDeleteAll()
                    }
                  ]
                );
              }}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed ? styles.deleteButtonPressed : null,
                isDeleting || sessionCount === 0 ? styles.deleteButtonDisabled : null
              ]}
            >
              <Text style={styles.deleteButtonLabel}>
                {isDeleting ? 'Deleting…' : 'Delete all sessions'}
              </Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Battery optimization</Text>
            <Text style={styles.sectionNote}>
              Keeps GPS recording alive in the background on devices that aggressively throttle
              apps. Only needed if a recording is being stopped mid-activity.
            </Text>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Exempt from optimization</Text>
              <Text style={styles.diagnosticsValue}>{batteryStatusText}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request battery optimization exemption"
              disabled={isRequestingBattery || isIgnoringBattery === true}
              onPress={() => {
                void handleRequestBatteryExemption();
              }}
              style={({ pressed }) => [
                styles.requestButton,
                pressed ? styles.requestButtonPressed : null,
                isRequestingBattery || isIgnoringBattery === true
                  ? styles.requestButtonDisabled
                  : null
              ]}
            >
              <Text style={styles.requestButtonLabel}>{batteryButtonLabel}</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Recording splits</Text>
            <Text style={styles.sectionNote}>
              Audio/haptic announcements at each split milestone. Distance is always recorded; these
              toggles only control announcements.
            </Text>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Audio announcements</Text>
              <Switch
                value={splitsAudioEnabled}
                onValueChange={handleToggleAudio}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={splitsAudioEnabled ? theme.onPrimary : theme.surfaceSunken}
              />
            </View>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Haptic feedback</Text>
              <Switch
                value={splitsHapticEnabled}
                onValueChange={handleToggleHaptic}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={splitsHapticEnabled ? theme.onPrimary : theme.surfaceSunken}
              />
            </View>
            <Text style={styles.sectionNote}>Split interval</Text>
            <View style={styles.chipsRow}>
              {[250, 500, 1000].map(value => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  onPress={() => handleIntervalChange(value)}
                  style={[styles.chip, splitsInterval === value ? styles.chipSelected : null]}
                >
                  <Text style={styles.chipLabel}>{`${value} m`}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Danger Zone</Text>
            <Text style={styles.sectionNote}>
              Deletes all activity records from this phone so a fresh Restore can refill them (for
              example after the backup was corrected elsewhere). Cached tracks are kept and reused.
              This action cannot be undone.
            </Text>
            <View style={styles.diagnosticsRow}>
              <Text style={styles.diagnosticsLabel}>Activities stored locally</Text>
              <Text style={styles.diagnosticsValue}>{totalActivitiesStored}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear local activities"
              disabled={isClearingActivities || totalActivitiesStored === 0}
              onPress={handleClearActivities}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed ? styles.deleteButtonPressed : null,
                isClearingActivities || totalActivitiesStored === 0
                  ? styles.deleteButtonDisabled
                  : null
              ]}
            >
              <Text style={styles.deleteButtonLabel}>
                {isClearingActivities ? 'Clearing…' : 'Clear local activities'}
              </Text>
            </Pressable>
          </ScrollView>

          <SheetFooter buttons={[{ label: 'Close', onPress: onClose, primary: true }]} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) => ({
  ...createSheetFrameStyles(theme, { maxHeight: '85%', headerPaddingBottom: 12 }),
  ...StyleSheet.create({
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
      marginBottom: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    sectionNote: {
      fontSize: 12,
      color: theme.textMuted,
      lineHeight: 17,
      marginBottom: 10
    },
    backupSection: {
      marginHorizontal: -16
    },
    diagnosticsRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8
    },
    diagnosticsLabel: {
      color: theme.textMuted,
      fontSize: 14
    },
    diagnosticsValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600'
    },
    chipsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface
    },
    chipSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft
    },
    chipLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600'
    },
    requestButton: {
      alignItems: 'center',
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 12,
      paddingVertical: 10
    },
    requestButtonPressed: {
      opacity: 0.7
    },
    requestButtonDisabled: {
      opacity: 0.4
    },
    requestButtonLabel: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600'
    },
    deleteButton: {
      alignItems: 'center',
      backgroundColor: theme.dangerSoft,
      borderColor: theme.dangerBorder,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 12,
      paddingVertical: 10
    },
    deleteButtonPressed: {
      opacity: 0.7
    },
    deleteButtonDisabled: {
      opacity: 0.4
    },
    deleteButtonLabel: {
      color: theme.danger,
      fontSize: 14,
      fontWeight: '600'
    }
  })
});
