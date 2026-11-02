import { useActivitiesContext } from '@/features/activities/ActivitiesContext';
import { useManualEntry } from '@/features/activities/ManualEntryContext';
import {
  deleteStreamFiles,
  getNoStreamIds
} from '@/features/activities/services/fetchAndStoreStreams';
import { MERGED_ACTIVITY_TYPES } from '@/features/activities/services/mergeActivities';
import { STORAGE_KEYS } from '@/constants';
import {
  Activity,
  compareActivitiesByUtcDesc,
  DetailsScreenProps,
  isNoGpsActivity,
  seconds_to_label,
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
    filterBanner: {
      backgroundColor: theme.primarySoft,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 10
    },
    filterBannerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    filterBannerTitle: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    filterBannerResetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 4
    },
    filterBannerResetText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primary
    },
    filterTotalsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border
    },
    filterTypeBreakdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border
    },
    filterTypeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border
    },
    filterTypeBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.text
    },
    filterTotalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4
    },
    filterTotalValue: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text
    },
    filterTotalDivider: {
      width: 1,
      height: 14,
      backgroundColor: theme.border
    },
    emptyResetButton: {
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.primary,
      borderRadius: 8
    },
    emptyResetButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '600'
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

function getEmptyActivitiesMessage(
  isFiltered: boolean,
  filterLabel?: string,
  totalActivitiesCount: number = 0
): string {
  if (isFiltered) {
    return filterLabel ? `No activities found for ${filterLabel}.` : 'No activities found.';
  }
  if (totalActivitiesCount === 0) {
    return 'No activities yet. Record or import an activity to get started.';
  }
  return 'No activities match the current filters.';
}

function computeSummaryTotals(
  activities: Activity[],
  useElapsedTime: boolean
): { distanceKm: string; elevationM: string; timeFormatted: string } {
  let distanceMeters = 0;
  let elevationMeters = 0;
  let timeSeconds = 0;
  for (const a of activities) {
    distanceMeters += a.distance || 0;
    elevationMeters += a.total_elevation_gain || 0;
    timeSeconds += (useElapsedTime ? a.elapsed_time : a.moving_time) || 0;
  }
  return {
    distanceKm: (distanceMeters / 1000).toFixed(1),
    elevationM: Math.round(elevationMeters).toLocaleString('en-US'),
    timeFormatted: seconds_to_label(Math.round(timeSeconds))
  };
}

interface TypeBreakdown {
  type: string;
  count: number;
  distanceKm: string;
}

function computeTypeBreakdowns(activities: Activity[]): TypeBreakdown[] {
  const map = new Map<string, { count: number; distanceMeters: number }>();
  for (const a of activities) {
    const entry = map.get(a.type) ?? { count: 0, distanceMeters: 0 };
    entry.count += 1;
    entry.distanceMeters += a.distance || 0;
    map.set(a.type, entry);
  }
  return Array.from(map.entries())
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      distanceKm: (stats.distanceMeters / 1000).toFixed(1)
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

function hasMergedSiblings(types: string[]): boolean {
  const foldedTargets = new Set<string>();
  for (const t of types) {
    const folded = MERGED_ACTIVITY_TYPES[t];
    if (folded) {
      foldedTargets.add(folded);
    }
  }
  return foldedTargets.size > 0 && types.some(t => foldedTargets.has(t));
}

/**
 * Resolves the title shown in the filtered-view banner.
 * Month labels are prefixed with "Month:"; labels that already carry their own
 * prefix (e.g. "Achievement: …", "Record: …") are used verbatim.
 */
/**
 * Resolves the screen title for the activities list.
 */
function resolveActivitiesTitle(filterLabel: string | undefined, count: number): string {
  if (filterLabel) return `${filterLabel} (${count})`;
  return `Activities (${count})`;
}

function resolveBannerTitle(filterLabel?: string): string {
  if (!filterLabel) return 'Filtered view';
  if (filterLabel.includes(':')) return filterLabel;
  return `Month: ${filterLabel}`;
}

/**
 * Applies search, type, and no-stream filters to the sorted activity list.
 */
function filterActivitiesList(
  sortedActivities: Activity[],
  query: string,
  selectedTypes: Set<string>,
  hideNoStream: boolean,
  noStreamIds: Set<string>
): Activity[] {
  const normalizedQuery = query.trim().toLowerCase();
  const nameFiltered =
    normalizedQuery.length === 0
      ? sortedActivities
      : sortedActivities.filter(a => (a.name || '').toLowerCase().includes(normalizedQuery));
  const typeFiltered =
    selectedTypes.size === 0 ? nameFiltered : nameFiltered.filter(a => selectedTypes.has(a.type));
  if (!hideNoStream) return typeFiltered;
  return typeFiltered.filter(a => !isNoGpsActivity(a.type) && !noStreamIds.has(a.id));
}

interface FilteredBannerSlotProps {
  isFiltered: boolean;
  filterLabel?: string;
  totalFilteredCount: number;
  totalBaseCount: number;
  distanceKm: string;
  elevationM: string;
  timeFormatted: string;
  typeBreakdowns: TypeBreakdown[];
  onClear: () => void;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
}

function FilteredBannerSlot({
  isFiltered,
  ...rest
}: Readonly<FilteredBannerSlotProps>): React.JSX.Element | null {
  if (!isFiltered) return null;
  return <FilteredViewBanner {...rest} />;
}

function EmptyResetButtonSlot({
  isFiltered,
  onPress,
  styles
}: Readonly<{
  isFiltered: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element | null {
  if (!isFiltered) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.emptyResetButton}
      accessibilityRole="button"
      accessibilityLabel="Show all activities"
    >
      <Text style={styles.emptyResetButtonText}>Show all activities</Text>
    </TouchableOpacity>
  );
}

interface ActivitiesEmptyStateProps {
  fetchingData: boolean;
  isFiltered: boolean;
  filterLabel?: string;
  totalActivitiesCount: number;
  onReset: () => void;
  styles: ReturnType<typeof createStyles>;
}

function ActivitiesEmptyState({
  fetchingData,
  isFiltered,
  filterLabel,
  totalActivitiesCount,
  onReset,
  styles
}: Readonly<ActivitiesEmptyStateProps>): React.JSX.Element | null {
  if (fetchingData) return null;
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {getEmptyActivitiesMessage(isFiltered, filterLabel, totalActivitiesCount)}
      </Text>
      <EmptyResetButtonSlot isFiltered={isFiltered} onPress={onReset} styles={styles} />
    </View>
  );
}

