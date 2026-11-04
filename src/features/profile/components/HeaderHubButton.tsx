import React, { JSX, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResolvedTheme, useTheme } from '@/theme';
import { useProfileHub } from '../ProfileHubContext';

export function HeaderHubButton({ statusColor }: Readonly<{ statusColor?: string }>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { openHub } = useProfileHub();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={openHub}
      accessibilityRole="button"
      accessibilityLabel="Account, backup and tools hub"
    >
      <View style={styles.iconCircle}>
        <Ionicons name="person-outline" size={18} color={theme.text} />
        {statusColor ? (
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      marginRight: 14,
      padding: 4
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    },
    statusBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: theme.surface
    }
  });
