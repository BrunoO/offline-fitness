import { seconds_to_label } from '@/shared';
import { useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MPS_TO_KMH = 3.6;
const METERS_TO_KM = 1000;

export interface FlyoverHudProps {
  speedMps: number;
  completedDistanceMeters: number;
  totalDistanceMeters: number;
  altitudeMeters: number;
  elapsedSeconds: number;
  totalDurationSeconds: number;
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.94)',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4
    },
    metricColumn: {
      alignItems: 'center',
      minWidth: 64
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginBottom: 2
    },
    metricValue: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textStrong
    },
    divider: {
      width: 1,
      height: 24,
      backgroundColor: theme.borderSubtle
    }
  });

export default function FlyoverHud({
  speedMps,
  completedDistanceMeters,
  totalDistanceMeters,
  altitudeMeters,
  elapsedSeconds,
  totalDurationSeconds
}: Readonly<FlyoverHudProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const speedKmh = useMemo(() => (speedMps * MPS_TO_KMH).toFixed(1), [speedMps]);
  const distanceKm = useMemo(
    () =>
      `${(completedDistanceMeters / METERS_TO_KM).toFixed(1)} / ${(totalDistanceMeters / METERS_TO_KM).toFixed(1)}`,
    [completedDistanceMeters, totalDistanceMeters]
  );
  const timeFormatted = useMemo(
    () =>
      `${seconds_to_label(Math.round(elapsedSeconds))} / ${seconds_to_label(Math.round(totalDurationSeconds))}`,
    [elapsedSeconds, totalDurationSeconds]
  );
  const altitudeRounded = useMemo(() => `${Math.round(altitudeMeters)} m`, [altitudeMeters]);

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel="Flight status HUD"
    >
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Time</Text>
        <Text style={styles.metricValue}>{timeFormatted}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Speed</Text>
        <Text style={styles.metricValue}>{speedKmh} km/h</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Distance</Text>
        <Text style={styles.metricValue}>{distanceKm} km</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Elevation</Text>
        <Text style={styles.metricValue}>{altitudeRounded}</Text>
      </View>
    </View>
  );
}