function ActivityMapContainer({
  selectedActivity,
  allActivities,
  styles
}: Readonly<{
  selectedActivity: Activity | null;
  allActivities: Activity[];
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element | null {
  if (!selectedActivity) return null;
  return (
    <View style={styles.mapContainer}>
      <ActivityAnalysisView item={selectedActivity} allActivities={allActivities} />
    </View>
  );
}

function ClearSearchButtonSlot({
  visible,
  onClear,
  styles,
  color
}: Readonly<{
  visible: boolean;
  onClear: () => void;
  styles: ReturnType<typeof createStyles>;
  color: string;
}>): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <TouchableOpacity
      style={styles.clearButton}
      onPress={onClear}
      accessibilityLabel="Clear search"
      accessibilityRole="button"
    >
      <Ionicons name="close" size={20} color={color} />
    </TouchableOpacity>
  );
}

function SwipeTipBannerSlot({
  visible,
  onDismiss,
  styles,
  primaryColor,
  mutedColor
}: Readonly<{
  visible: boolean;
  onDismiss: () => void;
  styles: ReturnType<typeof createStyles>;
  primaryColor: string;
  mutedColor: string;
}>): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <View style={styles.swipeTipBanner}>
      <Ionicons name="information-circle-outline" size={16} color={primaryColor} />
      <Text style={styles.swipeTipText}>Tip: Swipe left on an activity to edit or delete</Text>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss swipe tip"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.swipeTipClose}
      >
        <Ionicons name="close" size={16} color={mutedColor} />
      </TouchableOpacity>
    </View>
  );
}

