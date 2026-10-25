import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapType } from 'react-native-maps';

export interface FlyoverHeaderProps {
  title: string;
  mapType: MapType;
  onClose: () => void;
  onCycleMapType: () => void;
  topInset: number;
}

const createStyles = (theme: ReturnType<typeof useTheme>, topInset: number) =>
  StyleSheet.create({
    headerBar: {
      position: 'absolute',
      top: Math.max(topInset, 16),
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.92)',
      borderWidth: 1,
      borderColor: theme.border,
      zIndex: 10
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.textStrong
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted
    },
    mapTypeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted
    },
    mapTypeText: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
      color: theme.text
    }
  });

export default function FlyoverHeader({
  title,
  mapType,
  onClose,
  onCycleMapType,
  topInset
}: Readonly<FlyoverHeaderProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme, topInset), [theme, topInset]);

  return (
    <View style={styles.headerBar}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close flyover"
        >
          <Ionicons name="close" size={22} color={theme.textStrong} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity
          style={styles.mapTypeButton}
          onPress={onCycleMapType}
          accessibilityRole="button"
          accessibilityLabel={`Map type: ${mapType}. Tap to change.`}
        >
          <Ionicons name="layers-outline" size={16} color={theme.text} />
          <Text style={styles.mapTypeText}>{mapType}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
