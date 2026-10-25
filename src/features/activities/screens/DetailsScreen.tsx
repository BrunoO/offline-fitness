import { useActivitiesContext } from '@/features/activities/ActivitiesContext';
import { useManualEntry } from '@/features/activities/ManualEntryContext';
import {
  deleteStreamFiles,
  getNoStreamIds
} from '@/features/activities/services/fetchAndStoreStreams';
import {
  Activity,
  compareActivitiesByUtcDesc,
  DetailsScreenProps,
  isNoGpsActivity,
  simpleLogger
} from '@/shared';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '@/theme';
import React, { JSX, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityAnalysisView } from '../components/ActivityAnalysisView';
import { ActivityListItem } from '../components/ActivityListItem';

// This is the default configuration
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false //TMP to remove the warning
});

/**
 * The "+" in the Activities header. A module-level component (not an inline
 * render closure): defining it inside the screen would remount the button on
 * every render. Data flows in as props.
 */
function AddActivityHeaderButton({
  onPress,
  color
}: Readonly<{ onPress: () => void; color: string }>): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Add activity"
      accessibilityRole="button"
      style={{ marginRight: 12, padding: 6 }}
    >
      <Ionicons name="add" size={24} color={color} />
    </TouchableOpacity>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 0,
      paddingBottom: 20
    },
    listContainer: {
      flex: 1,
      width: '100%'
    },
    list: {
      flex: 1,
      width: '100%'
    },
    mapContainer: {
      flex: 2
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12
    },
    searchInput: {
      flex: 1,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8
    },
    clearButton: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.surfaceSunken
    },
    chipsScroll: {
      marginBottom: 8,
      flexGrow: 0
    },
    chipsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface
    },
    chipSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft
    },
    chipLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600'
    }
  });

/**
 * A screen for displaying a list of activities and a map of the selected activity.
 * @param navigation The navigation object.
 * @param route The route object.
 * @returns A React component.
 */
