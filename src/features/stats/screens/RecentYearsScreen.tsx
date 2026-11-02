import {
  Activity,
  formatYearlyTable,
  isNoGpsActivity,
  seconds_to_label,
  sortRowsOnYearDescending
} from '@/shared';

import { yearlyData } from '../services/stats';

import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useActivitiesContext, useProcessedActivities } from '@/features/activities';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Row, Table } from 'react-native-reanimated-table';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryStack } from 'victory-native';
import YTDStatsComponent from '../components/YTDStatsComponent';
import { PerformanceTrendsCard } from '../components/PerformanceTrendsCard';
import { useSettings } from '../StatsTabSettingsContext';

//https://www.waldo.com/blog/react-native-table

// vertical centering of tables
// https://stackoverflow.com/questions/32664397/react-native-vertical-centering-when-using-scrollview

/**
 * Renders a screen displaying yearly statistics for user activities.
 * It includes tables for hours and distances, and bar charts for distances per activity.
 *
 * @param {RecentYearsScreenProps} props - The props for the component, including navigation and route params.
 * @returns {JSX.Element} The RecentYearsScreen component.
 */
const formatThousands = (value: string): string => {
  const parts = value.split('.');
  const intPart = parts[0];
  const decPart = parts.length > 1 ? `.${parts[1]}` : '';
  let grouped = '';
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) {
      grouped += ' ';
    }
    grouped += intPart[i];
  }
  return grouped + decPart;
};