function ActivityTypeChipsSlot({
  activityTypes,
  selectedTypes,
  onToggle,
  onClearAll,
  styles
}: Readonly<{
  activityTypes: string[];
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  onClearAll: () => void;
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element | null {
  if (activityTypes.length <= 1) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
      style={styles.chipsScroll}
    >
      <TouchableOpacity
        style={[styles.chip, selectedTypes.size === 0 ? styles.chipSelected : null]}
        onPress={onClearAll}
        accessibilityRole="button"
        accessibilityLabel="Show all activity types"
      >
        <Text style={styles.chipLabel}>All</Text>
      </TouchableOpacity>
      {activityTypes.map(type => (
        <TouchableOpacity
          key={type}
          style={[styles.chip, selectedTypes.has(type) ? styles.chipSelected : null]}
          onPress={() => onToggle(type)}
          accessibilityRole="button"
          accessibilityLabel={`Filter by ${type}`}
        >
          <Text style={styles.chipLabel}>{type}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

interface FilteredViewBannerProps {
  filterLabel?: string;
  totalFilteredCount: number;
  totalBaseCount: number;
  distanceKm: string;
  elevationM: string;
  timeFormatted: string;
  typeBreakdowns: TypeBreakdown[];
  onClear: () => void;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
}

function FilteredViewBanner({
  filterLabel,
  totalFilteredCount,
  totalBaseCount,
  distanceKm,
  elevationM,
  timeFormatted,
  typeBreakdowns,
  onClear,
  theme,
  styles
}: Readonly<FilteredViewBannerProps>): React.JSX.Element {
  const noun = totalFilteredCount === 1 ? 'activity' : 'activities';
  const countText =
    totalFilteredCount === totalBaseCount
      ? `${totalFilteredCount} ${noun}`
      : `${totalFilteredCount} of ${totalBaseCount} activities`;

  const showBreakdown =
    totalFilteredCount > 0 &&
    (typeBreakdowns.length > 1 || hasMergedSiblings(typeBreakdowns.map(b => b.type)));

  const bannerTitle = resolveBannerTitle(filterLabel);

  return (
    <View style={styles.filterBanner}>
      <View style={styles.filterBannerHeader}>
        <Ionicons name="filter" size={16} color={theme.primary} />
        <Text style={styles.filterBannerTitle} numberOfLines={1}>
          {bannerTitle} ({countText})
        </Text>
        <TouchableOpacity
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Reset to all activities"
          style={styles.filterBannerResetButton}
        >
          <Text style={styles.filterBannerResetText}>Clear filter</Text>
          <Ionicons name="close-circle" size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>
      {totalFilteredCount > 0 ? (
        <View style={styles.filterTotalsRow}>
          <View style={styles.filterTotalItem}>
            <Ionicons name="navigate-outline" size={14} color={theme.primary} />
            <Text style={styles.filterTotalValue}>{distanceKm} km</Text>
          </View>
          <View style={styles.filterTotalDivider} />
          <View style={styles.filterTotalItem}>
            <Ionicons name="trending-up-outline" size={14} color={theme.primary} />
            <Text style={styles.filterTotalValue}>{elevationM} m</Text>
          </View>
          <View style={styles.filterTotalDivider} />
          <View style={styles.filterTotalItem}>
            <Ionicons name="time-outline" size={14} color={theme.primary} />
            <Text style={styles.filterTotalValue}>{timeFormatted}</Text>
          </View>
        </View>
      ) : null}
      {showBreakdown ? (
        <View style={styles.filterTypeBreakdownRow}>
          {typeBreakdowns.map(b => {
            const isFolded = Boolean(MERGED_ACTIVITY_TYPES[b.type]);
            const label = isFolded
              ? `${b.type} (${MERGED_ACTIVITY_TYPES[b.type]}): ${b.distanceKm} km`
              : `${b.type}: ${b.distanceKm} km`;
            return (
              <View key={b.type} style={styles.filterTypeBadge}>
                <Text style={styles.filterTypeBadgeText}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
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

  const handleResetToAllActivities = useCallback(() => {
    navigation.setParams({
      allActivities: undefined,
      filterLabel: undefined,
      selectedActivityId: undefined
    });
    setSelectedActivity(null);
    setSearchQuery('');
    setSelectedTypes(new Set());
    setHideNoStream(false);
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: resolveActivitiesTitle(route.params?.filterLabel, allActivities.length),
      // RECORD-CHOOSER: when GPS tracking lands, this becomes a Track/Manual
      // chooser instead of opening the manual sheet directly.
      headerRight: renderHeaderRight
    });
  }, [navigation, allActivities, renderHeaderRight, route.params?.filterLabel]);

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

  const filteredActivities = useMemo(
    () =>
      filterActivitiesList(sortedActivities, searchQuery, selectedTypes, hideNoStream, noStreamIds),
    [sortedActivities, searchQuery, selectedTypes, hideNoStream, noStreamIds]
  );

  const useElapsedTime = route.params?.useElapsedTime ?? true;
  const summaryTotals = useMemo(
    () => computeSummaryTotals(filteredActivities, useElapsedTime),
    [filteredActivities, useElapsedTime]
  );
  const typeBreakdowns = useMemo(
    () => computeTypeBreakdowns(filteredActivities),
    [filteredActivities]
  );

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
        <FilteredBannerSlot
          isFiltered={route.params?.allActivities !== undefined}
          filterLabel={route.params?.filterLabel}
          totalFilteredCount={filteredActivities.length}
          totalBaseCount={allActivities.length}
          distanceKm={summaryTotals.distanceKm}
          elevationM={summaryTotals.elevationM}
          timeFormatted={summaryTotals.timeFormatted}
          typeBreakdowns={typeBreakdowns}
          onClear={handleResetToAllActivities}
          theme={theme}
          styles={styles}
        />
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
          <ClearSearchButtonSlot
            visible={searchQuery.length > 0}
            onClear={clearSearch}
            styles={styles}
            color={theme.textMuted}
          />
        </View>
        <ActivityTypeChipsSlot
          activityTypes={activityTypes}
          selectedTypes={selectedTypes}
          onToggle={toggleType}
          onClearAll={() => setSelectedTypes(new Set())}
          styles={styles}
        />
        <SwipeTipBannerSlot
          visible={showSwipeTip ? allActivities.length > 0 : false}
          onDismiss={handleDismissSwipeTip}
          styles={styles}
          primaryColor={theme.primary}
          mutedColor={theme.textMuted}
        />
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
              <ActivitiesEmptyState
                fetchingData={fetchingData}
                isFiltered={route.params?.allActivities !== undefined}
                filterLabel={route.params?.filterLabel}
                totalActivitiesCount={allActivities.length}
                onReset={handleResetToAllActivities}
                styles={styles}
              />
            }
          />
        </View>
      </View>
      <ActivityMapContainer
        selectedActivity={selectedActivity}
        allActivities={allActivities}
        styles={styles}
      />
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
