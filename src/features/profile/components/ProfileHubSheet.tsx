import React, { JSX, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { ResolvedTheme, useTheme } from '@/theme';
import { exportData, simpleLogger } from '@/shared';
import { useActivitiesContext } from '@/features/activities';
import { useBackupHealth } from '@/features/backup';
import { ProgressOverlay } from '@/features/stats';
import { loadUserProfile, UserProfile } from '../services/profileStorage';

interface ProfileHubSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onNavigateToProfile: () => void;
  onNavigateToLogs: () => void;
}

export function ProfileHubSheet({
  visible,
  onClose,
  onOpenSettings,
  onNavigateToProfile,
  onNavigateToLogs
}: Readonly<ProfileHubSheetProps>): JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { lastBackupSync } = useActivitiesContext();
  const backupHealth = useBackupHealth(lastBackupSync);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportVisible, setExportVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;
    void (async () => {
      try {
        const loaded = await loadUserProfile();
        if (isMounted) {
          setProfile(loaded);
        }
      } catch (error) {
        simpleLogger.error('Failed to load profile for hub sheet', error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [visible]);

  const latestWeight = useMemo(() => {
    if (!profile || profile.weightEntries.length === 0) return null;
    return profile.weightEntries[0].weightKg;
  }, [profile]);

  const handleExport = useCallback(async () => {
    simpleLogger.log('User initiated data export from Profile Hub');
    setExportVisible(true);
    setExportProgress(0);

    try {
      await exportData(progress => {
        setExportProgress(progress);
      });
    } catch (error) {
      simpleLogger.error('Data export failed from Profile Hub', error);
    } finally {
      setExportVisible(false);
      setExportProgress(0);
    }
  }, []);

  const handleProfilePress = useCallback(() => {
    onClose();
    onNavigateToProfile();
  }, [onClose, onNavigateToProfile]);

  const handleSettingsPress = useCallback(() => {
    onClose();
    onOpenSettings();
  }, [onClose, onOpenSettings]);

  const handleLogsPress = useCallback(() => {
    onClose();
    onNavigateToLogs();
  }, [onClose, onNavigateToLogs]);

  const backupDotColor = useMemo(() => {
    if (backupHealth.status === 'healthy') return theme.success;
    if (backupHealth.status === 'stale') return theme.warning;
    return theme.textMuted;
  }, [backupHealth.status, theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.backdropPressable}
          onPress={onClose}
          accessibilityLabel="Close hub"
        />
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleCluster}>
              <View style={styles.avatarIconCircle}>
                <Ionicons name="person" size={20} color={theme.onPrimary} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Account &amp; Tools</Text>
                <Text style={styles.headerSubtitle}>Offline Fitness Hub</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.contentScrollView} contentContainerStyle={styles.scrollContent}>
            {/* User Profile Card */}
            <TouchableOpacity
              style={styles.card}
              onPress={handleProfilePress}
              accessibilityRole="button"
              accessibilityLabel="Open Athlete Profile"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <Ionicons name="body-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.cardTextCluster}>
                  <Text style={styles.cardTitle}>Athlete Profile</Text>
                  <Text style={styles.cardDetail}>
                    {latestWeight !== null ? `${latestWeight} kg` : 'No weight logged'}
                    {profile?.age ? ` • Age ${profile.age}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </View>
            </TouchableOpacity>

            {/* Cloud Backup & Settings Card */}
            <TouchableOpacity
              style={styles.card}
              onPress={handleSettingsPress}
              accessibilityRole="button"
              accessibilityLabel="Open Backup and Global Settings"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <Ionicons name="cloud-done-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.cardTextCluster}>
                  <View style={styles.inlineHealthRow}>
                    <Text style={styles.cardTitle}>Cloud Backup &amp; Settings</Text>
                    <View style={[styles.statusDot, { backgroundColor: backupDotColor }]} />
                  </View>
                  <Text style={styles.cardDetail}>{backupHealth.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </View>
            </TouchableOpacity>

            {/* Data Export Button */}
            <TouchableOpacity
              style={styles.card}
              onPress={handleExport}
              accessibilityRole="button"
              accessibilityLabel="Export all activities as ZIP"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <Ionicons name="download-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.cardTextCluster}>
                  <Text style={styles.cardTitle}>Export Data (ZIP)</Text>
                  <Text style={styles.cardDetail}>Full local archive with stream files</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </View>
            </TouchableOpacity>

            {/* Diagnostics & Logs Button */}
            <TouchableOpacity
              style={styles.card}
              onPress={handleLogsPress}
              accessibilityRole="button"
              accessibilityLabel="Open Application Diagnostics Logs"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <Ionicons name="newspaper-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.cardTextCluster}>
                  <Text style={styles.cardTitle}>Diagnostic Logs</Text>
                  <Text style={styles.cardDetail}>
                    v{nativeApplicationVersion ?? '1.0.0'} ({nativeBuildVersion ?? '1'})
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <ProgressOverlay
        visible={exportVisible}
        title="Exporting Data"
        progress={exportProgress}
        onCancel={() => setExportVisible(false)}
      />
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.scrim
    },
    backdropPressable: {
      flex: 1
    },
    sheetContainer: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '80%',
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.25,
          shadowRadius: 12
        },
        android: {
          elevation: 16
        }
      })
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    headerTitleCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12
    },
    avatarIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center'
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textStrong
    },
    headerSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '500'
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center'
    },
    contentScrollView: {
      flexGrow: 0
    },
    scrollContent: {
      padding: 20,
      gap: 12
    },
    card: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    cardIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14
    },
    cardTextCluster: {
      flex: 1
    },
    inlineHealthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text
    },
    cardDetail: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    }
  });
