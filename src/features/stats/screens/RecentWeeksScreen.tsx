import * as MyColors from '@/constants/colors';
import { useActivitiesContext, useProcessedActivities } from '@/features/activities';
import { Activity, formatUtcDateString, seconds_to_label, simpleLogger } from '@/shared';
import { FlashList } from '@shopify/flash-list';
import React, { JSX } from 'react';
import { ActivityIndicator, ListRenderItem, Platform, StyleSheet, Text, View } from 'react-native';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLabel,
  VictoryLegend,
  VictoryTheme
} from 'victory-native';
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
function computeStroke(goalAchieved: boolean): string {
  return goalAchieved ? MyColors.lightGreen500 : MyColors.deepOrange600;
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
        theme={VictoryTheme.material}
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
              stroke: computeStroke(goalAchieved),
              strokeWidth: 2,
              fill: goalAchieved ? '#E8F5E8' : '#FFF3E0'
            },
            title: {
              fontSize: 14,
              stroke: computeStroke(goalAchieved),
              fontWeight: '600'
            }
          }}
          data={[]}
          colorScale={[MyColors.cyan900]}
        />
        <VictoryBar
          style={{
            data: {
              fill: computeStroke(goalAchieved),
              stroke: computeStroke(goalAchieved),
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
const myItemSeparator = () => <View style={styles.itemSeparator} />;

/**
 * A component to display when the list is empty.
 * @returns A React component.
 */
const myListEmpty = () => {
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
const showInProgress = () => {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator
        animating={true}
        size="large"
        color={MyColors.deepOrange600}
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
  const { globalActivities, myActivitiesDiscovered, refreshActivities, fetchingData } =
    useActivitiesContext();
  const activityTypes = Array.from(myActivitiesDiscovered).sort() as string[];
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
      {wkData.length === 0 ? showInProgress() : null}
      <FlashList
        data={wkData}
        renderItem={renderItem(weeklyGoal)}
        keyExtractor={item => `${item.start_week}`}
        ItemSeparatorComponent={myItemSeparator}
        ListEmptyComponent={myListEmpty}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        onRefresh={refreshActivities}
        refreshing={fetchingData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 4
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MyColors.deepOrange600,
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  },
  listContainer: {
    paddingBottom: 20
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E0E0E0',
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
    color: '#333',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
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
    color: MyColors.deepOrange600,
    marginBottom: 4
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666'
  }
});
