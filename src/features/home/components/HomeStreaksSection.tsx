import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { YearConsistencyStats } from '@/features/stats';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeStreaksSectionProps = {
  dayStreak: { current: number; best: number };
  weekStreak: { current: number; best: number };
  goalWeekStreak: { current: number; best: number };
  currentYearStats?: YearConsistencyStats | null;
  onSeeAnnualTrends?: () => void;
  styles: ReturnType<typeof createStyles>;
};

export function HomeStreaksSection({
  dayStreak,
  weekStreak,
  goalWeekStreak,
  currentYearStats,
  onSeeAnnualTrends,
  styles
}: Readonly<HomeStreaksSectionProps>): React.JSX.Element {
  const currentYear = currentYearStats?.year ?? new Date().getFullYear();
  const hasYearData = currentYearStats && currentYearStats.totalDays > 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Consistency & Streaks</Text>
        {onSeeAnnualTrends ? (
          <TouchableOpacity
            onPress={onSeeAnnualTrends}
            accessibilityRole="button"
            accessibilityLabel="See annual consistency trends"
          >
            <Text style={styles.seeAllText}>Annual trends</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.infoCard}>
        {hasYearData ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{currentYear} Active Days</Text>
              <Text style={styles.infoValue}>
                {`${currentYearStats.activeDays} / ${currentYearStats.totalDays} days (${currentYearStats.activeDaysPercent.toFixed(0)}%)`}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{currentYear} Frequency</Text>
              <Text style={styles.infoValue}>
                {`${currentYearStats.activitiesPerWeek.toFixed(1)} activities / wk`}
              </Text>
            </View>
          </>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Day Streak</Text>
          <Text
            style={styles.infoValue}
          >{`${dayStreak.current} current • ${dayStreak.best} best`}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Week Streak</Text>
          <Text
            style={styles.infoValue}
          >{`${weekStreak.current} current • ${weekStreak.best} best`}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Weekly Goal Streak</Text>
          <Text
            style={styles.infoValue}
          >{`${goalWeekStreak.current} current • ${goalWeekStreak.best} best`}</Text>
        </View>
      </View>
    </View>
  );
}
