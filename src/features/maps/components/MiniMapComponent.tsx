import React from 'react';
import { Text, View } from 'react-native';

import { ActivityStream, LatLng } from '@/shared';
export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
  overlayStream?: ActivityStream;
  overlaySecondaryStream?: ActivityStream;
  /** Activity ID used to open the unified Flyover screen */
  activityId?: string;
  /** Activity title displayed in flyover header on Android */
  title?: string;
  /** Activity sport type used by FlyoverHud to choose Pace vs Speed */
  activityType?: string;
  /** Whether flyover button is enabled on Android (defaults to true) */
  allowFlyover?: boolean;
  /** Optional highlighted point to scrub along the track */
  highlightCoordinate?: LatLng | null;
  /** Optional custom color for the overlay stream (defaults to theme.info) */
  overlayColor?: string;
  /** Optional explicit coordinates to fit the map camera to instead of stream.coordinates */
  fitCoordinates?: LatLng[];
  /** Whether to automatically re-fit camera when coordinates change (defaults to true) */
  autoFitOnCoordinateChange?: boolean;
  /** Whether to show direction arrow badges along the track (defaults to true) */
  showDirectionArrows?: boolean;
  /** Whether to show a recenter / fit-to-track button on the map (defaults to false) */
  showRecenterButton?: boolean;
};

/**
 * Fallback component for displaying a mini map of an activity on platforms without native maps (iOS/web).
 * Accepts `title` and `allowFlyover` for cross-platform interface parity with `MiniMapComponent.android.tsx`.
 * @param _props The component props (unused on fallback stub).
 * @returns A fallback view.
 */
export default function MiniMapComponent(_props: Readonly<MiniMapComponentProps>) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>No maps (default)</Text>
    </View>
  );
}
