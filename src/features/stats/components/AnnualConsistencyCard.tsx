import { Activity } from '@/shared/types/types';
import { createChartTheme, useTheme } from '@/theme';
import React, { JSX, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory-native';
import { computeAnnualConsistencyStats, YearConsistencyStats } from '../services/consistencyStats';
import { createMetricCardStyles } from './metricCardStyles';
import { MetricBadgeButton, MetricChange } from './MetricBadgeButton';

export type ConsistencyMetricKey =
  | 'active_days'
  | 'activities_per_week'
  | 'longest_streak'
  | 'total_activities';

interface AnnualConsistencyCardProps {
  activities: readonly Activity[];
  availableSports: string[];
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

export function AnnualConsistencyCard({
  activities,
  availableSports
}: Readonly<AnnualConsistencyCardProps>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createMetricCardStyles(theme), [theme]);
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
            onSelect={key => setSelectedMetric(key as ConsistencyMetricKey)}
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
