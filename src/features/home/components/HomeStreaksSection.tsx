import React from 'react';
import { Text, View } from 'react-native';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeStreaksSectionProps = {
  dayStreak: { current: number; best: number };
  weekStreak: { current: number; best: number };
  goalWeekStreak: { current: number; best: number };
  styles: ReturnType<typeof createStyles>;
};

export function HomeStreaksSection({
  dayStreak,
  weekStreak,
  goalWeekStreak,
  styles
}: Readonly<HomeStreaksSectionProps>): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Streaks</Text>
      <View style={styles.infoCard}>
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
