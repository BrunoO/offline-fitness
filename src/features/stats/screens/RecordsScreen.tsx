import { useActivitiesContext } from '@/features/activities';
import { Activity, RootDrawerParamList } from '@/shared';
import { ResolvedTheme, useTheme } from '@/theme';

import { computeDayStreaks, computeWeekStreaks } from '@/shared/services/streaks';
import { isNoGpsActivity } from '@/shared/utils/activityCategories';
import { weeklyData } from '../services/stats';
import { useSettings } from '../StatsTabSettingsContext';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React, { JSX, useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RecordItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  name: string | null;
  activityId: string | null;
}

/**
 * A screen listing all-time personal records derived from the user's activities.
 * @returns A React component.
 */
export function RecordsScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();
  const { globalActivities } = useActivitiesContext();
  const { numberRecentWeeks, useElapsedTime } = useSettings();

  const goToActivity = (activityId: string | null) => {
    if (!activityId) return;
    navigation.navigate('Details', {
      allActivities: globalActivities,
      selectedActivityId: activityId
    });
  };

  // Aggregate all-time extremes/streaks over the full activity set; memoize so
  // it doesn't recompute on every render.
  const records = useMemo<RecordItem[]>(() => {
    if (globalActivities.length === 0) return [];
    const extremes = computeActivityExtremes(globalActivities);
    const longestWeekKm = computeLongestWeekKm(globalActivities, numberRecentWeeks, useElapsedTime);
    const dayStreak = computeDayStreaks(globalActivities);
    const weekStreak = computeWeekStreaks(globalActivities);
    return buildRecordItems(extremes, longestWeekKm, dayStreak.best, weekStreak.best);
  }, [globalActivities, numberRecentWeeks, useElapsedTime]);

  // Best distance per activity type; memoize (O(n) scan + sort).
  const byType = useMemo(() => {
    const map = new Map<
      string,
      { distance: number; name: string | null; activityId: string | null }
    >();
    for (const activity of globalActivities) {
      if (isNoGpsActivity(activity.type)) continue;
      if (activity.distance <= 0) continue;
      const d = activity.distance / 1000;
      const cur = map.get(activity.type);
      if (!cur || d > cur.distance) {
        map.set(activity.type, { distance: d, name: activity.name, activityId: activity.id });
      }
    }
    return Array.from(map.entries())
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.distance - a.distance);
  }, [globalActivities]);

  if (globalActivities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No activities yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>All-time records</Text>
      <View style={styles.grid}>
        {records.map(record => (
          <TouchableOpacity
            key={record.label}
            style={styles.card}
            activeOpacity={record.activityId ? 0.7 : 1}
            onPress={() => goToActivity(record.activityId)}
            disabled={!record.activityId}
          >
            <View style={styles.cardHeader}>
              <Ionicons name={record.icon} size={20} color={theme.primary} />
              <Text style={styles.cardLabel}>{record.label}</Text>
            </View>
            <Text style={styles.cardValue}>{record.value}</Text>
            {record.name ? (
              <Text style={styles.cardName} numberOfLines={1}>
                {record.name}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {byType.length > 1 ? (
        <>
          <Text style={styles.sectionTitle}>Best distance by type</Text>
          <View style={styles.listCard}>
            {byType.map(row => (
              <TouchableOpacity
                key={row.type}
                style={styles.typeRow}
                activeOpacity={row.activityId ? 0.7 : 1}
                onPress={() => goToActivity(row.activityId)}
                disabled={!row.activityId}
              >
                <Text style={styles.typeName}>{row.type}</Text>
                <Text style={styles.typeValue}>{row.distance.toFixed(2)} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

interface ExtremeRecord {
  value: number;
  name: string | null;
  id: string | null;
}

interface ActivityExtremes {
  longestDistance: ExtremeRecord;
  longestDuration: ExtremeRecord;
  mostElevation: ExtremeRecord;
  fastestSpeed: ExtremeRecord;
  bestPace: ExtremeRecord;
}

function updateSpeedAndPace(
  activity: Activity,
  distanceKm: number,
  extremes: { fastestSpeed: ExtremeRecord; bestPace: ExtremeRecord }
): void {
  if (activity.elapsed_time <= 0 || distanceKm <= 0) return;
  const speedKmh = distanceKm / (activity.elapsed_time / 3600);
  if (speedKmh > extremes.fastestSpeed.value) {
    extremes.fastestSpeed = { value: speedKmh, name: activity.name, id: activity.id };
  }
  const paceMinPerKm = activity.elapsed_time / 60 / distanceKm;
  if (paceMinPerKm < extremes.bestPace.value) {
    extremes.bestPace = { value: paceMinPerKm, name: activity.name, id: activity.id };
  }
}

function computeActivityExtremes(activities: readonly Activity[]): ActivityExtremes {
  let longestDistance: ExtremeRecord = { value: 0, name: null, id: null };
  let longestDuration: ExtremeRecord = { value: 0, name: null, id: null };
  let mostElevation: ExtremeRecord = { value: 0, name: null, id: null };
  const speedAndPace = {
    fastestSpeed: { value: 0, name: null, id: null } as ExtremeRecord,
    bestPace: { value: Infinity, name: null, id: null } as ExtremeRecord
  };

  for (const activity of activities) {
    const distanceKm = activity.distance / 1000;
    if (distanceKm > longestDistance.value) {
      longestDistance = { value: distanceKm, name: activity.name, id: activity.id };
    }
    if (activity.elapsed_time > longestDuration.value) {
      longestDuration = { value: activity.elapsed_time, name: activity.name, id: activity.id };
    }
    if (activity.total_elevation_gain > mostElevation.value) {
      mostElevation = {
        value: activity.total_elevation_gain,
        name: activity.name,
        id: activity.id
      };
    }
    updateSpeedAndPace(activity, distanceKm, speedAndPace);
  }

  return {
    longestDistance,
    longestDuration,
    mostElevation,
    fastestSpeed: speedAndPace.fastestSpeed,
    bestPace: speedAndPace.bestPace
  };
}

function computeLongestWeekKm(
  activities: readonly Activity[],
  numberRecentWeeks: number,
  useElapsedTime: boolean
): number {
  const activityTypes = Array.from(new Set(activities.map(a => a.type))).sort((a, b) =>
    a.localeCompare(b)
  );
  const weeks = weeklyData(
    activityTypes,
    activities as Activity[],
    numberRecentWeeks,
    useElapsedTime
  );
  let longestWeekKm = 0;
  for (const week of weeks) {
    const dist = (week.extraValues.get('dist') ?? 0) / 1000;
    if (dist > longestWeekKm) longestWeekKm = dist;
  }
  return longestWeekKm;
}

function buildRecordItems(
  extremes: ActivityExtremes,
  longestWeekKm: number,
  dayStreakBest: number,
  weekStreakBest: number
): RecordItem[] {
  const items: RecordItem[] = [];
  const { longestDistance, longestDuration, mostElevation, fastestSpeed, bestPace } = extremes;

  if (longestDistance.value > 0) {
    items.push({
      icon: 'trophy-outline',
      label: 'Longest distance',
      value: `${longestDistance.value.toFixed(2)} km`,
      name: longestDistance.name,
      activityId: longestDistance.id
    });
  }
  if (longestDuration.value > 0) {
    items.push({
      icon: 'time-outline',
      label: 'Longest duration',
      value: formatDuration(longestDuration.value),
      name: longestDuration.name,
      activityId: longestDuration.id
    });
  }
  if (mostElevation.value > 0) {
    items.push({
      icon: 'trending-up-outline',
      label: 'Most elevation gain',
      value: `${mostElevation.value.toFixed(0)} m`,
      name: mostElevation.name,
      activityId: mostElevation.id
    });
  }
  if (fastestSpeed.value > 0) {
    items.push({
      icon: 'speedometer-outline',
      label: 'Fastest average speed',
      value: `${fastestSpeed.value.toFixed(1)} km/h`,
      name: fastestSpeed.name,
      activityId: fastestSpeed.id
    });
  }
  if (bestPace.value !== Infinity) {
    items.push({
      icon: 'footsteps-outline',
      label: 'Best pace',
      value: `${formatPace(bestPace.value)} /km`,
      name: bestPace.name,
      activityId: bestPace.id
    });
  }
  if (longestWeekKm > 0) {
    items.push({
      icon: 'calendar-outline',
      label: 'Longest week',
      value: `${longestWeekKm.toFixed(1)} km`,
      name: null,
      activityId: null
    });
  }
  if (dayStreakBest > 0) {
    items.push({
      icon: 'flame-outline',
      label: 'Longest day streak',
      value: `${dayStreakBest} days`,
      name: null,
      activityId: null
    });
  }
  if (weekStreakBest > 0) {
    items.push({
      icon: 'flame-outline',
      label: 'Longest week streak',
      value: `${weekStreakBest} weeks`,
      name: null,
      activityId: null
    });
  }
  return items;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      gap: 12
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 16
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginTop: 8,
      marginBottom: 8
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12
    },
    card: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4
        },
        android: {
          elevation: 2
        }
      })
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6
    },
    cardLabel: {
      fontSize: 13,
      color: theme.textMuted,
      fontWeight: '600'
    },
    cardValue: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.primary
    },
    cardName: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4
    },
    listCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden'
    },
    typeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    typeName: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '600',
      textTransform: 'capitalize'
    },
    typeValue: {
      fontSize: 14,
      color: theme.primary,
      fontWeight: '700'
    }
  });
