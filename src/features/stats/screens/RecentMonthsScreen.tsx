import { Activity, ChipMultiSelect, seconds_to_label, simpleLogger } from '@/shared';

import { monthlyData2, MonthSummary } from '../services/stats';

import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';

import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import React, { JSX, useMemo, useState } from 'react';

import { useActivitiesContext, useProcessedActivities } from '@/features/activities';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLabel } from 'victory-native';
import { useSettings } from '../StatsTabSettingsContext';

/**
 * Formats a date for display on the chart axis.
 * @param date The date to format.
 * @returns The formatted date string.
 */
function formatDateAxis(date: Date) {
  return date.toLocaleString('en-US', { month: 'short' });
}

/**
 * A horizontal bar chart component.
 * @param title The title of the chart.
 * @param data The data for the chart.
 * @param barColor The color of the bars.
 * @param accessFunction A function to access the value of each data point.
 * @param labelFunction A function to format the label of each data point.
 * @param invertedAxis Whether to invert the axis.
 * @returns A React component.
 */
function HorizontalBarChart({
  title,
  data,
  barColor,
  accessFunction,
  labelFunction,
  invertedAxis
}: Readonly<{
  title: string;
  data: MonthSummary[];
  barColor: string;
  accessFunction: (arg: MonthSummary) => number;
  labelFunction: ({ datum }: { datum: MonthSummary }) => string;
  invertedAxis: boolean;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  type ProcessedDatum = MonthSummary & {
    __isZero: boolean;
    __value: number;
    __label: string;
  };

  const chartHeight = data.length * 25; // Adjust to change the height per bar
  const processed: ProcessedDatum[] = data.map(d => {
    const raw = accessFunction(d);
    const isZero = raw <= 0 || Number.isNaN(raw);
    return {
      ...d,
      __isZero: isZero,
      __value: isZero ? 0.0001 : raw, // ensure label renders
      __label: isZero ? 'No activity' : labelFunction({ datum: d })
    };
  });
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>{title}</Text>
      <VictoryChart
        theme={chartTheme}
        height={chartHeight}
        padding={{ top: 20, bottom: 20, left: 5, right: 40 }}
      >
        <VictoryBar
          horizontal
          style={{
            data: {
              fill: ({ datum }) =>
                (datum as ProcessedDatum).__isZero ? theme.chartZeroFill : barColor,
              fillOpacity: ({ datum }) => ((datum as ProcessedDatum).__isZero ? 1 : 0.25),
              stroke: ({ datum }) =>
                (datum as ProcessedDatum).__isZero ? theme.chartZeroStroke : barColor,
              strokeWidth: 1.5
            }
          }}
          data={processed}
          barWidth={Platform.OS === 'android' ? 20 : undefined}
          x="month"
          y={d => (d as ProcessedDatum).__value}
          labels={({ datum }) => (datum as ProcessedDatum).__label}
          labelComponent={
            <VictoryLabel
              x={20}
              dx={0}
              textAnchor="start"
              verticalAnchor="middle"
              style={{ fontSize: 12, fill: theme.text }}
            />
          }
          cornerRadius={{ topRight: 4, bottomRight: 4 }}
        />
        <VictoryAxis
          tickFormat={() => ``}
          invertAxis={invertedAxis}
          dependentAxis={invertedAxis}
          style={{
            axis: { stroke: 'none' },
            ticks: { stroke: 'none' },
            tickLabels: { fill: 'none' },
            grid: { stroke: 'transparent' },
            axisLabel: { padding: 30 }
          }}
        />
      </VictoryChart>
    </View>
  );
}

/**
 * A screen for displaying recent months' data.
 * @param route The route object.
 * @returns A React component.
 */
