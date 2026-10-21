import { useActivitiesDataContext } from '@/features/activities/ActivitiesContext';
import { mergeActivities } from '@/features/activities/services/mergeActivities';
import { calculateYTDStats, YTDDataPoint, YTDStats } from '@/features/stats/services/ytd-stats';
import { ChipMultiSelect } from '@/shared/components/chip-multi-select/ChipMultiSelect';
import { seconds_to_label } from '@/shared/utils/utils';
import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  VictoryArea,
  VictoryAxis,
  VictoryChart,
  VictoryLabel,
  VictoryLegend,
  VictoryLine
} from 'victory-native';
import { useSettings } from '../StatsTabSettingsContext';

type Metric = 'distance' | 'time' | 'elevation' | 'activities';

const YTDStatsComponent: React.FC = () => {
  const { globalActivities } = useActivitiesDataContext();
  const [selectedMetric, setSelectedMetric] = useState<Metric>('distance');
  const currentYearNow = new Date().getFullYear();
  const [comparisonYear, setComparisonYear] = useState<number>(currentYearNow - 1);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set()); // empty = All
  const [showFullPreviousYear, setShowFullPreviousYear] = useState<boolean>(false);
  const { useElapsedTime, mergeSimilarActivities } = useSettings();

  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);

  const { activitiesMerged: processedActivities } = mergeActivities(
    Array.from(
      (() => {
        const s = new Set<string>();
        for (const a of globalActivities) if (a.type) s.add(a.type);
        return s;
      })()
    ),
    globalActivities,
    mergeSimilarActivities
  );

  const availableTypes = (() => {
    const s = new Set<string>();
    for (const a of processedActivities) if (a.type) s.add(a.type);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  })();

  const filteredActivities =
    selectedTypes.size === 0
      ? processedActivities
      : processedActivities.filter(a => (a.type ? selectedTypes.has(a.type) : false));

  const ytdStats: YTDStats | null =
    globalActivities.length === 0
      ? null
      : calculateYTDStats(filteredActivities, comparisonYear, showFullPreviousYear, useElapsedTime);

  if (!ytdStats) {
    return (
      <View style={styles.container}>
        <Text>Loading YTD stats...</Text>
      </View>
    );
  }

  const { currentYear, previousYear } = ytdStats;

  const getMetricData = (data: YTDDataPoint[], metric: Metric) => {
    return data.map(d => ({ x: d.dayOfYear, y: d[metric], quarterLabel: d.quarterLabel }));
  };

  const formatYValue = (value: number, metric: Metric) => {
    if (metric === 'time') {
      return seconds_to_label(value);
    }
    if (metric === 'distance') {
      return `${Math.round(value)} km`;
    }
    if (metric === 'elevation') {
      return `${Math.round(value)} m`;
    }
    // activities
    return `${Math.round(value)}`;
  };

  const metricSegments: { key: Metric; label: string }[] = [
    { key: 'distance', label: 'Distance' },
    { key: 'time', label: 'Time' },
    { key: 'elevation', label: 'Elevation' },
    { key: 'activities', label: 'Activities' }
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Year-to-Date Comparison</Text>

      {/* Activity type filters */}
      <ChipMultiSelect
        items={availableTypes}
        selectedItems={selectedTypes}
        onChange={setSelectedTypes}
        includeAll
      />

      <View style={styles.stepperRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous comparison year"
          onPress={() => setComparisonYear(y => y - 1)}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperText}>◀︎</Text>
        </TouchableOpacity>
        <Text style={styles.stepperYearLabel}>Compare year: {comparisonYear}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Next comparison year"
          onPress={() => setComparisonYear(y => Math.min(y + 1, currentYearNow - 1))}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperText}>▶︎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.segmentedContainer}>
          {metricSegments.map(seg => (
            <TouchableOpacity
              key={seg.key}
              accessibilityRole="button"
              accessibilityLabel={`Show ${seg.label}`}
              onPress={() => setSelectedMetric(seg.key)}
              style={[styles.segment, selectedMetric === seg.key ? styles.segmentActive : null]}
            >
              <Text
                style={[
                  styles.segmentText,
                  selectedMetric === seg.key ? styles.segmentTextActive : null
                ]}
              >
                {seg.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.toggleButton, showFullPreviousYear ? styles.toggleButtonActive : null]}
          onPress={() => setShowFullPreviousYear(!showFullPreviousYear)}
          accessibilityLabel={
            showFullPreviousYear ? 'Show YTD comparison' : 'Show full year comparison'
          }
        >
          <Ionicons
            name={showFullPreviousYear ? 'calendar-outline' : 'calendar-clear-outline'}
            size={18}
            color={showFullPreviousYear ? theme.onPrimary : theme.text}
          />
        </TouchableOpacity>
      </View>

      <VictoryChart
        theme={chartTheme}
        height={300}
        width={360}
        padding={{ top: 20, right: 0, bottom: 50, left: 0 }}
      >
        <VictoryLegend
          x={50}
          y={0}
          orientation="horizontal"
          gutter={20}
          data={[
            {
              name: `This Year (${new Date().getFullYear()})`,
              symbol: { fill: theme.primary }
            },
            {
              name: showFullPreviousYear
                ? `Full Year (${comparisonYear})`
                : `YTD (${comparisonYear})`,
              symbol: { fill: theme.chartComparison }
            }
          ]}
        />
        {/* Quarter Background Areas */}
        {(() => {
          const maxY = Math.max(
            ...currentYear.data.map(point => point[selectedMetric]),
            ...previousYear.data.map(point => point[selectedMetric])
          );

          // Get the maximum day to show based on toggle state
          const maxDayToShow = showFullPreviousYear
            ? 365
            : Math.max(...currentYear.data.map(point => point.dayOfYear));

          // Create quarters that connect properly
          const quarterColors = theme.chartTints; // Q1-Q4 colors
          const quarterBoundaries = [1, 91, 182, 274, 366]; // Start of each quarter + end of year

          const quarters = [];
          for (let i = 0; i < quarterBoundaries.length - 1; i++) {
            const start = quarterBoundaries[i];
            const end = quarterBoundaries[i + 1] - 1; // End of quarter is day before next quarter starts

            // Only include quarters that start before or at maxDayToShow
            if (start <= maxDayToShow) {
              const actualEnd = Math.min(end, maxDayToShow);
              quarters.push({
                start: start,
                end: actualEnd,
                color: quarterColors[i]
              });
            }
          }

          return quarters.map(quarter => {
            // Create horizontal filled area using VictoryArea with baseline
            const quarterStart = quarter.start;
            const quarterEnd = quarter.end;

            // Create area data: start at bottom, go to top, then back to bottom
            const areaData = [
              { x: quarterStart, y: 0 },
              { x: quarterStart, y: maxY },
              { x: quarterEnd, y: maxY },
              { x: quarterEnd, y: 0 }
            ];

            return (
              <VictoryArea
                key={`quarter-bg-${quarter.start}`}
                data={areaData}
                style={{
                  data: {
                    fill: quarter.color,
                    fillOpacity: 0.4,
                    stroke: 'none'
                  }
                }}
              />
            );
          });
        })()}

        <VictoryLine
          data={getMetricData(currentYear.data, selectedMetric)}
          style={{ data: { stroke: theme.primary } }}
        />
        <VictoryLine
          data={getMetricData(previousYear.data, selectedMetric)}
          style={{ data: { stroke: theme.chartComparison, strokeDasharray: '4' } }}
        />

        <VictoryAxis label="Day of Year" style={{ axisLabel: { padding: 30 } }} />
        <VictoryAxis
          dependentAxis
          tickFormat={t => formatYValue(t, selectedMetric)}
          tickLabelComponent={<VictoryLabel dx={18} textAnchor="start" />}
          style={{ tickLabels: { fontSize: 10 } }}
        />
      </VictoryChart>

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Summary</Text>
        <View style={styles.summaryTable}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryHeader}></Text>
            <Text style={styles.summaryHeader}>This Year</Text>
            <Text style={styles.summaryHeader}>
              {showFullPreviousYear ? `Full Year ${comparisonYear}` : `YTD ${comparisonYear}`}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryCellLabel}>Distance</Text>
            <Text
              style={styles.summaryCell}
            >{`${(currentYear.totalDistance / 1000).toFixed(0)} km`}</Text>
            <Text
              style={styles.summaryCell}
            >{`${(previousYear.totalDistance / 1000).toFixed(0)} km`}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryCellLabel}>
              {useElapsedTime ? 'Time (Elapsed)' : 'Time (Moving)'}
            </Text>
            <Text style={styles.summaryCell}>{seconds_to_label(currentYear.totalTime)}</Text>
            <Text style={styles.summaryCell}>{seconds_to_label(previousYear.totalTime)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryCellLabel}>Elevation</Text>
            <Text style={styles.summaryCell}>{`${currentYear.totalElevation.toFixed(0)} m`}</Text>
            <Text style={styles.summaryCell}>{`${previousYear.totalElevation.toFixed(0)} m`}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryCellLabel}>Activities</Text>
            <Text style={styles.summaryCell}>{currentYear.totalActivities}</Text>
            <Text style={styles.summaryCell}>{previousYear.totalActivities}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      padding: 1,
      backgroundColor: theme.surface,
      borderRadius: 10,
      margin: 1,
      elevation: 2
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6
    },
    stepperButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: theme.surfaceMuted,
      marginHorizontal: 8
    },
    stepperText: {
      fontSize: 16,
      color: theme.text
    },
    stepperYearLabel: {
      fontSize: 14,
      fontWeight: 'bold',
      color: theme.text
    },
    toggleButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: theme.surfaceSunken,
      marginHorizontal: 5,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 40
    },
    toggleButtonActive: {
      backgroundColor: theme.primary
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 10
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      gap: 8
    },
    segmentedContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSunken,
      borderRadius: 24,
      padding: 2
    },
    segment: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20
    },
    segmentActive: {
      backgroundColor: theme.primary
    },
    segmentText: {
      color: theme.text,
      fontWeight: '600'
    },
    segmentTextActive: {
      color: theme.onPrimary
    },
    summaryContainer: {
      marginTop: 20
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10
    },
    summaryTable: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 5
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    summaryHeader: {
      fontWeight: 'bold',
      flex: 1,
      textAlign: 'center'
    },
    summaryCellLabel: {
      fontWeight: 'bold',
      flex: 1
    },
    summaryCell: {
      flex: 1,
      textAlign: 'center'
    }
  });

export default YTDStatsComponent;
