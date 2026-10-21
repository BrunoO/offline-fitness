import React from 'react';
import { Text, View } from 'react-native';
import * as MyColors from '@/constants/colors';
import { ActivityStats } from '../services/activity-stats';

interface RecentActivityStatsProps {
  stats: ActivityStats;
}

const RecentActivityStats: React.FC<RecentActivityStatsProps> = ({ stats }) => {
  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <View
      style={{ padding: '1%', marginTop: 10, backgroundColor: MyColors.gray100, borderRadius: 10 }}
    >
      <Text style={{ fontSize: 16, fontWeight: 'bold', color: MyColors.gray900, marginBottom: 5 }}>
        This activity compared to this year&apos;s {stats.totalActivities} similar activities:
      </Text>
      <Text style={{ fontSize: 14, color: MyColors.gray800 }}>
        - Distance: Longer than {stats.distancePercentile.toFixed(0)}% of activities.{' '}
        {stats.distanceRank ? (
          <Text>
            {getMedal(stats.distanceRank)} #{stats.distanceRank}
          </Text>
        ) : null}
      </Text>
      <Text style={{ fontSize: 14, color: MyColors.gray800 }}>
        - Elevation Gain: More than {stats.elevationGainPercentile.toFixed(0)}% of activities.{' '}
        {stats.elevationGainRank ? (
          <Text>
            {getMedal(stats.elevationGainRank)} #{stats.elevationGainRank}
          </Text>
        ) : null}
      </Text>
      <Text style={{ fontSize: 14, color: MyColors.gray800 }}>
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

export default RecentActivityStats;
