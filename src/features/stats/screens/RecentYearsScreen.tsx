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
  View
} from 'react-native';

import { useActivitiesContext, useProcessedActivities } from '@/features/activities';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Row, Table } from 'react-native-reanimated-table';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory-native';
import YTDStatsComponent from '../components/YTDStatsComponent';
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
export function RecentYearsScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { globalActivities, myActivitiesDiscovered, refreshActivities, fetchingData } =
    useActivitiesContext();
  const activityTypes = Array.from(myActivitiesDiscovered).sort((a, b) =>
    a.localeCompare(b)
  ) as string[];
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
  const myActivitiesWithGps = myActivitiesToUse.filter(t => !isNoGpsActivity(t));
  const activitiesWithGps = allActivitiesToUse.filter(a => !isNoGpsActivity(a.type));

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
  const dataTime = yearlyData(myActivitiesToUse, allActivitiesToUse, (a: Activity) =>
    useElapsedTime ? a.elapsed_time : a.moving_time
  );

  const dataHoursFormated = (() => {
    const formattedTable = formatYearlyTable(
      dataTime.sort(sortRowsOnYearDescending),
      seconds_to_label
    );
    return formattedTable.map(row => [...row, row[0]]);
  })();

  const dataDistances = (() => {
    return formatYearlyTable(
      yearlyData(myActivitiesWithGps, activitiesWithGps, (a: Activity) => a.distance).sort(
        sortRowsOnYearDescending
      ),
      (x: number) => (x / 1000).toFixed(0)
    ).map(row => [...row, row[0]]);
  })();

  const dataElevations = (() => {
    return formatYearlyTable(
      yearlyData(
        myActivitiesWithGps,
        activitiesWithGps,
        (a: Activity) => a.total_elevation_gain
      ).sort(sortRowsOnYearDescending),
      (x: number) => x.toFixed(0)
    ).map(row => [...row, row[0]]);
  })();

  const dataDistancesToChart = myActivitiesWithGps.map((activity, indexActivity) => ({
    id: indexActivity,
    name: activity,
    data: dataDistances.slice(0, -1).map((row: string[]) => ({
      x: row[0],
      y: Number.parseInt(row[indexActivity + 1], 10)
    }))
  }));

  useEffect(() => {
    setLoading(false);
  }, [dataDistancesToChart]);

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
          <Text style={styles.sectionTitle}>Elevation Gain (m)</Text>
          <View style={styles.tableCard}>
            <DataTable
              headers={tableElevationHeaders}
              widths={widthsElevation}
              data={dataElevations}
            />
          </View>
        </View>

        {/* Charts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distance Charts by Activity</Text>
          <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
            {dataDistancesToChart.map(item => (
              <View key={item.id} style={styles.chartCard}>
                <BarChart chartData={item.data} activityName={item.name} />
              </View>
            ))}
          </ScrollView>
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
        },
        web: {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      })
    },
    chartCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      marginHorizontal: 8,
      padding: 16,
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
      color: theme.info,
      fontWeight: '600'
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

/**
 * Renders a bar chart for a specific activity's yearly distance data.
 *
 * @param {Array<{x: string, y: number}>} chartData - The data for the bar chart. Each object should have 'x' (year) and 'y' (distance).
 * @param {string} activityName - The name of the activity, used for the chart title.
 * @returns {JSX.Element} A bar chart component.
 */
function BarChart({
  chartData,
  activityName
}: Readonly<{
  chartData: { x: string; y: number }[];
  activityName: string;
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>{'Distances (km) - ' + activityName}</Text>

      <ScrollView horizontal={true} contentContainerStyle={{ justifyContent: 'center' }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <VictoryChart
            domainPadding={{ x: 20 }}
            theme={chartTheme}
            height={400}
            padding={{ top: 20, bottom: 60, left: 10, right: 20 }}
          >
            <VictoryBar
              data={chartData}
              labels={({ datum }) => datum.y}
              style={{
                data: {
                  fill: theme.primary,
                  stroke: theme.primary,
                  strokeWidth: 1
                }
              }}
              cornerRadius={{ top: 4 }}
            />
            <VictoryAxis
              tickFormat={x => x}
              style={{
                tickLabels: {
                  angle: 45,
                  fontSize: 12
                },
                axisLabel: {
                  fontSize: 12,
                  fontWeight: '600'
                }
              }}
            />
          </VictoryChart>
        </ScrollView>
      </ScrollView>
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
                key={rowIndex}
                data={rowData.map((cellValue: string, colIndex) => {
                  const positionKey = `${rowIndex},${colIndex}`;
                  const isMaxValue = maxPositions.has(positionKey);

                  if (isMaxValue) {
                    // Return a styled text component for max values
                    return (
                      <Text key={colIndex} style={styles.maxValueText}>
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