export function DetailsScreen({ navigation, route }: Readonly<DetailsScreenProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const listRef = useRef<{
    scrollToIndex: (params: {
      index: number;
      animated?: boolean;
      viewPosition?: number;
    }) => Promise<void>;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideNoStream, setHideNoStream] = useState<boolean>(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [noStreamIds, setNoStreamIds] = useState<Set<string>>(new Set());
  const { globalActivities, deleteActivity, updateActivity, refreshActivities, fetchingData } =
    useActivitiesContext();
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editingElevation, setEditingElevation] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editedMap, setEditedMap] = useState(new Map<string, Activity>());
  const { openRecordChooser } = useManualEntry();
  const insets = useSafeAreaInsets();

  // If route.params has activities it's a filtered view from Maps — use them.
  // Otherwise (navigated from Home), use live context data so pull-to-refresh works.
  const baseActivities = route.params?.allActivities ?? globalActivities;
  const allActivities = useMemo(
    () => baseActivities.map(a => editedMap.get(a.id) ?? a),
    [baseActivities, editedMap]
  );

  // Reset selected activity if it's no longer in the updated activities list
  React.useEffect(() => {
    if (selectedActivity && !allActivities.some(a => a.id === selectedActivity.id)) {
      setSelectedActivity(null);
    }
  }, [allActivities, selectedActivity]);

  // Honor a requested activity (e.g. coming from the Records screen).
  React.useEffect(() => {
    const requestedId = route.params?.selectedActivityId;
    if (!requestedId) return;
    const match = allActivities.find(a => a.id === requestedId);
    if (match && selectedActivity?.id !== match.id) {
      setSelectedActivity(match);
    }
  }, [route.params?.selectedActivityId, allActivities, selectedActivity?.id]);

  // Debug log to track activities updates
  React.useEffect(() => {
    simpleLogger.log('Activities list updated', {
      activityCount: allActivities.length,
      timestamp: new Date().toISOString()
    });
  }, [allActivities]);

  const onDeleteActivity = (activity: Activity) => {
    deleteActivity(activity);
    try {
      deleteStreamFiles(activity.id);
    } catch (error) {
      // The service already logged the detail; a failed stream cleanup must
      // not blow up the user-facing delete action.
      simpleLogger.error('Failed to delete stream files for deleted activity', error);
    }
  };

  const keyExtractor = (item: Activity) => item.id;

  // Stable element factory for the header: the button itself is hoisted
  // above, so no component is defined during render.
  const renderHeaderRight = React.useCallback(
    () => <AddActivityHeaderButton onPress={openRecordChooser} color={theme.primary} />,
    [openRecordChooser, theme]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Activities (${allActivities.length})`,
      // RECORD-CHOOSER: when GPS tracking lands, this becomes a Track/Manual
      // chooser instead of opening the manual sheet directly.
      headerRight: renderHeaderRight
    });
  }, [navigation, allActivities, renderHeaderRight]);

  const sortedActivities = useMemo(
    () => [...allActivities].sort(compareActivitiesByUtcDesc),
    [allActivities]
  );

  const activityTypes = useMemo(
    () => Array.from(new Set(allActivities.map(a => a.type))).sort((a, b) => a.localeCompare(b)),
    [allActivities]
  );

  React.useEffect(() => {
    const loadNoStreamIds = async () => {
      if (!hideNoStream) return;
      const ids = await getNoStreamIds(allActivities);
      setNoStreamIds(ids);
    };
    loadNoStreamIds().catch(error =>
      simpleLogger.error('Failed to load no-stream activity ids', error)
    );
  }, [hideNoStream, allActivities]);

  const query = searchQuery.trim().toLowerCase();
  const filteredActivities = useMemo(() => {
    const nameFiltered =
      query.length === 0
        ? sortedActivities
        : sortedActivities.filter(a => (a.name || '').toLowerCase().includes(query));
    const typeFiltered =
      selectedTypes.size === 0 ? nameFiltered : nameFiltered.filter(a => selectedTypes.has(a.type));
    return hideNoStream
      ? typeFiltered.filter(a => !isNoGpsActivity(a.type) && !noStreamIds.has(a.id))
      : typeFiltered;
  }, [sortedActivities, query, selectedTypes, hideNoStream, noStreamIds]);

  // Keep the selected activity visible in the list (e.g. after navigating
  // from the Records screen), so its short description can be checked.
  React.useEffect(() => {
    if (!selectedActivity) return;
    const index = filteredActivities.findIndex(a => a.id === selectedActivity.id);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })
        .catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedActivity, filteredActivities]);

  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleActivityPress = (activityId: string) => {
    setSelectedActivity(prev => {
      if (prev?.id === activityId) {
        return null;
      }
      return allActivities.find(a => a.id === activityId) || null;
    });
  };

  const renderItem = ({ item }: { item: Activity }) => (
    <ActivityListItem
      activity={item}
      onPress={handleActivityPress}
      selectedActivityId={selectedActivity?.id ?? null}
      deleteActivity={onDeleteActivity}
      editActivity={activity => {
        setEditingActivity(activity);
        setEditingName(activity.name ?? '');
        setEditingElevation(String(activity.total_elevation_gain));
        setEditError(null);
      }}
    />
  );

  const clearSearch = () => {
    setSearchQuery('');
  };

  return (
    <View style={[styles.container, { paddingTop: 0, paddingBottom: insets.bottom }]}>
      <View style={styles.listContainer}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="map-check-outline"
            size={20}
            color={theme.textMuted}
            style={{ marginRight: 8 }}
          />
          <Switch
            value={hideNoStream}
            onValueChange={setHideNoStream}
            accessibilityLabel="Hide activities without streams"
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            accessibilityLabel="Search activities by name"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearSearch}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {activityTypes.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            style={styles.chipsScroll}
          >
            <TouchableOpacity
              style={[styles.chip, selectedTypes.size === 0 ? styles.chipSelected : null]}
              onPress={() => setSelectedTypes(new Set())}
              accessibilityRole="button"
              accessibilityLabel="Show all activity types"
            >
              <Text style={styles.chipLabel}>All</Text>
            </TouchableOpacity>
            {activityTypes.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, selectedTypes.has(type) ? styles.chipSelected : null]}
                onPress={() => toggleType(type)}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${type}`}
              >
                <Text style={styles.chipLabel}>{type}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.list}>
          <FlashList
            // @ts-expect-error FlashList v2 types omit ref despite runtime forwardRef
            ref={listRef}
            data={filteredActivities}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={selectedActivity}
            onRefresh={refreshActivities}
            refreshing={fetchingData}
          />
        </View>
      </View>
      {selectedActivity ? (
        <View style={styles.mapContainer}>
          <ActivityAnalysisView item={selectedActivity} allActivities={allActivities} />
        </View>
      ) : null}
      <Modal
        visible={editingActivity !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditingActivity(null);
          setEditingName('');
          setEditingElevation('');
          setEditError(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24
          }}
        >
          <View
            style={{
              width: '100%',
              backgroundColor: theme.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.border
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 8 }}>
              Edit activity
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Name</Text>
            <TextInput
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Activity name"
              placeholderTextColor={theme.textMuted}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: theme.text,
                marginBottom: 12
              }}
              autoFocus
            />
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>
              Elevation gain (m)
            </Text>
            <TextInput
              value={editingElevation}
              onChangeText={setEditingElevation}
              placeholder="Elevation gain in metres"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: theme.text,
                marginBottom: 8
              }}
            />
            {editError ? (
              <Text style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>
                {editError}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setEditingActivity(null);
                  setEditingName('');
                  setEditingElevation('');
                  setEditError(null);
                }}
                style={{ padding: 8 }}
              >
                <Text style={{ color: theme.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!editingActivity) return;
                  const trimmedName = editingName.trim();
                  const elevText = editingElevation.trim();
                  let elevation: number | undefined;
                  if (elevText !== '') {
                    const parsed = Number(elevText);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                      setEditError('Elevation gain must be a non-negative number.');
                      return;
                    }
                    elevation = parsed;
                  }
                  const patch: Partial<Activity> = { name: trimmedName };
                  if (elevation !== undefined) {
                    patch.total_elevation_gain = elevation;
                  }
                  const updated = { ...editingActivity, ...patch };
                  try {
                    await updateActivity(editingActivity, patch);
                    setEditedMap(prev => {
                      const next = new Map(prev);
                      next.set(editingActivity.id, updated);
                      return next;
                    });
                    setEditingActivity(null);
                    setEditingName('');
                    setEditingElevation('');
                    setEditError(null);
                  } catch {
                    // updateActivity already logged
                    setEditError('Failed to save. Please try again.');
                  }
                }}
                style={{ padding: 8 }}
              >
                <Text style={{ color: theme.primary, fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
