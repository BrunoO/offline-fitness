import React, { JSX } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { STACK_ROUTES } from '@/constants';
import { RootStackParamList } from '@/shared/types/types';
import { ActivityDetailScreen } from '@/features/activities';
import { RecordingScreen } from '@/features/recording/screens/RecordingScreen';
import { TimerRecordingScreen } from '@/features/recording/screens/TimerRecordingScreen';
import { ProfileScreen } from '@/features/profile';
import { LogScreen } from '@/shared';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStackNavigator(): JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true
      }}
    >
      <Stack.Screen
        name={STACK_ROUTES.Main}
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name={STACK_ROUTES.ActivityDetail}
        component={ActivityDetailScreen}
        options={{
          title: 'Activity Analysis',
          headerBackTitle: 'Back'
        }}
      />
      <Stack.Screen
        name={STACK_ROUTES.Record}
        component={RecordingScreen}
        options={{
          title: 'Record (GPS)',
          gestureEnabled: false
        }}
      />
      <Stack.Screen
        name={STACK_ROUTES.TimerRecord}
        component={TimerRecordingScreen}
        options={{
          title: 'Record (Timer)',
          gestureEnabled: false
        }}
      />
      <Stack.Screen
        name={STACK_ROUTES.Profile}
        component={ProfileScreen}
        options={{
          title: 'Athlete Profile'
        }}
      />
      <Stack.Screen
        name={STACK_ROUTES.Logs}
        component={LogScreen}
        options={{
          title: 'Diagnostic Logs'
        }}
      />
    </Stack.Navigator>
  );
}
