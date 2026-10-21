import 'react-native-gesture-handler'; // mandatory before everything else ???
// https://reactnavigation.org/docs/drawer-navigator#installation

import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true
});

const Drawer = createDrawerNavigator<RootDrawerParamList>();

function AppContent() {
  const { reloadActivitiesFromLocalStorage } = useActivitiesContext();
  const [backfillComplete, setBackfillComplete] = useState(false);

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
    SplashScreen.hideAsync();
    simpleLogger.log('✨ App UI loaded and ready');
  }, []);

  useEffect(() => {
    if (backfillComplete) {
      // Activities come from a Strava archive import; no network call is needed.
      reloadActivitiesFromLocalStorage();
    }
  }, [backfillComplete, reloadActivitiesFromLocalStorage]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Drawer.Navigator drawerContent={props => <CustomDrawerContent {...props} />}>
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
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ActivitiesProvider>
        <AppContent />
      </ActivitiesProvider>
    </SettingsProvider>
  );
}
