import React from 'react';
import { Text, View } from 'react-native';

import { ActivityStream } from '@/shared';
export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
  overlayStream?: ActivityStream;
  title?: string;
  allowFlyover?: boolean;
};

/**
 * A component for displaying a mini map of an activity.
 * @param props The component props.
 * @returns A React component.
 */
export default function MiniMapComponent(_props: Readonly<MiniMapComponentProps>) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>No maps (default)</Text>
    </View>
  );
}
