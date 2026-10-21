import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import { useActivitiesContext, useProcessedActivities } from '@/features/activities';
import { Activity, formatUtcDateString, seconds_to_label, simpleLogger } from '@/shared';
import { FlashList } from '@shopify/flash-list';
import React, { JSX, useMemo } from 'react';
import { ActivityIndicator, ListRenderItem, Platform, StyleSheet, Text, View } from 'react-native';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryLabel, VictoryLegend } from 'victory-native';
import { evaluateGoal } from '../services/GoalService';
import { weeklyData, WeekSummary } from '../services/stats';
import { useSettings } from '../StatsTabSettingsContext';

/**
 * Checks if the weekly goal has been achieved.
 * @param activities The activities of the week.
 * @param weeklyGoal The goal expression.
 * @returns True if the weekly goal has been achieved, false otherwise.
 */
function weeklyGoalAchieved(activities: Activity[], weeklyGoal: string): boolean {
  return evaluateGoal(weeklyGoal, { activities });
}

/**
 * Computes the stroke color for the chart based on whether the weekly goal has been achieved.
 * @param goalAchieved Whether the weekly goal has been achieved.
 * @returns The stroke color.
 */
function computeStroke(theme: ResolvedTheme, goalAchieved: boolean): string {
  return goalAchieved ? theme.success : theme.primary;
}

/**
 * A component for displaying a single week's data.
 * @param weekNumber The week number.
 * @param isoDate The ISO date of the week.
 * @param data The weekly data.
 * @param extraValues Extra values for the week.
 * @returns A React component.
 */
const Item = ({
  weekNumber,
  isoDate,
  summary,
  extraValues,
  activities,
  weeklyGoal
}: {
  weekNumber: number;
  isoDate: Date;
  summary: { type: string; value: number }[];
  extraValues: Map<string, number>;
  activities: Activity[];
  weeklyGoal: string;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  const goalAchieved = weeklyGoalAchieved(activities, weeklyGoal);
  const legend =
    '🕐 ' +
    seconds_to_label(extraValues.get('totalH')!) +
    ' 📏 ' +
    (extraValues.get('dist')! / 1000).toFixed(0) +
    'km' +
    ' ⛰️ ' +
    extraValues.get('elev')!.toFixed(0) +
    'm';
  const xAxisLabel =
    'Week #' +
    weekNumber +
    ' - ' +
    formatUtcDateString(isoDate) +
    ' - ' +
    ' #activities: ' +
    extraValues.get('nbA')!;

  return (
    <View style={styles.chartContainer}>
      <VictoryChart
        theme={chartTheme}
        padding={{ top: 60, bottom: 60, left: 40, right: 80 }}
        height={280}
      >
        <VictoryLegend
          x={35}
          y={0}
          title={legend}
          centerTitle
          orientation="horizontal"
          gutter={10}
          itemsPerRow={1}
          style={{
            border: {
              stroke: computeStroke(theme, goalAchieved),
              strokeWidth: 2,
              fill: goalAchieved ? theme.successSoft : theme.primarySoft
            },
            title: {
              fontSize: 14,
              stroke: computeStroke(theme, goalAchieved),
              fontWeight: '600'
            }
          }}
          data={[]}
          colorScale={[theme.chartComparison]}
        />
        <VictoryBar
          style={{
            data: {
              fill: computeStroke(theme, goalAchieved),
              stroke: computeStroke(theme, goalAchieved),
              strokeWidth: 1
            }
          }}
          data={summary}
          x="type"
          y={d => d.value}
          labels={({ datum }) => `${seconds_to_label(datum.value)}`}
          labelComponent={
            <VictoryLabel verticalAnchor="middle" angle={0} style={{ fontSize: 12 }} />
          }
          cornerRadius={{ top: 4 }}
        />
        <VictoryAxis
          label={xAxisLabel}
          style={{
            axisLabel: {
              padding: 30,
              fontSize: 12,
              fontWeight: '600'
            },
            tickLabels: {
              fontSize: 10
            }
          }}
        />
      </VictoryChart>
    </View>
  );
};

/**
 * Renders a single item in the list.
 * @param item The item to render.
 * @returns A React component.
 */
const renderItem = (weeklyGoal: string): ListRenderItem<WeekSummary> =>
  function RenderWeekItem({ item }) {
    return (
      <Item
        weekNumber={item.start_week}
        isoDate={item.isoDate}
        summary={item.summary}
        extraValues={item.extraValues}
        activities={item.activities}
        weeklyGoal={weeklyGoal}
      />
    );
  };

/**
 * A component for separating items in the list.
 * @returns A React component.
 */
const ItemSeparator = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.itemSeparator} />;
};

/**
 * A component to display when the list is empty.
 * @returns A React component.
 */
const ListEmpty = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  simpleLogger.warn('no weeklyData, loading in progress');
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No weekly data available</Text>
      <Text style={styles.emptySubtext}>Loading your weekly statistics...</Text>
    </View>
  );
};

/**
 * A component to display while the data is loading.
 * @returns A React component.
 */
const ShowInProgress = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator
        animating={true}
        size="large"
        color={theme.primary}
        style={styles.loadingIndicator}
      />
      <Text style={styles.loadingText}>Computing weekly data...</Text>
      <Text style={styles.loadingSubtext}>This may take a moment</Text>
    </View>
  );
};

/**
 * A screen for displaying recent weeks' data.
 * @param route The route object.
 * @returns A React component.
 */
export function RecentWeeksScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { globalActivities, myActivitiesDiscovered, refreshActivities, fetchingData } =
    useActivitiesContext();
  const activityTypes = Array.from(myActivitiesDiscovered).sort(
    (a, b) => a.localeCompare(b)
  ) as string[];
  const { myActivitiesToUse, allActivitiesToUse } = useProcessedActivities(
    activityTypes,
    globalActivities
  );

  const { numberRecentWeeks, weeklyGoal, useElapsedTime } = useSettings();

  const wkData = weeklyData(
    myActivitiesToUse,
    allActivitiesToUse,
    numberRecentWeeks,
    useElapsedTime
  );

  return (
    <View style={styles.container}>
      {wkData.length === 0 ? <ShowInProgress /> : null}
      <FlashList
        data={wkData}
        renderItem={renderItem(weeklyGoal)}
        keyExtractor={item => `${item.start_week}`}
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        onRefresh={refreshActivities}
        refreshing={fetchingData}
      />
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
    header: {
      paddingVertical: 20,
      paddingHorizontal: 4
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: 4
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      lineHeight: 20
    },
    listContainer: {
      paddingBottom: 20
    },
    chartContainer: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      marginHorizontal: 4,
      marginVertical: 8,
      padding: 4,
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
    itemSeparator: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 16,
      marginVertical: 8
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textMuted,
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
