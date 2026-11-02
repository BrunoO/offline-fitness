import { Activity } from '@/shared/types/types';
import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryScatter } from 'victory-native';
import {
  computeYearlyPerformanceStats,
  formatPace,
  isPaceSport,
  YearPerformanceStats
} from '../services/performanceStats';

export type PerformanceMetricKey =
  | 'pace_speed'
  | 'elevation_per_10km'
  | 'avg_distance'
  | 'avg_duration';

interface PerformanceTrendsCardProps {
  activities: readonly Activity[];
  availableSports: string[];
  useElapsedTime: boolean;
}

interface MetricChange {
  text: string;
  isPositive: boolean;
  isNeutral: boolean;
}

interface MetricItem {
  key: PerformanceMetricKey;
  label: string;
  value: string;
  change: MetricChange | null;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function computeChange(current: number, previous: number, isPace: boolean): MetricChange {
  if (!previous || previous <= 0 || !current || current <= 0) {
    return { text: '-', isPositive: true, isNeutral: true };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) {
    return { text: '0%', isPositive: true, isNeutral: true };
  }

  const sign = pct > 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(0)}%`;

  // For pace: lower time is better (faster). For others: higher is better.
  const isPositive = isPace ? pct < 0 : pct > 0;
  return { text, isPositive, isNeutral: false };
}

function computeCandidateSports(
  activities: readonly Activity[],
  availableSports: string[]
): string[] {
  const counts = new Map<string, number>();
  for (const a of activities) {
    if (a.distance && a.distance > 0 && availableSports.includes(a.type)) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
  }
  return availableSports
    .filter(s => (counts.get(s) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
}

function buildMetricItems(
  latestStat: YearPerformanceStats,
  prevStat: YearPerformanceStats | null,
  isCurrentPace: boolean
): MetricItem[] {
  const primaryRateValue = isCurrentPace
    ? formatPace(latestStat.avgPaceMinPerKm)
    : `${latestStat.avgSpeedKmh.toFixed(1)} km/h`;

  const primaryRateChange = prevStat
    ? computeChange(
        isCurrentPace ? latestStat.avgPaceMinPerKm : latestStat.avgSpeedKmh,
        isCurrentPace ? prevStat.avgPaceMinPerKm : prevStat.avgSpeedKmh,
        isCurrentPace
      )
    : null;

  return [
    {
      key: 'pace_speed',
      label: isCurrentPace ? 'Avg Pace' : 'Avg Speed',
      value: primaryRateValue,
      change: primaryRateChange
    },
    {
      key: 'elevation_per_10km',
      label: 'Elev / 10km',
      value: `${Math.round(latestStat.elevationPer10Km)} m`,
      change: prevStat
        ? computeChange(latestStat.elevationPer10Km, prevStat.elevationPer10Km, false)
        : null
    },
    {
      key: 'avg_distance',
      label: 'Avg Distance',
      value: `${latestStat.avgDistanceKm.toFixed(1)} km`,
      change: prevStat
        ? computeChange(latestStat.avgDistanceKm, prevStat.avgDistanceKm, false)
        : null
    },
    {
      key: 'avg_duration',
      label: 'Avg Duration',
      value: formatDuration(latestStat.avgDurationSeconds),
      change: prevStat
        ? computeChange(latestStat.avgDurationSeconds, prevStat.avgDurationSeconds, false)
        : null
    }
  ];
}

export function PerformanceTrendsCard({
  activities,
  availableSports,
  useElapsedTime
}: Readonly<PerformanceTrendsCardProps>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);

  const candidateSports = useMemo(
    () => computeCandidateSports(activities, availableSports),
    [activities, availableSports]
  );

  const [selectedSport, setSelectedSport] = useState<string>(() => candidateSports[0] ?? '');
  const [selectedMetric, setSelectedMetric] = useState<PerformanceMetricKey>('pace_speed');

  const currentSport = candidateSports.includes(selectedSport)
    ? selectedSport
    : (candidateSports[0] ?? '');

  const yearlyStats: YearPerformanceStats[] = useMemo(() => {
    if (!currentSport) return [];
    return computeYearlyPerformanceStats(activities, currentSport, useElapsedTime);
  }, [activities, currentSport, useElapsedTime]);

  const isCurrentPace = isPaceSport(currentSport);
  const latestStat = yearlyStats.length > 0 ? yearlyStats[yearlyStats.length - 1] : null;
  const prevStat = yearlyStats.length > 1 ? yearlyStats[yearlyStats.length - 2] : null;

  const chartData = useMemo(() => {
    return yearlyStats.map(stat => {
      let y = 0;
      if (selectedMetric === 'pace_speed') {
        y = isCurrentPace ? stat.avgPaceMinPerKm : stat.avgSpeedKmh;
      } else if (selectedMetric === 'elevation_per_10km') {
        y = stat.elevationPer10Km;
      } else if (selectedMetric === 'avg_distance') {
        y = stat.avgDistanceKm;
      } else {
        y = stat.avgDurationSeconds / 60;
      }
      return { x: String(stat.year), y: Number.isFinite(y) ? y : 0 };
    });
  }, [yearlyStats, selectedMetric, isCurrentPace]);

  const isPaceActive = selectedMetric === 'pace_speed' && isCurrentPace;
  const yDomain: [number, number] | undefined = useMemo(() => {
    if (!isPaceActive || chartData.length === 0) return undefined;
    const values = chartData.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.15 || 0.5;
    return [max + padding, Math.max(1, min - padding)];
  }, [isPaceActive, chartData]);

  const metrics: MetricItem[] = useMemo(() => {
    if (!latestStat) return [];
    return buildMetricItems(latestStat, prevStat, isCurrentPace);
  }, [latestStat, prevStat, isCurrentPace]);

  if (candidateSports.length === 0 || yearlyStats.length === 0 || !latestStat) {
    return null;
  }

  const chartWidth = Math.max(320, yearlyStats.length * 60 + 60);

  const formatYTick = (val: number): string => {
    if (selectedMetric === 'pace_speed') {
      return isCurrentPace ? formatPace(val) : `${Math.round(val)}`;
    }
    if (selectedMetric === 'elevation_per_10km') {
      return `${Math.round(val)}m`;
    }
    if (selectedMetric === 'avg_distance') {
      return `${val.toFixed(0)}k`;
    }
    return `${Math.round(val)}m`;
  };

  return (
    <View style={styles.container}>
      {candidateSports.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportChipsContainer}
        >
          {candidateSports.map(sport => {
            const isSelected = sport === currentSport;
            return (
              <TouchableOpacity
                key={sport}
                accessibilityRole="button"
                accessibilityLabel={`Select sport ${sport}`}
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

      <View style={styles.grid}>
        {metrics.map(m => {
          const isSelected = selectedMetric === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              accessibilityRole="button"
              accessibilityLabel={`Show ${m.label} trend`}
              onPress={() => setSelectedMetric(m.key)}
              style={[styles.badgeCard, isSelected ? styles.badgeCardSelected : null]}
            >
              <Text style={styles.badgeLabel} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={[styles.badgeValue, isSelected ? styles.badgeValueSelected : null]}>
                {m.value}
              </Text>
              {m.change ? (
                <View style={styles.changeRow}>
                  {!m.change.isNeutral ? (
                    <Ionicons
                      name={m.change.isPositive ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={m.change.isPositive ? theme.success : theme.danger}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.changeText,
                      m.change.isNeutral
                        ? { color: theme.textMuted }
                        : { color: m.change.isPositive ? theme.success : theme.danger }
                    ]}
                  >
                    {m.change.text} YoY
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.chartWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chartScroll}
        >
          <VictoryChart
            domainPadding={{ x: 25, y: 20 }}
            theme={chartTheme}
            height={220}
            width={chartWidth}
            padding={{ top: 20, bottom: 35, left: 45, right: 20 }}
          >
            <VictoryAxis
              style={{
                tickLabels: {
                  fontSize: 11,
                  fill: theme.textMuted
                }
              }}
            />
            <VictoryAxis
              dependentAxis
              domain={yDomain}
              tickFormat={formatYTick}
              style={{
                tickLabels: {
                  fontSize: 10,
                  fill: theme.textMuted
                }
              }}
            />
            <VictoryLine
              data={chartData}
              style={{
                data: {
                  stroke: theme.primary,
                  strokeWidth: 2.5
                }
              }}
            />
            <VictoryScatter
              data={chartData}
              size={4.5}
              style={{
                data: {
                  fill: theme.primary,
                  stroke: theme.surface,
                  strokeWidth: 1.5
                }
              }}
            />
          </VictoryChart>
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    sportChipsContainer: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 2
    },
    sportChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.surfaceSunken
    },
    sportChipActive: {
      backgroundColor: theme.primary
    },
    sportChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    sportChipTextActive: {
      color: theme.onPrimary
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12
    },
    badgeCard: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: theme.surfaceSunken,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1.5,
      borderColor: 'transparent'
    },
    badgeCardSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.surface
    },
    badgeLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '600',
      marginBottom: 2
    },
    badgeValue: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text
    },
    badgeValueSelected: {
      color: theme.primary
    },
    changeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2
    },
    changeText: {
      fontSize: 11,
      fontWeight: '600'
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4
    },
    chartScroll: {
      flexGrow: 1,
      justifyContent: 'center'
    }
  });
