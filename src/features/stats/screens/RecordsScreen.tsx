import { useActivitiesContext } from '@/features/activities';
import { Activity, formatPace, isPaceSport, RootStackNavigationProp } from '@/shared';
import { ResolvedTheme, useTheme } from '@/theme';
import { STACK_ROUTES } from '@/constants';

import { computeDayStreaks, computeWeekStreaks } from '@/shared/services/streaks';
import { isNoGpsActivity } from '@/shared/utils/activityCategories';
import {
  ActivityExtremes,
  computeActivityExtremes,
  computeRecordSportOptions,
  computeRunningBenchmarkPRs,
  DistanceBenchmarkResult,
  formatBenchmarkTime,
  isRunningActivityType
} from '../services/recordsStats';
import { weeklyData } from '../services/stats';
import { useSettings } from '../StatsTabSettingsContext';
import { useNavigation } from '@react-navigation/native';
import React, { JSX, useMemo, useState } from 'react';
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
 * A screen listing all-time personal records derived from the user's activities,
 * with sport filtering and classic running distance benchmarks (5K, 10K, Half Marathon, Marathon).
 * @returns A React component.
 */
export function RecordsScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<RootStackNavigationProp>();
  const { globalActivities } = useActivitiesContext();
  const { numberRecentWeeks, useElapsedTime } = useSettings();

  const sportOptions = useMemo(
    () => computeRecordSportOptions(globalActivities),
    [globalActivities]
  );

  const [selectedSport, setSelectedSport] = useState<string>(() => {
    const options = computeRecordSportOptions(globalActivities);
    return options.includes('Run') ? 'Run' : 'All';
  });

  const activeSport = sportOptions.includes(selectedSport) ? selectedSport : 'All';

  const filteredActivities = useMemo(() => {
    if (activeSport === 'All') return globalActivities;
    return globalActivities.filter(a => a.type === activeSport);
  }, [globalActivities, activeSport]);

  const goToActivity = (activityId: string | null) => {
    if (!activityId) return;
    navigation.navigate(STACK_ROUTES.ActivityDetail, { activityId });
  };

  // Aggregate all-time extremes/streaks over the filtered activity set; memoize so
  // it doesn't recompute on every render.
  const records = useMemo<RecordItem[]>(() => {
    if (filteredActivities.length === 0) return [];
    const extremes = computeActivityExtremes(filteredActivities, useElapsedTime);
    const longestWeekKm = computeLongestWeekKm(
      filteredActivities,
      numberRecentWeeks,
      useElapsedTime
    );
    const dayStreak = computeDayStreaks(filteredActivities);
    const weekStreak = computeWeekStreaks(filteredActivities);
    return buildRecordItems(extremes, longestWeekKm, dayStreak.best, weekStreak.best, activeSport);
  }, [filteredActivities, numberRecentWeeks, useElapsedTime, activeSport]);

  const runningBenchmarks = useMemo<DistanceBenchmarkResult[]>(() => {
    const showBenchmarks = activeSport === 'All' || isRunningActivityType(activeSport);
    if (!showBenchmarks) return [];
    const sourceActivities = activeSport === 'All' ? globalActivities : filteredActivities;
    return computeRunningBenchmarkPRs(sourceActivities, useElapsedTime);
  }, [globalActivities, filteredActivities, activeSport, useElapsedTime]);

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

  const sectionHeading = activeSport === 'All' ? 'All-time records' : `${activeSport} records`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {sportOptions.length > 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportChipsContainer}
        >
          {sportOptions.map(sport => {
            const isSelected = sport === activeSport;
            return (
              <TouchableOpacity
                key={sport}
                accessibilityRole="button"
                accessibilityLabel={`Filter records by ${sport}`}
                onPress={() => setSelectedSport(sport)}
                style={[styles.sportChip, isSelected ? styles.sportChipActive : null]}
              >
                <Text
                  style={[styles.sportChipText, isSelected ? styles.sportChipTextActive : null]}
                >
                  {sport}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {runningBenchmarks.length > 0 ? (
        <RunningBenchmarksSection
          benchmarks={runningBenchmarks}
          onPressActivity={goToActivity}
          styles={styles}
          theme={theme}
        />
      ) : null}

      <Text style={styles.sectionTitle}>{sectionHeading}</Text>
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

interface RunningBenchmarksSectionProps {
  benchmarks: readonly DistanceBenchmarkResult[];
  onPressActivity: (activityId: string) => void;
  styles: ReturnType<typeof createStyles>;
  theme: ResolvedTheme;
}

function RunningBenchmarksSection({
  benchmarks,
  onPressActivity,
  styles,
  theme
}: Readonly<RunningBenchmarksSectionProps>): JSX.Element {
  return (
    <>
      <Text style={styles.sectionTitle}>Running distance benchmarks</Text>
      <View style={styles.grid}>
        {benchmarks.map(item => (
          <TouchableOpacity
            key={item.key}
            style={styles.card}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} personal record ${formatBenchmarkTime(item.estimatedTimeSeconds)}`}
            onPress={() => onPressActivity(item.activityId)}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="medal-outline" size={20} color={theme.primary} />
              <Text style={styles.cardLabel}>{item.label}</Text>
            </View>
            <Text style={styles.cardValue}>{formatBenchmarkTime(item.estimatedTimeSeconds)}</Text>
            <Text style={styles.benchmarkSubValue}>{formatPace(item.paceMinPerKm)} /km</Text>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.activityName} ({(item.activityDistanceMeters / 1000).toFixed(1)} km)
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
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

function appendRateRecords(
  items: RecordItem[],
  extremes: ActivityExtremes,
  activeSport: string
): void {
  const { fastestSpeed, bestPace } = extremes;
  const isSelectedPace = activeSport !== 'All' && isPaceSport(activeSport);
  const showSpeed = activeSport === 'All' || !isSelectedPace;
  const showPace = activeSport === 'All' || isSelectedPace;

  if (showPace && bestPace.value !== Infinity) {
    items.push({
      icon: 'footsteps-outline',
      label: 'Best pace',
      value: `${formatPace(bestPace.value)} /km`,
      name: bestPace.name,
      activityId: bestPace.id
    });
  }
  if (showSpeed && fastestSpeed.value > 0) {
    items.push({
      icon: 'speedometer-outline',
      label: 'Fastest average speed',
      value: `${fastestSpeed.value.toFixed(1)} km/h`,
      name: fastestSpeed.name,
      activityId: fastestSpeed.id
    });
  }
}

function buildRecordItems(
  extremes: ActivityExtremes,
  longestWeekKm: number,
  dayStreakBest: number,
  weekStreakBest: number,
  activeSport: string
): RecordItem[] {
  const items: RecordItem[] = [];
  const { longestDistance, longestDuration, mostElevation } = extremes;

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
  appendRateRecords(items, extremes, activeSport);
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
    sportChipsContainer: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 2,
      paddingBottom: 4
    },
    sportChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.surfaceSunken,
      borderWidth: 1,
      borderColor: theme.border
    },
    sportChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary
    },
    sportChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    sportChipTextActive: {
      color: theme.onPrimary
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
    benchmarkSubValue: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      marginTop: 2
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