export function RecentMonthsScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { numberRecentMonths, useElapsedTime } = useSettings();
  const { globalActivities, myActivitiesDiscovered, refreshActivities, fetchingData } =
    useActivitiesContext();
  const activityTypes = Array.from(myActivitiesDiscovered).sort((a, b) =>
    a.localeCompare(b)
  ) as string[];
  const { myActivitiesToUse, allActivitiesToUse } = useProcessedActivities(
    activityTypes,
    globalActivities
  );
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(
    () => new Set(activityTypes)
  );

  // Removed syncing effect to avoid overriding user selection

  // Intentionally no effect syncing selectedActivities to myActivitiesToUse

  const source =
    selectedActivities.size === 0
      ? allActivitiesToUse
      : allActivitiesToUse.filter(a => selectedActivities.has(a.type));
  const mData = monthlyData2(
    source,
    (a: Activity) => a.distance,
    (a: Activity) => a.total_elevation_gain,
    numberRecentMonths,
    useElapsedTime
  );

  // Filtering handled by ChipMultiSelect

  const showInProgress = () => {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          animating={true}
          size="large"
          color={theme.primary}
          style={styles.loadingIndicator}
        />
        <Text style={styles.loadingText}>Computing monthly data...</Text>
        <Text style={styles.loadingSubtext}>This may take a moment</Text>
      </View>
    );
  };

  simpleLogger.warn('leaving RecentMonthsScreen', 'length mData', mData.length);
  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <ChipMultiSelect
          items={myActivitiesToUse}
          selectedItems={selectedActivities}
          onChange={setSelectedActivities}
          includeAll
        />
      </View>

      {mData.length === 0 ? (
        showInProgress()
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={fetchingData}
              onRefresh={refreshActivities}
              tintColor={theme.primary}
            />
          }
        >
          <View style={styles.chartCard}>
            <HorizontalBarChart
              title={`Distance last ${numberRecentMonths} months`}
              data={mData}
              barColor={theme.chartSeries[0]}
              accessFunction={(d: MonthSummary) => d.distance}
              labelFunction={({ datum }: { datum: MonthSummary }) =>
                `${formatDateAxis(datum.month) + ' - ' + datum.distance.toFixed(0)}km`
              }
              invertedAxis={false}
            />
          </View>
          <View style={styles.chartCard}>
            <HorizontalBarChart
              title={`Elevation last ${numberRecentMonths} months`}
              data={mData}
              barColor={theme.chartSeries[3]}
              accessFunction={(d: MonthSummary) => d.elevation}
              labelFunction={({ datum }: { datum: MonthSummary }) =>
                `${formatDateAxis(datum.month) + ' - ' + datum.elevation.toFixed(0)}m`
              }
              invertedAxis={true}
            />
          </View>
          <View style={styles.chartCard}>
            <HorizontalBarChart
              title={`Time last ${numberRecentMonths} months (${useElapsedTime ? 'Elapsed' : 'Moving'})`}
              data={mData}
              barColor={theme.chartSeries[4]}
              accessFunction={(d: MonthSummary) => d.time ?? 0}
              labelFunction={({ datum }: { datum: MonthSummary }) =>
                `${formatDateAxis(datum.month) + ' - ' + seconds_to_label(Math.round((datum.time ?? 0) * 3600))}`
              }
              invertedAxis={false}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 16
    },
    filterContainer: {
      marginBottom: 16,
      paddingHorizontal: 4,
      paddingTop: 8
    },
    scrollContainer: {
      paddingBottom: 20
    },
    chartCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      marginBottom: 16,
      padding: 8,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 2
          },
          shadowOpacity: 0.1,
          shadowRadius: 3.84
        },
        android: {
          elevation: 5
        },
        web: {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      })
    },
    chartContainer: {
      flex: 1
    },
    chartTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.primary,
      marginBottom: 12,
      textAlign: 'center'
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60
    },
    loadingIndicator: {
      marginBottom: 16
    },
    loadingText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.primary,
      marginBottom: 4
    },
    loadingSubtext: {
      fontSize: 14,
      color: theme.textMuted
    }
  });
