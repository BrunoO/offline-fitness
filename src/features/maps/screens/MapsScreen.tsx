import React, { JSX } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The maps screen of the app.
 * @returns A React component.
 */
export default function MapsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View>
        <Text>Maps Screen</Text>
      </View>
    </View>
  );
}