export function RecentYearsScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { globalActivities, myActivitiesDiscovered, refreshActivities, fetchingData } =
    useActivitiesContext();
  const activityTypes = useMemo(
    () => Array.from(myActivitiesDiscovered).sort((a, b) => a.localeCompare(b)) as string[],
    [myActivitiesDiscovered]
  );
  const { myActivitiesToUse, allActivitiesToUse } = useProcessedActivities(
    activityTypes,
    globalActivities
  );
  const [loading, setLoading] = useState(true);

  const { useElapsedTime } = useSettings();

  // No-GPS activities (e.g. Yoga) have no distance or elevation data.
  // Filter both the type list (column headers) and the activity data before
  // passing to yearlyData — yearlyData's internal Map is keyed strictly by
  // the provided type list, so an unrecognized type in allActivities would
  // silently produce NaN totals.
  const myActivitiesWithGps = useMemo(
    () => myActivitiesToUse.filter(t => !isNoGpsActivity(t)),
    [myActivitiesToUse]
  );
  const activitiesWithGps = useMemo(
    () => allActivitiesToUse.filter(a => !isNoGpsActivity(a.type)),
    [allActivitiesToUse]
  );

  // Duplicate 'Year' at end to keep year visible when horizontally scrolled
  const tableHoursHeaders = ['Year', ...myActivitiesToUse, 'Total', 'w/Ave.', 'Year'];

  const tableDistanceHeaders = ['Year', ...myActivitiesWithGps, 'Total', 'w/Ave.', 'Year'];

  const tableElevationHeaders = ['Year', ...myActivitiesWithGps, 'Total', 'w/Ave.', 'Year'];

  const widthsHours = tableHoursHeaders.map(h => (h === 'Total' || h === 'w/Ave.' ? 70 : 60));
  const widthsDistance = tableDistanceHeaders.map(h => (h === 'Total' || h === 'w/Ave.' ? 70 : 60));
  const widthsElevation = tableElevationHeaders.map(h =>
    h === 'Total' || h === 'w/Ave.' ? 70 : 60
  );

  // Use useElapsedTime to determine whether to use elapsed_time or moving_time
  const dataTime = useMemo(
    () =>
      yearlyData(myActivitiesToUse, allActivitiesToUse, (a: Activity) =>
        useElapsedTime ? a.elapsed_time : a.moving_time
      ),
    [myActivitiesToUse, allActivitiesToUse, useElapsedTime]
  );

  const dataHoursFormated = useMemo(() => {
    const sortedDataTime = [...dataTime].sort(sortRowsOnYearDescending);
    const formattedTable = formatYearlyTable(sortedDataTime, seconds_to_label);
    return formattedTable.map(row => [...row, row[0]]);
  }, [dataTime]);

  const dataDistances = useMemo(() => {
    return formatYearlyTable(
      yearlyData(myActivitiesWithGps, activitiesWithGps, (a: Activity) => a.distance).sort(
        sortRowsOnYearDescending
      ),
      (x: number) => formatThousands((x / 1000).toFixed(0))
    ).map(row => [...row, row[0]]);
  }, [myActivitiesWithGps, activitiesWithGps]);

  const dataElevations = useMemo(() => {
    return formatYearlyTable(
      yearlyData(
        myActivitiesWithGps,
        activitiesWithGps,
        (a: Activity) => a.total_elevation_gain
      ).sort(sortRowsOnYearDescending),
      (x: number) => formatThousands((x / 1000).toFixed(1))
    ).map(row => [...row, row[0]]);
  }, [myActivitiesWithGps, activitiesWithGps]);

  useEffect(() => {
    setLoading(false);
  }, [dataTime]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          animating={true}
          size="large"
          color={theme.primary}
          style={styles.loadingIndicator}
        />
        <Text style={styles.loadingText}>Computing yearly data...</Text>
        <Text style={styles.loadingSubtext}>This may take a moment</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
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
        <YTDStatsComponent />

        {/* Hours Table Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {useElapsedTime ? 'Hours (Elapsed Time)' : 'Hours (Moving Time)'}
          </Text>
          <View style={styles.tableCard}>
            <DataTable headers={tableHoursHeaders} widths={widthsHours} data={dataHoursFormated} />
          </View>
        </View>

        {/* Distances Table Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distances (km)</Text>
          <View style={styles.tableCard}>
            <DataTable
              headers={tableDistanceHeaders}
              widths={widthsDistance}
              data={dataDistances}
            />
          </View>
        </View>

        {/* Elevation Table Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Elevation Gain (km)</Text>
          <View style={styles.tableCard}>
            <DataTable
              headers={tableElevationHeaders}
              widths={widthsElevation}
              data={dataElevations}
            />
          </View>
        </View>

        {/* Sport Mix Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {useElapsedTime ? 'Sport Mix (Elapsed Time)' : 'Sport Mix (Moving Time)'}
          </Text>
          <View style={styles.chartCard}>
            <SportMixChart activities={myActivitiesToUse} dataTime={dataTime} />
          </View>
        </View>

        {/* Pace & Intensity Trends Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pace & Intensity Trends</Text>
          <View style={styles.chartCard}>
            <PerformanceTrendsCard
              activities={allActivitiesToUse}
              availableSports={myActivitiesWithGps}
              useElapsedTime={useElapsedTime}
            />
          </View>
        </View>
      </ScrollView>
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
    scrollContainer: {
      paddingBottom: 20
    },
    section: {
      marginBottom: 24
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.primary,
      marginBottom: 12
    },
    tableCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
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
        }
      })
    },
    chartCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
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
        }
      })
    },
    chartContainer: {
      flex: 1
    },
    modeToggleRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 8
    },
    segmentedContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSunken,
      borderRadius: 20,
      padding: 2
    },
    segment: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 18
    },
    segmentActive: {
      backgroundColor: theme.primary
    },
    segmentText: {
      fontSize: 13,
      color: theme.text,
      fontWeight: '600'
    },
    segmentTextActive: {
      color: theme.onPrimary
    },
    chartScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    legendContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
      gap: 12
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6
    },
    legendIndicator: {
      width: 12,
      height: 12,
      borderRadius: 3,
      borderWidth: 1,
      borderColor: theme.border
    },
    legendText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.text
    },
    emptyContainer: {
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center'
    },
    emptyText: {
      fontSize: 14,
      color: theme.textMuted
    },
    rowSection: {
      height: 30,
      backgroundColor: theme.successSoft
    },
    maxValueRow: {
      height: 30,
      backgroundColor: theme.primarySoft
    },
    head: {
      height: 44,
      backgroundColor: theme.primary
    },
    headText: {
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
      color: theme.onPrimary
    },
    text: {
      margin: 6,
      fontSize: 14,
      textAlign: 'center',
      color: theme.text
    },
    maxValueText: {
      margin: 6,
      fontSize: 14,
      textAlign: 'center',
      color: theme.textStrong,
      fontWeight: '700'
    },
    textTitle: {
      margin: 6,
      fontSize: 20,
      fontWeight: '600',
      textAlign: 'center',
      color: theme.primary
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

type SportMixMode = 'percent' | 'hours';

/**
 * Renders a stacked bar chart showing the breakdown of activities per year by time.
 * Supports toggling between 100% share (%) and total hours.
 */
function SportMixChart({
  activities,
  dataTime
}: Readonly<{
  activities: string[];
  dataTime: number[][];
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  const [mode, setMode] = useState<SportMixMode>('percent');

  // Filter out the summary row (row[0] === -1) and sort years chronologically (ascending)
  const yearRows = useMemo(() => {
    return dataTime.filter(row => row[0] > 0).sort((a, b) => a[0] - b[0]);
  }, [dataTime]);

  // Identify sports that have non-zero time across all years to avoid cluttering the legend
  const activeSports = useMemo(() => {
    const sportsWithTotals = activities.map((sport, index) => {
      const totalSec = yearRows.reduce((sum, row) => sum + (row[index + 1] ?? 0), 0);
      return { sport, index, totalSec };
    });
    const nonZero = sportsWithTotals.filter(s => s.totalSec > 0);
    const sportsToUse = nonZero.length > 0 ? nonZero : sportsWithTotals;

    return sportsToUse.map((item, colorIdx) => ({
      name: item.sport,
      index: item.index,
      color: theme.chartSeries[colorIdx % theme.chartSeries.length]
    }));
  }, [activities, yearRows, theme.chartSeries]);

  // Prepare series data for VictoryStack
  const seriesData = useMemo(() => {
    return activeSports.map(sportItem => {
      const data = yearRows.map(row => {
        const year = String(row[0]);
        const sportSec = row[sportItem.index + 1] ?? 0;
        const totalSec = row[activities.length + 1] ?? 0;
        const safeTotal = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 0;
        const safeSport = Number.isFinite(sportSec) && sportSec > 0 ? sportSec : 0;

        let y = 0;
        if (mode === 'percent') {
          y = safeTotal > 0 ? (safeSport / safeTotal) * 100 : 0;
        } else {
          y = safeSport / 3600;
        }

        return { x: year, y };
      });
      return { ...sportItem, data };
    });
  }, [activeSports, yearRows, activities.length, mode]);

  if (yearRows.length === 0 || activeSports.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No activity data available</Text>
      </View>
    );
  }

  const chartWidth = Math.max(320, yearRows.length * 55 + 70);

  return (
    <View style={styles.chartContainer}>
      <View style={styles.modeToggleRow}>
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Show 100% Share"
            onPress={() => setMode('percent')}
            style={[styles.segment, mode === 'percent' ? styles.segmentActive : null]}
          >
            <Text
              style={[styles.segmentText, mode === 'percent' ? styles.segmentTextActive : null]}
            >
              Share (%)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Show Total Hours"
            onPress={() => setMode('hours')}
            style={[styles.segment, mode === 'hours' ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, mode === 'hours' ? styles.segmentTextActive : null]}>
              Hours
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal={true} contentContainerStyle={styles.chartScrollContent}>
        <VictoryChart
          domainPadding={{ x: 25 }}
          theme={chartTheme}
          height={280}
          width={chartWidth}
          padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
        >
          <VictoryAxis
            style={{
              tickLabels: {
                fontSize: 12,
                fill: theme.textMuted
              }
            }}
          />
          <VictoryAxis
            dependentAxis
            domain={mode === 'percent' ? [0, 100] : undefined}
            tickValues={mode === 'percent' ? [0, 25, 50, 75, 100] : undefined}
            tickFormat={val => (mode === 'percent' ? `${Math.round(val)}%` : `${Math.round(val)}h`)}
            style={{
              tickLabels: {
                fontSize: 11,
                fill: theme.textMuted
              }
            }}
          />
          <VictoryStack>
            {seriesData.map(sportItem => (
              <VictoryBar
                key={sportItem.name}
                data={sportItem.data}
                style={{
                  data: {
                    fill: sportItem.color,
                    stroke: theme.surface,
                    strokeWidth: 1.5
                  }
                }}
              />
            ))}
          </VictoryStack>
        </VictoryChart>
      </ScrollView>

      <View style={styles.legendContainer}>
        {activeSports.map(sportItem => (
          <View key={sportItem.name} style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: sportItem.color }]} />
            <Text style={styles.legendText}>{sportItem.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Finds the maximum value positions in each activity column (excluding Year columns and Total row)
 * @param {string[][]} data - The table data
 * @param {string[]} headers - The table headers
 * @returns {Map<string, number>} Map of "row,col" positions that contain max values
 */
function findMaxValuePositions(data: string[][], headers: string[]): Map<string, number> {
  const maxPositions = new Map<string, number>();
  if (data.length === 0) return maxPositions;

  // Only consider activity columns (exclude Year column and duplicate Year column)
  for (let col = 1; col < headers.length - 1; col++) {
    let maxValue = -1;
    let maxRow = -1;

    // Find max value in this column (exclude last row which is Total)
    for (let row = 0; row < data.length - 1; row++) {
      const value = Number.parseFloat(data[row][col]);
      if (!Number.isNaN(value) && value > maxValue) {
        maxValue = value;
        maxRow = row;
      }
    }

    if (maxRow !== -1) {
      maxPositions.set(`${maxRow},${col}`, maxValue);
    }
  }

  return maxPositions;
}

/**
 * Renders a data table with a horizontal scroll and highlights max values.
 *
 * @param {string[]} tableHeaders - An array of strings for the table header.
 * @param {number[]} widths - An array of numbers for the column widths.
 * @param {string[][]} data - A 2D array of strings representing the table data.
 * @returns {JSX.Element} A table component.
 */
function DataTable({
  headers,
  widths,
  data
}: Readonly<{
  headers: string[];
  widths: number[];
  data: string[][];
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const maxPositions = findMaxValuePositions(data, headers);

  return (
    <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View>
        {/* Header */}
        <Table borderStyle={{ borderWidth: 1, borderColor: theme.border }}>
          <Row data={headers} widthArr={widths} style={styles.head} textStyle={styles.headText} />
        </Table>
        {/* Data rows */}
        <ScrollView>
          <Table borderStyle={{ borderWidth: 1, borderColor: theme.border }}>
            {data.map((rowData: string[], rowIndex) => (
              <Row
                key={String(rowData[0])}
                data={rowData.map((cellValue: string, colIndex) => {
                  const positionKey = `${rowIndex},${colIndex}`;
                  const isMaxValue = maxPositions.has(positionKey);

                  if (isMaxValue) {
                    // Return a styled text component for max values
                    return (
                      <Text key={positionKey} style={styles.maxValueText}>
                        {cellValue}
                      </Text>
                    );
                  }
                  return cellValue;
                })}
                widthArr={widths}
                style={styles.rowSection}
                textStyle={styles.text}
              />
            ))}
          </Table>
        </ScrollView>
      </View>
    </ScrollView>
  );
}
