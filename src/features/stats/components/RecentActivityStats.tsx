import { useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityStats } from '../services/activity-stats';

interface RecentActivityStatsProps {
  stats: ActivityStats;
}

const RecentActivityStats: React.FC<RecentActivityStatsProps> = ({ stats }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        This activity compared to this year&apos;s {stats.totalActivities} similar activities:
      </Text>
      <Text style={styles.body}>
        - Distance: Longer than {stats.distancePercentile.toFixed(0)}% of activities.{' '}
        {stats.distanceRank ? (
          <Text>
            {getMedal(stats.distanceRank)} #{stats.distanceRank}
          </Text>
        ) : null}
      </Text>
      <Text style={styles.body}>
        - Elevation Gain: More than {stats.elevationGainPercentile.toFixed(0)}% of activities.{' '}
        {stats.elevationGainRank ? (
          <Text>
            {getMedal(stats.elevationGainRank)} #{stats.elevationGainRank}
          </Text>
        ) : null}
      </Text>
      <Text style={styles.body}>
        - Speed: Faster than {stats.speedPercentile.toFixed(0)}% of activities.{' '}
        {stats.speedRank ? (
          <Text>
            {getMedal(stats.speedRank)} #{stats.speedRank}
          </Text>
        ) : null}
      </Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      padding: '1%',
      marginTop: 10,
      backgroundColor: theme.surfaceSunken,
      borderRadius: 10
    },
    heading: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.textStrong,
      marginBottom: 5
    },
    body: {
      fontSize: 14,
      color: theme.text
    }
  });

export default RecentActivityStats;
