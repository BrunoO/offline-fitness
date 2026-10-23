import { ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RecordChooserSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onRecord: () => void;
  readonly onEnterManually: () => void;
}

/**
 * The RECORD-CHOOSER: the single entry point for "add an activity" offers
 * both recording and manual entry, instead of a second button in the drawer.
 */
export function RecordChooserSheet({
  visible,
  onClose,
  onRecord,
  onEnterManually
}: RecordChooserSheetProps): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Add activity</Text>
        <Text style={styles.subtitle}>How do you want to add it?</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record a new activity"
          onPress={() => {
            onClose();
            onRecord();
          }}
          style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="navigate" size={24} color={theme.primary} />
          </View>
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Record</Text>
            <Text style={styles.optionHint}>Track a walk, hike, ride or swim with GPS.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter an activity manually"
          onPress={() => {
            onClose();
            onEnterManually();
          }}
          style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="create-outline" size={24} color={theme.primary} />
          </View>
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Enter manually</Text>
            <Text style={styles.optionHint}>Log a session without a GPS track.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          style={styles.cancel}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: theme.scrim,
      flex: 1
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: 20,
      paddingTop: 20
    },
    title: {
      color: theme.textStrong,
      fontSize: 20,
      fontWeight: '700'
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      marginBottom: 16,
      marginTop: 4
    },
    option: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
      padding: 16
    },
    optionIcon: {
      alignItems: 'center',
      backgroundColor: theme.primarySoft,
      borderRadius: 10,
      height: 44,
      justifyContent: 'center',
      width: 44
    },
    optionBody: {
      flex: 1
    },
    optionPressed: {
      backgroundColor: theme.surfaceMuted
    },
    optionTitle: {
      color: theme.textStrong,
      fontSize: 16,
      fontWeight: '700'
    },
    optionHint: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4
    },
    cancel: {
      alignItems: 'center',
      paddingVertical: 12
    },
    cancelLabel: {
      color: theme.textMuted,
      fontSize: 15
    }
  });
