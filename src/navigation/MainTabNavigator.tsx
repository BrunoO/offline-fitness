import React, { JSX } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TAB_ROUTES } from '@/constants';
import { MainTabParamList } from '@/shared/types/types';
import { HomeScreen } from '@/features/home';
import { DetailsScreen } from '@/features/activities';
import { StatsTab } from '@/features/stats';
import { MapsScreen } from '@/features/maps';
import { HeaderHubButton } from '@/features/profile';
import { FloatingTabBar } from './FloatingTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

function EmptyRecordActionSlot(): JSX.Element | null {
  return null;
}

export function MainTabNavigator(): JSX.Element {
  return (
    <Tab.Navigator
      tabBar={FloatingTabBar}
      screenOptions={{
        headerShown: true
      }}
    >
      <Tab.Screen name={TAB_ROUTES.Home} component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name={TAB_ROUTES.Activities}
        component={DetailsScreen}
        options={{ title: 'Activities' }}
      />
      <Tab.Screen
        name={TAB_ROUTES.RecordAction}
        component={EmptyRecordActionSlot}
        options={{ headerShown: false }}
      />
      <Tab.Screen name={TAB_ROUTES.Stats} component={StatsTab} options={{ title: 'Stats' }} />
      <Tab.Screen
        name={TAB_ROUTES.Maps}
        component={MapsScreen}
        options={{
          title: 'Maps',
          // prettier-ignore
          headerRight: () => <HeaderHubButton /> // NOSONAR - header action
        }}
      />
    </Tab.Navigator>
  );
}
