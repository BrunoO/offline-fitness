import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import { ActivityStream } from '@/shared';
import React from 'react';
import { Text, View } from 'react-native';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeActivityMapProps = {
  stream: ActivityStream | undefined;
  isLoading: boolean;
  mapRefreshKey: number;
  activityTitle: string;
  styles: ReturnType<typeof createStyles>;
};

export function HomeActivityMapSection({
  stream,
  isLoading,
  mapRefreshKey,
  activityTitle,
  styles
}: Readonly<HomeActivityMapProps>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Activity Map</Text>
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
