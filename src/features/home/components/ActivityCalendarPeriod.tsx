import { ResolvedTheme, useTheme } from '@/theme';
import { evaluateGoal } from '@/features/stats/services/GoalService';
import { useSettings } from '@/features/stats/StatsTabSettingsContext';
import { Activity, RootDrawerParamList } from '@/shared';
import {
  activityLocalDate,
  deviceTodayLocalDateString,
  localDateToDayNumber
} from '@/shared/utils/activityDates';
import { activityIsoWeekKey, isoWeekKeyFromDateString } from '@/shared/utils/isoWeek';
import { getISOWeekNumber } from '@/shared/utils/utils';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';

/**
 * Props for the ActivityCalendarPeriod component.
 */
interface ActivityCalendarPeriodProps {
  /**
   * An array of activities to display on the calendar.
   */
  activities: Activity[];
  /**
   * A function to call when a day with an activity is pressed.
   */
  onDayPress: (activity: Activity) => void;
  /**
   * A function to call when a day without activities is pressed. Opens the
   * same day sheet (with an empty list) so manual entry works on free days.
   */
  onEmptyDayPress?: (date: string) => void;
  /**
   * The currently selected date in 'YYYY-MM-DD' format.
   */
  selectedDate: string;
  /**
   * Navigation prop for navigating to other screens.
   */
  navigation?: DrawerNavigationProp<RootDrawerParamList>;
}

/**
 * Calendar component using period marking to show activity streaks and ranges.
 * @param {ActivityCalendarPeriodProps} props The component props.
 * @returns A React component.
 */
