import { useActivitiesContext } from '@/features/activities/ActivitiesContext';
import { useManualEntry } from '@/features/activities/ManualEntryContext';
import {
  deleteStreamFiles,
  getNoStreamIds
} from '@/features/activities/services/fetchAndStoreStreams';
import { STORAGE_KEYS } from '@/constants';
import {
  Activity,
  compareActivitiesByUtcDesc,
  DetailsScreenProps,
  isNoGpsActivity,
  simpleLogger
} from '@/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '@/theme';
import React, { JSX, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
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
      marginRight: 8,
      color: theme.text
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
    },
    swipeTipBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surfaceSunken,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom: 8
    },
    swipeTipText: {
      flex: 1,
      fontSize: 12,
      color: theme.text,
      marginLeft: 6,
      marginRight: 6
    },
    swipeTipClose: {
      padding: 2
    },
    emptyContainer: {
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center'
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center'
    },
    modalButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 8
    },
    modalSecondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSunken,
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalSecondaryButtonPressed: {
      opacity: 0.7
    },
    modalSecondaryButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600'
    },
    modalPrimaryButton: {
      minHeight: 44,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalPrimaryButtonPressed: {
      backgroundColor: theme.primaryPressed
    },
    modalPrimaryButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '700'
    }
  });

interface EditActivityModalProps {
  activity: Activity | null;
  onClose: () => void;
  onSave: (activity: Activity, patch: Partial<Activity>) => Promise<void>;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
}

function EditActivityModal({
  activity,
  onClose,
  onSave,
  theme,
  styles
}: Readonly<EditActivityModalProps>): React.JSX.Element {
  const [editingName, setEditingName] = useState<string>('');
  const [editingElevation, setEditingElevation] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  React.useEffect(() => {
    if (activity) {
      setEditingName(activity.name ?? '');
      setEditingElevation(
        activity.total_elevation_gain !== undefined ? String(activity.total_elevation_gain) : ''
      );
      setEditError(null);
    }
  }, [activity]);

  const handleSave = async () => {
    if (!activity) return;
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
    try {
      await onSave(activity, patch);
      onClose();
    } catch {
      setEditError('Failed to save. Please try again.');
    }
  };

  return (
    <Modal visible={activity !== null} transparent animationType="fade" onRequestClose={onClose}>
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
            <Text style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{editError}</Text>
          ) : null}
          <View style={styles.modalButtonsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalSecondaryButton,
                pressed ? styles.modalSecondaryButtonPressed : null
              ]}
            >
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save activity changes"
              onPress={handleSave}
              style={({ pressed }) => [
                styles.modalPrimaryButton,
                pressed ? styles.modalPrimaryButtonPressed : null
              ]}
            >
              <Text style={styles.modalPrimaryButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
  const [editedMap, setEditedMap] = useState(new Map<string, Activity>());
  const [showSwipeTip, setShowSwipeTip] = useState<boolean>(false);
  const { openRecordChooser } = useManualEntry();
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEYS.DISMISSED_SWIPE_TIP)
      .then(val => {
        if (isMounted && val !== 'true') {
          setShowSwipeTip(true);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const handleDismissSwipeTip = useCallback(() => {
    setShowSwipeTip(false);
    AsyncStorage.setItem(STORAGE_KEYS.DISMISSED_SWIPE_TIP, 'true').catch(() => undefined);
  }, []);

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

  // Stable identity for the memoised ActivityListItem (deleteActivity from context).
  const onDeleteActivity = useCallback(
    (activity: Activity) => {
      const activityName = activity.name?.trim() ? `"${activity.name.trim()}"` : 'this activity';
      Alert.alert(
        'Delete Activity?',
        `Are you sure you want to delete ${activityName}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteActivity(activity);
              try {
                deleteStreamFiles(activity.id);
              } catch (error) {
                // The service already logged the detail; a failed stream cleanup must
                // not blow up the user-facing delete action.
                simpleLogger.error('Failed to delete stream files for deleted activity', error);
              }
            }
          }
        ]
      );
    },
    [deleteActivity]
  );

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

  // Stable identity so the memoised ActivityListItem keeps its onPress ref
  // across unrelated re-renders (e.g. while typing in search).
  const handleActivityPress = useCallback(
    (activityId: string) => {
      setSelectedActivity(prev => {
        if (prev?.id === activityId) {
          return null;
        }
        return allActivities.find(a => a.id === activityId) || null;
      });
    },
    [allActivities]
  );

  // Stable identity for the memoised ActivityListItem (state setters are stable).
  const handleEditActivity = useCallback((activity: Activity) => {
    setEditingActivity(activity);
  }, []);

  const handleSaveEditedActivity = useCallback(
    async (activity: Activity, patch: Partial<Activity>) => {
      await updateActivity(activity, patch);
      const updated = { ...activity, ...patch };
      setEditedMap(prev => {
        const next = new Map(prev);
        next.set(activity.id, updated);
        return next;
      });
    },
    [updateActivity]
  );

  const renderItem = useCallback(
    ({ item }: { item: Activity }) => (
      <ActivityListItem
        activity={item}
        onPress={handleActivityPress}
        selectedActivityId={selectedActivity?.id ?? null}
        deleteActivity={onDeleteActivity}
        editActivity={handleEditActivity}
      />
    ),
    [selectedActivity?.id, handleActivityPress, onDeleteActivity, handleEditActivity]
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
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={hideNoStream ? theme.onPrimary : theme.surfaceSunken}
            accessibilityLabel="Hide activities without streams"
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name"
            placeholderTextColor={theme.textMuted}
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
        {showSwipeTip && allActivities.length > 0 ? (
          <View style={styles.swipeTipBanner}>
            <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
            <Text style={styles.swipeTipText}>
              Tip: Swipe left on an activity to edit or delete
            </Text>
            <TouchableOpacity
              onPress={handleDismissSwipeTip}
              accessibilityRole="button"
              accessibilityLabel="Dismiss swipe tip"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.swipeTipClose}
            >
              <Ionicons name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
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
            ListEmptyComponent={
              !fetchingData ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {allActivities.length === 0
                      ? 'No activities yet. Record or import an activity to get started.'
                      : 'No activities match the current filters.'}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      </View>
      {selectedActivity ? (
        <View style={styles.mapContainer}>
          <ActivityAnalysisView item={selectedActivity} allActivities={allActivities} />
        </View>
      ) : null}
      <EditActivityModal
        activity={editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={handleSaveEditedActivity}
        theme={theme}
        styles={styles}
      />
    </View>
  );
}
