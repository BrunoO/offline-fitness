import React, { JSX, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { ActivityAnalysisView } from '../components/ActivityAnalysisView';
import { ActivityEditModal } from '../components/ActivityEditModal';
import { useActivitiesContext } from '../ActivitiesContext';
import { loadRawStreamForActivity } from '../services/fetchAndStoreStreams';
import { writeStreamFile } from '@/features/recording';
import type { StreamSet } from '../types/stravaActivityStream.model';
import type { Activity, RootStackScreenProps } from '@/shared';
import type { EncodableStreamSet } from '@/shared/services/streamCodec';

type ActivityDetailScreenProps = Partial<RootStackScreenProps<'ActivityDetail'>> & {
  route?: {
    params?: {
      activityId: string;
      openEdit?: 'details' | 'trim';
    };
  };
};

interface HeaderEditButtonProps {
  onPress: () => void;
  color: string;
}

function HeaderEditButton({ onPress, color }: Readonly<HeaderEditButtonProps>): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit activity"
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <Ionicons name="create-outline" size={22} color={color} />
    </Pressable>
  );
}

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
  const { globalActivities, updateActivity } = useActivitiesContext();

  const activityId = route?.params?.activityId;
  const initialOpenEdit = route?.params?.openEdit;

  const activity = useMemo(
    () => (activityId ? globalActivities.find(a => a.id === activityId) : undefined),
    [activityId, globalActivities]
  );

  const [editModalVisible, setEditModalVisible] = useState<boolean>(Boolean(initialOpenEdit));
  const [rawStream, setRawStream] = useState<StreamSet | null>(null);
  const [streamVersion, setStreamVersion] = useState<number>(0);

  useEffect(() => {
    if (initialOpenEdit) {
      setEditModalVisible(true);
    }
  }, [initialOpenEdit]);

  useEffect(() => {
    let active = true;
    if (activity) {
      void loadRawStreamForActivity(activity).then(stream => {
        if (active) {
          setRawStream(stream);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [activity, streamVersion]);

  const handleOpenEdit = useCallback(() => {
    setEditModalVisible(true);
  }, []);

  const renderHeaderRight = useCallback(
    () => <HeaderEditButton onPress={handleOpenEdit} color={theme.text} />,
    [handleOpenEdit, theme.text]
  );

  useLayoutEffect(() => {
    if (activity?.name) {
      navigation?.setOptions?.({
        title: activity.name,
        headerRight: renderHeaderRight
      });
    }
  }, [activity?.name, navigation, renderHeaderRight]);

  const handleSaveActivity = async (
    updatedActivity: Activity,
    trimmedStream?: EncodableStreamSet
  ) => {
    if (!activity) return;
    if (trimmedStream) {
      writeStreamFile(activity.id, trimmedStream);
    }
    await updateActivity(activity, updatedActivity);
    setStreamVersion(v => v + 1);
  };

  if (!activity) {
    return (
      <View style={[styles.container, styles.emptyContainer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.emptyText}>Activity not found or has been deleted.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ActivityAnalysisView
        key={`${activity.id}-${streamVersion}`}
        item={activity}
        allActivities={globalActivities}
      />
      <ActivityEditModal
        visible={editModalVisible}
        activity={activity}
        globalActivities={globalActivities}
        rawStream={rawStream}
        initialTab={initialOpenEdit ?? 'details'}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveActivity}
      />
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