export function ActivityCalendarPeriod({
  activities,
  onDayPress,
  onEmptyDayPress,
  selectedDate,
  navigation
}: Readonly<ActivityCalendarPeriodProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { weeklyGoal } = useSettings();

  // Get the current week number for the selected date - memoized for performance
  const currentWeekNumber = getISOWeekNumber(selectedDate);

  // Handle week number press to navigate to RecentWeeksScreen - memoized for performance
  const handleWeekNumberPress = () => {
    if (navigation) {
      navigation.navigate('Stats');
    }
  };

  // Pre-calculate week activities for all unique ISO weeks to avoid repeated calculations
  const weekActivitiesMap = new Map<string, Activity[]>();
  activities.forEach(activity => {
    const weekKey = activityIsoWeekKey(activity);

    if (!weekActivitiesMap.has(weekKey)) {
      weekActivitiesMap.set(weekKey, []);
    }
    weekActivitiesMap.get(weekKey)!.push(activity);
  });

  // Memoized function to check if weekly goal is achieved for a given date
  const isWeeklyGoalAchieved = (date: string): boolean => {
    const weekKey = isoWeekKeyFromDateString(`${date}T12:00:00`);
    const weekActivities = weekActivitiesMap.get(weekKey) || [];

    try {
      return evaluateGoal(weeklyGoal, { activities: weekActivities });
    } catch {
      return false; // If goal evaluation fails, assume not achieved
    }
  };

  const marks: { [key: string]: object } = {};

  // Get today's date in YYYY-MM-DD format (device-local "today" is correct here)
  const today = deviceTodayLocalDateString();

  // Pre-process activities by athlete-local date
  const activitiesByDate: { [key: string]: Activity[] } = {};
  const dateCache = new Map<string, string>(); // Cache parsed dates

  activities.forEach(activity => {
    // Cache the date parsing to avoid repeated string operations
    let date = dateCache.get(activity.id);
    if (!date) {
      date = activityLocalDate(activity);
      dateCache.set(activity.id, date);
    }

    if (!activitiesByDate[date]) {
      activitiesByDate[date] = [];
    }
    activitiesByDate[date].push(activity);
  });

  // Create period marks for activity streaks with optimized processing
  const sortedDates = Object.keys(activitiesByDate).sort((a, b) => a.localeCompare(b));
  const streaks: string[][] = [];
  let currentStreak: string[] = [];
  const baseColor = theme.primary;

  // Build streaks array (DST-safe whole-day math on athlete-local dates)
  sortedDates.forEach((date, index) => {
    const prevDate = index > 0 ? sortedDates[index - 1] : null;
    const isConsecutive =
      prevDate && localDateToDayNumber(date) - localDateToDayNumber(prevDate) === 1;

    if (isConsecutive) {
      currentStreak.push(date);
    } else {
      if (currentStreak.length > 0) {
        streaks.push([...currentStreak]);
      }
      currentStreak = [date];
    }
  });

  // Add the last streak
  if (currentStreak.length > 0) {
    streaks.push(currentStreak);
  }

  // Pre-calculate goal achievements for all unique weeks to avoid repeated evaluation
  const goalAchievementCache = new Map<string, boolean>();
  const getGoalAchievement = (date: string): boolean => {
    if (goalAchievementCache.has(date)) {
      return goalAchievementCache.get(date)!;
    }
    const result = isWeeklyGoalAchieved(date);
    goalAchievementCache.set(date, result);
    return result;
  };

  // Process all streaks in a single pass - with weekly goal color coding
  streaks.forEach(streak => {
    streak.forEach(streakDate => {
      const goalAchieved = getGoalAchievement(streakDate);
      const streakColor = goalAchieved ? theme.success : baseColor + '60';
      marks[streakDate] = {
        color: streakColor,
        textColor: goalAchieved ? theme.onPrimary : theme.text
      };
    });
  });

  // Add today indicator
  if (marks[today]) {
    marks[today] = {
      ...marks[today],
      today: true,
      marked: true,
      dotColor: theme.textOnSurface
    };
  } else {
    marks[today] = {
      today: true,
      marked: true,
      dotColor: theme.primary
    };
  }

  // Handle selected date
  if (marks[selectedDate]) {
    marks[selectedDate] = {
      ...marks[selectedDate],
      selected: true,
      selectedColor: theme.success,
      selectedTextColor: theme.textStrong
    };
  } else {
    marks[selectedDate] = {
      selected: true,
      selectedColor: theme.success,
      selectedTextColor: theme.textStrong
    };
  }

  const markedDates = marks;

  /**
   * Handles the press event on a day in the calendar.
   */
  const handleDayPress = (day: DateData) => {
    const dayActivities = activities.filter(a => activityLocalDate(a) === day.dateString);
    if (dayActivities.length > 0) {
      onDayPress(dayActivities[0]);
    } else {
      onEmptyDayPress?.(day.dateString);
    }
  };

  return (
    <Calendar
      current={selectedDate}
      markedDates={markedDates}
      onDayPress={handleDayPress}
      monthFormat={'yyyy MMMM'}
      markingType="period"
      firstDay={1}
      theme={{
        todayTextColor: theme.textStrong,
        arrowColor: theme.primary,
        calendarBackground: 'transparent',
        textSectionTitleColor: theme.textStrong,
        dayTextColor: theme.textStrong,
        monthTextColor: theme.textStrong,
        indicatorColor: theme.primary,
        selectedDayBackgroundColor: theme.success,
        selectedDayTextColor: theme.onPrimary,
        todayBackgroundColor: theme.surfaceMuted //theme.primary + '40'
      }}
      hideExtraDays={false}
      showWeekNumbers={false}
      disableMonthChange={false}
      enableSwipeMonths={true}
      renderHeader={date => (
        <View style={styles.calendarHeader}>
          <Text style={styles.monthText}>{date.toString('MMMM yyyy')}</Text>
          <TouchableOpacity
            style={styles.weekNumberContainer}
            onPress={handleWeekNumberPress}
            disabled={!navigation}
          >
            <Text style={styles.weekNumberLabel}>W{currentWeekNumber}</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    calendarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: 'transparent'
    },
    monthText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.textStrong
    },
    weekNumberContainer: {
      backgroundColor: theme.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      marginLeft: 8
    },
    weekNumberLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.onPrimary
    }
  });
