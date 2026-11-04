import React, { JSX, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { ActivityAnalysisView } from '../components/ActivityAnalysisView';
import { useActivitiesContext } from '../ActivitiesContext';
import { RootStackScreenProps } from '@/shared';

type ActivityDetailScreenProps = Partial<RootStackScreenProps<'ActivityDetail'>> & {
  route?: {
    params?: {
      activityId: string;
    };
  };
};

/**
 * Dedicated full-screen route for activity analysis, map flyover, elevation profile,
 * and track comparison. Replaces the split-screen view in DetailsScreen.
 */
export function ActivityDetailScreen({
  route,
  navigation
}: Readonly<ActivityDetailScreenProps>): JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { globalActivities } = useActivitiesContext();

  const activityId = route?.params?.activityId;
  const activity = useMemo(
    () => (activityId ? globalActivities.find(a => a.id === activityId) : undefined),
    [activityId, globalActivities]
  );

  useLayoutEffect(() => {
    if (activity?.name) {
      navigation?.setOptions?.({
        title: activity.name
      });
    }
  }, [activity?.name, navigation]);

  if (!activity) {
    return (
      <View style={[styles.container, styles.emptyContainer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.emptyText}>Activity not found or has been deleted.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ActivityAnalysisView item={activity} allActivities={globalActivities} />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    },
    emptyText: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center'
    }
  });
