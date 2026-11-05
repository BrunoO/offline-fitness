import { formatPace, isPaceSport, seconds_to_label } from '@/shared';
import { useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MPS_TO_KMH = 3.6;
const METERS_TO_KM = 1000;
const MIN_PACE_SPEED_MPS = 0.4;

export interface FlyoverHudProps {
  speedMps: number;
  completedDistanceMeters: number;
  totalDistanceMeters: number;
  altitudeMeters: number;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  activityType?: string;
  gradePercent?: number;
  heartrateBpm?: number | null;
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
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
      minWidth: 56
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginBottom: 2
    },
    metricValue: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textStrong,
      fontVariant: ['tabular-nums']
    },
    elevationRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4
    },
    gradeText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted,
      fontVariant: ['tabular-nums']
    },
    divider: {
      width: 1,
      height: 24,
      backgroundColor: theme.borderSubtle
    }
  });

function formatGradeLabel(gradePercent: number | undefined): string | null {
  if (gradePercent === undefined || !Number.isFinite(gradePercent)) {
    return null;
  }
  const rounded = Math.round(gradePercent * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}

export default function FlyoverHud({
  speedMps,
  completedDistanceMeters,
  totalDistanceMeters,
  altitudeMeters,
  elapsedSeconds,
  totalDurationSeconds,
  activityType,
  gradePercent,
  heartrateBpm
}: Readonly<FlyoverHudProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Cheap derived formatting: the React Compiler memoises these per-component,
  // so manual useMemo adds no value here (see docs/memoization-audit.md).
  const showPace = isPaceSport(activityType);
  const rateLabel = showPace ? 'Pace' : 'Speed';
  let rateValue: string;
  if (showPace) {
    rateValue = speedMps >= MIN_PACE_SPEED_MPS ? `${formatPace(1000 / speedMps / 60)} /km` : '—';
  } else {
    rateValue = `${(speedMps * MPS_TO_KMH).toFixed(1)} km/h`;
  }
  const distanceKm = `${(completedDistanceMeters / METERS_TO_KM).toFixed(1)} / ${(totalDistanceMeters / METERS_TO_KM).toFixed(1)}`;
  const timeFormatted = `${seconds_to_label(Math.round(elapsedSeconds))} / ${seconds_to_label(Math.round(totalDurationSeconds))}`;
  const altitudeRounded = `${Math.round(altitudeMeters)} m`;
  const gradeLabel = formatGradeLabel(gradePercent);
  const hasHeartrate = heartrateBpm != null && Number.isFinite(heartrateBpm) && heartrateBpm > 0;

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
        <Text style={styles.metricLabel}>{rateLabel}</Text>
        <Text style={styles.metricValue}>{rateValue}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Distance</Text>
        <Text style={styles.metricValue}>{distanceKm} km</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricColumn}>
        <Text style={styles.metricLabel}>Elevation</Text>
        <View style={styles.elevationRow}>
          <Text style={styles.metricValue}>{altitudeRounded}</Text>
          {gradeLabel ? <Text style={styles.gradeText}>{gradeLabel}</Text> : null}
        </View>
      </View>
      {hasHeartrate ? (
        <>
          <View style={styles.divider} />
          <View style={styles.metricColumn}>
            <Text style={styles.metricLabel}>HR</Text>
            <Text style={styles.metricValue}>{`${Math.round(heartrateBpm)} bpm`}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
