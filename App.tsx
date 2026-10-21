// eslint-disable-next-line import/no-duplicates -- Sonar S3863 agrees; the pattern is deliberate (see AGENTS.md "Import Hygiene")
import 'react-native-gesture-handler'; // NOSONAR - side-effect import must precede all other imports, separate from the named import below // https://reactnavigation.org/docs/drawer-navigator#installation

// eslint-disable-next-line import/no-duplicates -- paired with the side-effect import above
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // NOSONAR - paired with the side-effect import above
import {
  ActivitiesProvider,
  calculateAndStoreMissingBoundingBoxes,
  correctSwimElevationGain,
  DetailsScreen,
  useActivitiesContext
} from '@/features/activities';
import { HomeScreen } from '@/features/home';
import { MapsScreen } from '@/features/maps';
import { SettingsProvider, StatsTab } from '@/features/stats';
import { LogScreen, RootDrawerParamList, simpleLogger } from '@/shared';
import { CustomDrawerContent, getDrawerIconOptions } from '@/shared/components/CustomDrawer';
import { SettingsModal } from '@/shared/components/SettingsModal';
import { createNavigationTheme, ThemeProvider, useTheme } from '@/theme';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

// Keep the splash screen visible while we fetch resources
// (only rejects if the splash was already hidden; startup order makes that impossible)
void SplashScreen.preventAutoHideAsync();

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true
});

const Drawer = createDrawerNavigator<RootDrawerParamList>();

function AppContent() {
  const theme = useTheme();
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);
  const { reloadActivitiesFromLocalStorage } = useActivitiesContext();
  const [backfillComplete, setBackfillComplete] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Stable so the drawer's memoised "Settings" row does not change identity
  // every time the app re-renders.
  const openSettings = useCallback(() => setSettingsVisible(true), []);

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

  useEffect(() => {
    void SplashScreen.hideAsync();
    simpleLogger.log('✨ App UI loaded and ready');
  }, []);

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
        <Drawer.Navigator
          drawerContent={props => <CustomDrawerContent {...props} onOpenSettings={openSettings} />}
        >
          <Drawer.Screen name="Home" options={getDrawerIconOptions('home-outline')}>
            {props => <HomeScreen {...props} />}
          </Drawer.Screen>
          <Drawer.Screen
            name="Stats"
            component={StatsTab}
            options={getDrawerIconOptions('color-wand-outline')}
          />
          <Drawer.Screen
            name="Maps"
            component={MapsScreen}
            options={getDrawerIconOptions('map-outline')}
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
            name="Logs"
            component={LogScreen}
            options={getDrawerIconOptions('newspaper-outline')}
          />
        </Drawer.Navigator>
        {/* Mounted outside the drawer panel: the panel never unmounts, and the
            settings form holds live text inputs. */}
        <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ActivitiesProvider>
          <AppContent />
        </ActivitiesProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
