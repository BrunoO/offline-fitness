import { ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProgressOverlayProps {
  visible: boolean;
  title: string;
  progress: number;
  onCancel?: () => void;
  showCancel?: boolean;
}

/**
 * A reusable progress overlay component that shows progress for background operations.
 * @param props The component props.
 * @returns A React component.
 */
export function ProgressOverlay({
  visible,
  title,
  progress,
  onCancel,
  showCancel = true
}: Readonly<ProgressOverlayProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Don't render if not visible to save memory
  if (!visible) {
    return <></>;
  }

  return (
    <Modal transparent={true} visible={visible} animationType="fade" statusBarTranslucent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
          {showCancel && onCancel ? (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'center',
      alignItems: 'center'
    },
    container: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      minWidth: 280,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 2
          },
          shadowOpacity: 0.25,
          shadowRadius: 3.84
        },
        android: {
          elevation: 5
        }
      })
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: 8,
      textAlign: 'center'
    },
    progressText: {
      fontSize: 16,
      color: theme.textMuted,
      marginBottom: 16
    },
    progressBarContainer: {
      width: '100%',
      height: 8,
      backgroundColor: theme.border,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 16
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.success,
      borderRadius: 4
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: theme.surfaceSunken,
      borderWidth: 1,
      borderColor: theme.border
    },
    cancelButtonText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '500'
    }
  });
