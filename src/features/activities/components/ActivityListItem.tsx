import { Activity } from '@/shared';
import { IconButton } from '@/shared/utils/IconsUtils';
import { activityToString, calculateSpeedKmh, getActivityIcon } from '@/shared/utils/utils';
import { ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    swipeable: {
      backgroundColor: theme.swipeReveal,
      flexDirection: 'row',
      marginVertical: 2
    },
    itemContainer: {
      flex: 1,
      flexDirection: 'row',
      width: '100%',
      paddingEnd: 10
    },
    pressableContainer: {
      width: '100%',
      height: 60,
      marginVertical: 4,
      marginStart: 4,
      padding: 8,
      backgroundColor: theme.surface,
      borderRadius: 8,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84
        },
        android: {
          elevation: 5
        }
      })
    },
    pressableText: {
      fontSize: 16,
      flex: 1
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%'
    },
    itemIcon: {
      fontSize: 22
    },
    deleteButton: {
      backgroundColor: theme.danger,
      borderRadius: 8,
      padding: 8,
      margin: 4,
      justifyContent: 'center',
      alignItems: 'center',
      top: 5,
      marginEnd: 15
    }
  });

/**
 * The right action component for the swipeable list item.
 * @param activity The activity associated with the list item.
 * @param deleteActivity A function to delete the activity.
 * @param progress The progress of the swipe animation.
 * @returns A React component.
 */
function RightAction({
  activity,
  deleteActivity,
  editActivity,
  progress
}: Readonly<{
  activity: Activity;
  deleteActivity: (activity: Activity) => void;
  editActivity: (activity: Activity) => void;
  progress: SharedValue<number>;
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const translateX = useDerivedValue(() => interpolate(progress.get(), [0, 1], [100, 0]));

  const scale = useDerivedValue(() => interpolate(progress.get(), [0, 1], [1, 1.1]));

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }, { scale: scale.value }],
      opacity: progress.get()
    };
  });

  return (
    <Animated.View style={[animatedStyle, { flexDirection: 'row' }]}>
      <IconButton
        icon="edit"
        onPress={() => {
          editActivity(activity);
        }}
        buttonStyle={[styles.deleteButton, { backgroundColor: theme.primary }]}
      />
      <IconButton
        icon="delete"
        onPress={() => {
          deleteActivity(activity);
        }}
        buttonStyle={styles.deleteButton}
      />
    </Animated.View>
  );
}

/**
 * A list item for an activity.
 * @param activity The activity to display.
 * @param onPress A function to call when the item is pressed.
 * @param selectedActivityId The ID of the selected activity.
 * @param deleteActivity A function to delete the activity.
 * @returns A React component.
 */
export function ActivityListItem({
  activity,
  onPress,
  selectedActivityId,
  deleteActivity,
  editActivity
}: Readonly<{
  activity: Activity;
  onPress: (id: string) => void;
  selectedActivityId: string | null;
  deleteActivity: (activity: Activity) => void;
  editActivity: (activity: Activity) => void;
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const progress = useSharedValue(0);
  const isSelected = activity.id === selectedActivityId;

  const handlePress = () => {
    onPress(activity.id);
  };

  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <RightAction
          activity={activity}
          deleteActivity={deleteActivity}
          editActivity={editActivity}
          progress={progress}
        />
      )}
      onSwipeableWillOpen={() => {
        progress.value = withSpring(1);
      }}
      onSwipeableWillClose={() => {
        progress.value = withSpring(0);
      }}
      containerStyle={styles.swipeable}
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
    >
      <View style={styles.itemContainer}>
        <Pressable
          onPress={handlePress}
          style={[
            styles.pressableContainer,
            { backgroundColor: isSelected ? theme.primarySoft : theme.surface }
          ]}
        >
          <View style={styles.itemRow}>
            <Text style={styles.itemIcon}>{getActivityIcon(activity.type)}</Text>
            <Text style={styles.pressableText} numberOfLines={2} ellipsizeMode="tail">
              {activityToString(activity) +
                ' at avg ' +
                calculateSpeedKmh(activity.distance, activity.moving_time).toFixed(1) +
                ' km/h'}
            </Text>
          </View>
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}
