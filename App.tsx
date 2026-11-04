// eslint-disable-next-line import/no-duplicates -- Sonar S3863 agrees; the pattern is deliberate (see AGENTS.md "Import Hygiene")
import 'react-native-gesture-handler'; // NOSONAR - side-effect import must precede all other imports, separate from the named import below
// eslint-disable-next-line import/no-duplicates -- paired with the side-effect import above
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // NOSONAR - paired with the side-effect import above
import {
  ActivitiesProvider,
  calculateAndStoreMissingBoundingBoxes,
  correctSwimElevationGain,
  ManualEntryProvider,
  useActivitiesContext
} from '@/features/activities';
import { ProfileHubProvider, useProfileHub } from '@/features/profile';
import { ProfileHubSheet } from '@/features/profile/components/ProfileHubSheet';
import { sweepExpiredSessions } from '@/features/recording';
import { SettingsProvider } from '@/features/stats';
import { RootStackParamList, simpleLogger } from '@/shared';
import { STACK_ROUTES } from '@/constants';
import { SettingsModal } from '@/shared/components/SettingsModal';
import { createNavigationTheme, ThemeProvider, useTheme } from '@/theme';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { RootStackNavigator } from './src/navigation/RootStackNavigator';

// Keep the splash screen visible while we fetch resources
// (only rejects if the splash was already hidden; startup order makes that impossible)
void SplashScreen.preventAutoHideAsync();

// Set the animation options. This is optional.
SplashScreen.setOptions({
  // No native fade: hand off instantly to the in-app splash, which fades
  // quickly via Reanimated. Keeps the perceived startup snappy.
  duration: 0,
  fade: false
});

function AppContent() {
  const theme = useTheme();
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const { reloadActivitiesFromLocalStorage } = useActivitiesContext();
  const { isHubOpen, closeHub } = useProfileHub();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const fadeAnim = useSharedValue(1);

  const openSettings = useCallback(() => setSettingsVisible(true), []);

  const splashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value
  }));

  useEffect(() => {
    // Log app startup
    simpleLogger.log('🚀 Offline Fitness app started successfully');

    // Load activities first so the UI can paint without waiting for the
    // (potentially slow) bounding-box / elevation backfill. The splash stays
    // visible until this first load completes.
    reloadActivitiesFromLocalStorage()
      .catch(error => simpleLogger.error('Failed to reload activities from local storage', error))
      .finally(() => {
        void SplashScreen.hideAsync().catch(() => undefined);
        simpleLogger.log('✨ App UI loaded and ready');
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue mutation is expected
        fadeAnim.value = withTiming(0, { duration: 150 }, finished => {
          if (finished) {
            scheduleOnRN(setSplashVisible, false);
          }
        });

        // Backfill runs in the background after first paint, then activities
        // reload so any bounding_box / elevation corrections land in state.
        const runBackgroundBackfill = async () => {
          try {
            await Promise.all([
              calculateAndStoreMissingBoundingBoxes(),
              correctSwimElevationGain()
            ]);
            await reloadActivitiesFromLocalStorage();
          } catch (error) {
            simpleLogger.error('Startup backfill error', error);
          }
        };
        void runBackgroundBackfill();
      });

    // Sweep saved recording fix logs older than the 30-day retention window (D10).
    sweepExpiredSessions().catch(error =>
      simpleLogger.error('Startup recording session sweep error', error)
    );
  }, [reloadActivitiesFromLocalStorage]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <ManualEntryProvider>
          <RootStackNavigator />
          {/* Mounted outside the navigator: modals hold persistent state */}
          <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
          <ProfileHubSheet
            visible={isHubOpen}
            onClose={closeHub}
            onOpenSettings={openSettings}
            onNavigateToProfile={() => navigationRef.navigate(STACK_ROUTES.Profile)}
            onNavigateToLogs={() => navigationRef.navigate(STACK_ROUTES.Logs)}
          />
        </ManualEntryProvider>
      </NavigationContainer>
      {splashVisible ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.splashContainer,
            { backgroundColor: theme.primarySoft },
            splashAnimatedStyle
          ]}
        >
          <Image source={require('./assets/images/splash.png')} style={styles.splashImage} />
        </Animated.View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999
  },
  splashImage: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    borderRadius: 40
  }
});

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SettingsProvider>
          <ActivitiesProvider>
            <ProfileHubProvider>
              <AppContent />
            </ProfileHubProvider>
          </ActivitiesProvider>
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
