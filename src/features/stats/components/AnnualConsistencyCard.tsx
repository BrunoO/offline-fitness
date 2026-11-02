import { Activity } from '@/shared/types/types';
import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory-native';
import { computeAnnualConsistencyStats, YearConsistencyStats } from '../services/consistencyStats';

export type ConsistencyMetricKey =
  | 'active_days'
  | 'activities_per_week'
  | 'longest_streak'
  | 'total_activities';

interface AnnualConsistencyCardProps {
  activities: readonly Activity[];
  availableSports: string[];
}

interface MetricChange {
  text: string;
  isPositive: boolean;
  isNeutral: boolean;
}

interface MetricItem {
  key: ConsistencyMetricKey;
  label: string;
  value: string;
  subValue?: string;
  change: MetricChange | null;
}

function computeChange(current: number, previous: number): MetricChange {
  if (!previous || previous <= 0 || !current || current <= 0) {
    return { text: '-', isPositive: true, isNeutral: true };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) {
    return { text: '0%', isPositive: true, isNeutral: true };
  }

  const sign = pct > 0 ? '+' : '';
  const text = `${sign}${pct.toFixed(0)}%`;
  return { text, isPositive: pct > 0, isNeutral: false };
}

function buildMetricItems(
  latestStat: YearConsistencyStats,
  prevStat: YearConsistencyStats | null
): MetricItem[] {
  const activeDaysChange = prevStat
    ? computeChange(latestStat.activeDays, prevStat.activeDays)
    : null;

  const activitiesPerWeekChange = prevStat
    ? computeChange(latestStat.activitiesPerWeek, prevStat.activitiesPerWeek)
    : null;

  const streakChange = prevStat
    ? computeChange(latestStat.longestStreakDays, prevStat.longestStreakDays)
    : null;

  const totalActivitiesChange = prevStat
    ? computeChange(latestStat.totalActivities, prevStat.totalActivities)
    : null;

  return [
    {
      key: 'active_days',
      label: 'Active Days',
      value: `${latestStat.activeDays} days`,
      subValue: `${Math.round(latestStat.activeDaysPercent)}% ${latestStat.isCurrentYear ? 'YTD' : 'of yr'}`,
      change: activeDaysChange
    },
    {
      key: 'activities_per_week',
      label: 'Activities / Wk',
      value: `${latestStat.activitiesPerWeek.toFixed(1)} / wk`,
      change: activitiesPerWeekChange
    },
    {
      key: 'longest_streak',
      label: 'Longest Streak',
      value: `${latestStat.longestStreakDays} days`,
      change: streakChange
    },
    {
      key: 'total_activities',
      label: 'Total Activities',
      value: `${latestStat.totalActivities}`,
      change: totalActivitiesChange
    }
  ];
}

interface MetricBadgeButtonProps {
  readonly metric: MetricItem;
  readonly isSelected: boolean;
  readonly onSelect: (key: ConsistencyMetricKey) => void;
  readonly theme: ResolvedTheme;
  readonly styles: ReturnType<typeof createStyles>;
}

function getChangeColor(change: MetricChange | null | undefined, theme: ResolvedTheme): string {
  if (!change || change.isNeutral) {
    return theme.textMuted;
  }
  return change.isPositive ? theme.success : theme.danger;
}

function MetricBadgeButton({
  metric,
  isSelected,
  onSelect,
  theme,
  styles
}: MetricBadgeButtonProps): React.JSX.Element {
  const changeColor = getChangeColor(metric.change, theme);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Show ${metric.label} trend`}
      onPress={() => onSelect(metric.key)}
      style={[styles.badgeCard, isSelected ? styles.badgeCardSelected : null]}
    >
      <Text style={styles.badgeLabel} numberOfLines={1}>
        {metric.label}
      </Text>
      <Text style={[styles.badgeValue, isSelected ? styles.badgeValueSelected : null]}>
        {metric.value}
      </Text>
      {metric.subValue ? <Text style={styles.badgeSubValue}>{metric.subValue}</Text> : null}
      {metric.change ? (
        <View style={styles.changeRow}>
          {!metric.change.isNeutral ? (
            <Ionicons
              name={metric.change.isPositive ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={changeColor}
            />
          ) : null}
          <Text style={[styles.changeText, { color: changeColor }]}>{metric.change.text} YoY</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function AnnualConsistencyCard({
  activities,
  availableSports
}: Readonly<AnnualConsistencyCardProps>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);

  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedMetric, setSelectedMetric] = useState<ConsistencyMetricKey>('active_days');

  const sportsOptions = useMemo(() => {
    return ['All', ...availableSports];
  }, [availableSports]);

  const yearlyStats: YearConsistencyStats[] = useMemo(() => {
    return computeAnnualConsistencyStats(activities, selectedSport);
  }, [activities, selectedSport]);

  const latestStat = yearlyStats.length > 0 ? (yearlyStats.at(-1) ?? null) : null;
  const prevStat = yearlyStats.length > 1 ? (yearlyStats.at(-2) ?? null) : null;

  const chartData = useMemo(() => {
    return yearlyStats.map(stat => {
      let y = 0;
      if (selectedMetric === 'active_days') {
        y = stat.activeDays;
      } else if (selectedMetric === 'activities_per_week') {
        y = stat.activitiesPerWeek;
      } else if (selectedMetric === 'longest_streak') {
        y = stat.longestStreakDays;
      } else {
        y = stat.totalActivities;
      }
      return { x: String(stat.year), y: Number.isFinite(y) ? y : 0 };
    });
  }, [yearlyStats, selectedMetric]);

  const metrics: MetricItem[] = useMemo(() => {
    if (!latestStat) return [];
    return buildMetricItems(latestStat, prevStat);
  }, [latestStat, prevStat]);

  if (yearlyStats.length === 0 || !latestStat) {
    return null;
  }

  const chartWidth = Math.max(320, yearlyStats.length * 60 + 60);

  const formatYTick = (val: number): string => {
    if (selectedMetric === 'activities_per_week') {
      return `${val.toFixed(1)}`;
    }
    return `${Math.round(val)}`;
  };

  return (
    <View style={styles.container}>
      {/* Sport Selector Chips */}
      {sportsOptions.length > 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportChipsContainer}
        >
          {sportsOptions.map(sport => {
            const isSelected = sport === selectedSport;
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

      {/* Metric Badges Grid */}
      <View style={styles.grid}>
        {metrics.map(m => (
          <MetricBadgeButton
            key={m.key}
            metric={m}
            isSelected={selectedMetric === m.key}
            onSelect={setSelectedMetric}
            theme={theme}
            styles={styles}
          />
        ))}
      </View>

      {/* Chart Section */}
      <View style={styles.chartWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chartScroll}
        >
          <VictoryChart
            domainPadding={{ x: 25, y: 15 }}
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
              tickFormat={formatYTick}
              style={{
                tickLabels: {
                  fontSize: 10,
                  fill: theme.textMuted
                }
              }}
            />
            <VictoryBar
              data={chartData}
              cornerRadius={{ top: 4 }}
              style={{
                data: {
                  fill: theme.primary,
                  fillOpacity: 0.85,
                  stroke: theme.primary,
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
    badgeSubValue: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1
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
