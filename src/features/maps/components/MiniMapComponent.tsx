import React from 'react';
import { Text, View } from 'react-native';

import { ActivityStream } from '@/shared';
export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
  overlayStream?: ActivityStream;
  /** Activity title displayed in flyover header on Android */
  title?: string;
  /** Whether flyover button is enabled on Android (defaults to true) */
  allowFlyover?: boolean;
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
