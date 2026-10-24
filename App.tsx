// eslint-disable-next-line import/no-duplicates -- Sonar S3863 agrees; the pattern is deliberate (see AGENTS.md "Import Hygiene")
import 'react-native-gesture-handler'; // NOSONAR - side-effect import must precede all other imports, separate from the named import below // https://reactnavigation.org/docs/drawer-navigator#installation

// eslint-disable-next-line import/no-duplicates -- paired with the side-effect import above
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // NOSONAR - paired with the side-effect import above
import {
  ActivitiesProvider,
  calculateAndStoreMissingBoundingBoxes,
  correctSwimElevationGain,
  DetailsScreen,
  ManualEntryProvider,
  useActivitiesContext
} from '@/features/activities';
import { HomeScreen } from '@/features/home';
import { MapsScreen } from '@/features/maps';
import { RecordingScreen } from '@/features/recording/screens/RecordingScreen';
import { SettingsProvider, StatsTab } from '@/features/stats';
import { LogScreen, RootDrawerParamList, simpleLogger } from '@/shared';
import { CustomDrawerContent, getDrawerIconOptions } from '@/shared/components/CustomDrawer';
import { SettingsModal } from '@/shared/components/SettingsModal';
import { createNavigationTheme, ThemeProvider, useTheme } from '@/theme';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Keep the splash screen visible while we fetch resources
// (only rejects if the splash was already hidden; startup order makes that impossible)
void SplashScreen.preventAutoHideAsync();

// Set the animation options. This is optional.
SplashScreen.setOptions({
  // Shorter native fade so the splash doesn't linger; the in-app splash
  // (Reanimated) handles the final cross-fade on top.
  duration: 300,
  fade: true
});

const Drawer = createDrawerNavigator<RootDrawerParamList>();

function AppContent() {
  const theme = useTheme();
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);
  const { reloadActivitiesFromLocalStorage } = useActivitiesContext();
  const [backfillComplete, setBackfillComplete] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const fadeAnim = useSharedValue(1);

  // Stable so the drawer's memoised "Settings" row does not change identity
  // every time the app re-renders.
  const openSettings = useCallback(() => setSettingsVisible(true), []);

  const splashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value
  }));

  useEffect(() => {
    // Log app startup
    simpleLogger.log('🚀 Offline Fitness app started successfully');

    // Run backfills sequentially before loading activities from local storage, so any
    // bounding_box / elevation corrections written to AsyncStorage are visible in the
    // first in-memory load.
    Promise.all([calculateAndStoreMissingBoundingBoxes(), correctSwimElevationGain()])
      .catch(error => simpleLogger.error('Startup backfill error', error))
      .finally(() => setBackfillComplete(true));
  }, []);

  // Once startup backfill completes, hide the native splash and smoothly fade out
  // our in-app splash (which takes the background tint of the active palette).
  useEffect(() => {
    if (backfillComplete) {
      void SplashScreen.hideAsync().catch(() => undefined);
      simpleLogger.log('✨ App UI loaded and ready');
      fadeAnim.value = withTiming(0, { duration: 350 }, finished => {
        if (finished) {
          scheduleOnRN(setSplashVisible, false);
        }
      });
    }
  }, [backfillComplete, fadeAnim]);

  useEffect(() => {
    if (backfillComplete) {
      // Activities come from a Strava archive import; no network call is needed.
      // A storage failure here must not pass as unhandled rejection.
      reloadActivitiesFromLocalStorage().catch(error =>
        simpleLogger.error('Failed to reload activities from local storage', error)
      );
    }
  }, [backfillComplete, reloadActivitiesFromLocalStorage]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navigationTheme}>
        <ManualEntryProvider>
          <Drawer.Navigator
            // prettier-ignore
            drawerContent={props => ( // NOSONAR - render prop must close over openSettings
            <CustomDrawerContent {...props} onOpenSettings={openSettings} />
          )}
          >
            <Drawer.Screen name="Home" options={getDrawerIconOptions('home-outline')}>
              {props => <HomeScreen {...props} />}
            </Drawer.Screen>
            <Drawer.Screen
              name="Record"
              component={RecordingScreen}
              options={getDrawerIconOptions('radio-button-on-outline')}
            />
            <Drawer.Screen
              name="Details"
              component={DetailsScreen}
              options={{
                ...getDrawerIconOptions('list-outline'),
                drawerLabel: 'Activities'
              }}
            />
            <Drawer.Screen
              name="Maps"
              component={MapsScreen}
              options={getDrawerIconOptions('map-outline')}
            />
            <Drawer.Screen
              name="Stats"
              component={StatsTab}
              options={getDrawerIconOptions('color-wand-outline')}
            />
            <Drawer.Screen
              name="Logs"
              component={LogScreen}
              options={getDrawerIconOptions('newspaper-outline')}
            />
          </Drawer.Navigator>
          {/* Mounted outside the drawer panel: the panel never unmounts, and the
            settings form holds live text inputs. */}
          <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
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
            <AppContent />
          </ActivitiesProvider>
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
