import { ActivityCalendarPeriod } from '@/features/home/components/ActivityCalendarPeriod';
import { Activity } from '@/shared';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { RootDrawerParamList } from '@/shared/types/types';
import { ResolvedTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { createStyles } from '../screens/HomeScreen.styles';

export type HomeCalendarSectionProps = {
  activities: Activity[];
  calendarDate: string;
  onDayPress: (activity: Activity) => void;
  onEmptyDayPress: (date: string) => void;
  onAdd: (date: string) => void;
  navigation: DrawerNavigationProp<RootDrawerParamList>;
  theme: ResolvedTheme;
  styles: ReturnType<typeof createStyles>;
};

export function HomeCalendarSection({
  activities,
  calendarDate,
  onDayPress,
  onEmptyDayPress,
  onAdd,
  navigation,
  theme,
  styles
}: Readonly<HomeCalendarSectionProps>): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Calendar</Text>
        <TouchableOpacity
          onPress={() => onAdd(calendarDate)}
          accessibilityLabel={`Add activity on ${calendarDate}`}
          accessibilityRole="button"
          style={styles.actionButton}
        >
          <Ionicons name="add" size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.calendarContainer}>
        <ActivityCalendarPeriod
          activities={activities}
          onDayPress={onDayPress}
          onEmptyDayPress={onEmptyDayPress}
          selectedDate={calendarDate}
          navigation={navigation}
        />
      </View>
    </View>
  );
}
