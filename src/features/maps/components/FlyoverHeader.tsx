import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapType } from 'react-native-maps';
import { FlyoverCameraMode } from '../types/flyover.types';

export type FlyoverRenderMode = '2.5d' | '3d';

export interface FlyoverHeaderProps {
  title: string;
  mapType: MapType;
  mapTypeLabel?: string;
  cameraMode?: FlyoverCameraMode;
  renderMode?: FlyoverRenderMode;
  onClose: () => void;
  onCycleMapType: () => void;
  onCycleCameraMode?: () => void;
  onToggleRenderMode?: () => void;
  topInset: number;
}

const CAMERA_MODE_LABEL: Record<FlyoverCameraMode, string> = {
  follow: 'Follow',
  'north-up': 'North-Up',
  overview: 'Overview'
};

const CAMERA_MODE_ICON: Record<FlyoverCameraMode, React.ComponentProps<typeof Ionicons>['name']> = {
  follow: 'videocam-outline',
  'north-up': 'compass-outline',
  overview: 'scan-outline'
};

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
      color: theme.textStrong,
      flexShrink: 1
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 8
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
    renderModeButtonActive: {
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.primary
    },
    mapTypeText: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
      color: theme.text
    },
    renderModeText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text
    },
    renderModeTextActive: {
      color: theme.primary
    }
  });

export default function FlyoverHeader({
  title,
  mapType,
  mapTypeLabel,
  cameraMode = 'follow',
  renderMode,
  onClose,
  onCycleMapType,
  onCycleCameraMode,
  onToggleRenderMode,
  topInset
}: Readonly<FlyoverHeaderProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme, topInset), [theme, topInset]);
  const modeLabel = CAMERA_MODE_LABEL[cameraMode];
  const modeIcon = CAMERA_MODE_ICON[cameraMode];
  const activeMapLabel = mapTypeLabel ?? mapType;
  const is3D = renderMode === '3d';
  const renderModeLabel = is3D ? '3D' : '2.5D';

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
        {onToggleRenderMode && renderMode ? (
          <TouchableOpacity
            style={[styles.mapTypeButton, is3D ? styles.renderModeButtonActive : null]}
            onPress={onToggleRenderMode}
            accessibilityRole="button"
            accessibilityLabel={`Flyover mode: ${renderModeLabel}. Tap to switch to ${is3D ? '2.5D' : '3D'}.`}
          >
            <Ionicons
              name={is3D ? 'cube-outline' : 'map-outline'}
              size={15}
              color={is3D ? theme.primary : theme.text}
            />
            <Text style={[styles.renderModeText, is3D ? styles.renderModeTextActive : null]}>
              {renderModeLabel}
            </Text>
          </TouchableOpacity>
        ) : null}

        {onCycleCameraMode ? (
          <TouchableOpacity
            style={styles.mapTypeButton}
            onPress={onCycleCameraMode}
            accessibilityRole="button"
            accessibilityLabel={`Camera mode: ${modeLabel}. Tap to change.`}
          >
            <Ionicons name={modeIcon} size={16} color={theme.text} />
            <Text style={styles.mapTypeText}>{modeLabel}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.mapTypeButton}
          onPress={onCycleMapType}
          accessibilityRole="button"
          accessibilityLabel={`Map type: ${activeMapLabel}. Tap to change.`}
        >
          <Ionicons name="layers-outline" size={16} color={theme.text} />
          <Text style={styles.mapTypeText}>{activeMapLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
