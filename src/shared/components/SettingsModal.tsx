import { BackupSection } from '@/features/backup';
import { PalettePicker, ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

export function SettingsModal({ visible, onClose }: SettingsModalProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
      <View style={styles.backdrop}>
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
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.primaryButton]} onPress={onClose}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '85%',
      backgroundColor: theme.surface,
      borderRadius: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4
        },
        android: { elevation: 5 },
        web: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }
      })
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary,
      textAlign: 'center'
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 12
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
      marginBottom: 4
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
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    button: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 42,
      justifyContent: 'center'
    },
    primaryButton: {
      backgroundColor: theme.primary
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      textAlign: 'center'
    }
  });
