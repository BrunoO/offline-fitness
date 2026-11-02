import React from 'react';
import { Text, View } from 'react-native';
import { seconds_to_label } from '@/shared';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeWeekSummaryProps = {
  weeklySummary: { totalHours: number; totalDistanceKm: number; totalElevationM: number };
  styles: ReturnType<typeof createStyles>;
};

export function HomeWeekSummary({
  weeklySummary,
  styles
}: Readonly<HomeWeekSummaryProps>): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Time</Text>
          <Text style={styles.infoValue}>
            {weeklySummary.totalHours > 0
              ? seconds_to_label(weeklySummary.totalHours)
              : 'No activity yet'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Distance</Text>
          <Text style={styles.infoValue}>{weeklySummary.totalDistanceKm.toFixed(1)} km</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Elevation</Text>
          <Text style={styles.infoValue}>{weeklySummary.totalElevationM.toFixed(0)} m</Text>
        </View>
      </View>
    </View>
  );
}
