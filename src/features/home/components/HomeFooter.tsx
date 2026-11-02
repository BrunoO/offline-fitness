import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import React from 'react';
import { Text, View } from 'react-native';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeFooterProps = {
  styles: ReturnType<typeof createStyles>;
};

export function HomeFooter({ styles }: Readonly<HomeFooterProps>): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.footerCard}>
        <View style={styles.footerContent}>
          <View style={styles.footerText}>
            <Text style={styles.appTitle}>Offline Fitness</Text>
            <Text style={styles.versionText}>
              Version: {nativeApplicationVersion + '-' + nativeBuildVersion}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
