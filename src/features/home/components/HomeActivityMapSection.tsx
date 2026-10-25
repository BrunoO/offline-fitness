import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import { ActivityStream } from '@/shared';
import { ResolvedTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeActivityMapProps = {
  stream: ActivityStream | undefined;
  isLoading: boolean;
  mapRefreshKey: number;
  activityTitle: string;
  onOpenFlyover: () => void;
  theme: ResolvedTheme;
  styles: ReturnType<typeof createStyles>;
};

export function HomeActivityMapSection({
  stream,
  isLoading,
  mapRefreshKey,
  activityTitle,
  onOpenFlyover,
  theme,
  styles
}: Readonly<HomeActivityMapProps>) {
  const hasGpsTrack = Boolean(stream?.coordinates && stream.coordinates.length >= 2);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Activity Map</Text>
        {hasGpsTrack ? (
          <TouchableOpacity
            style={styles.flyoverHeaderButton}
            onPress={onOpenFlyover}
            accessibilityRole="button"
            accessibilityLabel="Play flyover of recent activity"
          >
            <Ionicons name="airplane" size={14} color={theme.primary} />
            <Text style={styles.flyoverHeaderButtonText}>Flyover</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.mapContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : null}
        {!isLoading && stream ? (
          <MiniMapComponent key={mapRefreshKey} stream={stream} title={activityTitle} />
        ) : null}
        {!isLoading && !stream ? (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No map data available</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
