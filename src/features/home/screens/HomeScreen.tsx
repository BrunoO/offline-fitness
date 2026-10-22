import { ResolvedTheme, useTheme } from '@/theme';
import {
  DayActivitiesSheet,
  LastActivitySummary,
  countStreamsStatus,
  loadStreamForActivity,
  useActivitiesContext,
  useManualEntry
} from '@/features/activities';
import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import { ActivityStats, calculateRecentActivityStats, weeklyData } from '@/features/stats';
import { useSettings } from '@/features/stats/StatsTabSettingsContext';
import {
  Activity,
  activityLocalDate,
  activityUtcMs,
  ActivityStream,
  BACKUP_LAST_SYNC_KEY,
  relative_time_label,
  retrieveStringValue,
  RootDrawerParamList,
  seconds_to_label,
  simpleLogger
} from '@/shared';
import {
  computeDayStreaks,
  computeWeekStreaks,
  computeWeeklyGoalStreaks
} from '@/shared/services/streaks';
import { Ionicons } from '@expo/vector-icons';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useFocusEffect } from '@react-navigation/native';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityCalendarPeriod } from '../components/ActivityCalendarPeriod';

type HomeScreenProps = {
  navigation: DrawerNavigationProp<RootDrawerParamList, 'Home'>;
};

/**
 * A backup older than this is flagged in the header: the app never syncs by
 * itself, so a stale timestamp means the user's only copy is the phone's.
 */
const STALE_BACKUP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The home screen of the app.
 * @param navigation The navigation object.
 * @returns A React component.
 */
/** Formats an achievement with its optional activity name; 'N/A' when unrecorded. */
function achievementLabel(valueText: string | null, name?: string | null): string {
  if (valueText === null) return 'N/A';
  return name ? `${valueText} (${name})` : valueText;
}

export function HomeScreen({ navigation }: Readonly<HomeScreenProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const {
    globalActivities,
    totalActivitiesStored,
    fetchingData,
    reloadActivitiesFromLocalStorage,
    lastBackupSync,
    recordBackupSync
  } = useActivitiesContext();
  const [homeScreenStream, setHomeScreenStream] = useState<{
    stream: ActivityStream | undefined;
  }>({ stream: undefined });
  const [streamStatus, setStreamStatus] = useState<{
    downloadedStreams: number;
    missingStreams: number;
  }>({
    downloadedStreams: 0,
    missingStreams: 0
  });
  const [selectedActivityStats, setSelectedActivityStats] = useState<ActivityStats | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().split('T')[0]);
  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);
  const { openManualEntry } = useManualEntry();
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [dayStreak, setDayStreak] = useState<{ current: number; best: number }>({
    current: 0,
    best: 0
  });
  const [weekStreak, setWeekStreak] = useState<{ current: number; best: number }>({
    current: 0,
    best: 0
  });
  const [goalWeekStreak, setGoalWeekStreak] = useState<{ current: number; best: number }>({
    current: 0,
    best: 0
  });
  const [achievementsStartDate, setAchievementsStartDate] = useState<Date | null>(null);

  const [weeklySummary, setWeeklySummary] = useState<{
    totalHours: number;
    totalDistanceKm: number;
    totalElevationM: number;
  }>({
    totalHours: 0,
    totalDistanceKm: 0,
    totalElevationM: 0
  });

  const [recentAchievements, setRecentAchievements] = useState<{
    longestDistanceKm: number;
    longestDistanceName: string | null;
    biggestClimbM: number;
    biggestClimbName: string | null;
    longestWeekKm: number;
  }>({
    longestDistanceKm: 0,
    longestDistanceName: null,
    biggestClimbM: 0,
    biggestClimbName: null,
    longestWeekKm: 0
  });

  // Tracks whether we've already selected the initial activity to avoid
  // re-running initialization when the user selects a different activity.
  const hasInitializedActivity = useRef(false);

  // When the WebDAV backup last ran, shown in the header: the app is offline
  // and syncs only by hand, so this is the one number that says whether the
  // data on this phone is also safe somewhere else.
  const [backupFreshness, setBackupFreshness] = useState<{ label: string; stale: boolean }>({
    label: 'No backup yet',
    stale: false
  });

  const updateBackupFreshness = useCallback((syncedAt: string | null) => {
    const ago = relative_time_label(syncedAt);
    if (!syncedAt || ago === null) {
      setBackupFreshness({ label: 'No backup yet', stale: false });
      return;
    }
    setBackupFreshness({
      label: `Synced ${ago}`,
      stale: Date.now() - Date.parse(syncedAt) > STALE_BACKUP_MS
    });
  }, []);

  useEffect(() => {
    updateBackupFreshness(lastBackupSync);
    const interval = setInterval(() => {
      updateBackupFreshness(lastBackupSync);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [lastBackupSync, updateBackupFreshness]);

  const loadBackupFreshness = useCallback(async () => {
    try {
      const syncedAt = await retrieveStringValue(BACKUP_LAST_SYNC_KEY);
      if (syncedAt) {
        recordBackupSync(syncedAt);
      } else {
        updateBackupFreshness(null);
      }
    } catch (error) {
      simpleLogger.error('Could not read the last backup time:', error);
    }
  }, [recordBackupSync, updateBackupFreshness]);

  const handleRefresh = useCallback(async () => {
    await reloadActivitiesFromLocalStorage();
    const status = await countStreamsStatus(globalActivities);
    setStreamStatus(status);
    void loadBackupFreshness();
  }, [globalActivities, reloadActivitiesFromLocalStorage, loadBackupFreshness]);

  // Initialize selected activity once when activities first load.
  // Uses a ref so that subsequent user-driven selections don't re-trigger this.
  useEffect(() => {
    if (globalActivities.length > 0 && !hasInitializedActivity.current) {
      hasInitializedActivity.current = true;
      const mostRecent = globalActivities[0]; // sorted descending, index 0 = most recent
      setSelectedActivity(mostRecent);
      setHomeScreenStream({ stream: undefined });
      setIsLoadingStream(true);
      const stats = calculateRecentActivityStats(mostRecent, globalActivities);
      setSelectedActivityStats(stats);
    }
  }, [globalActivities]);

  // Compute streaks independently — not tied to activity selection.
  // Previously combined with the initialization effect above, causing
  // computeDayStreaks/computeWeekStreaks to re-run on every activity tap.
  useEffect(() => {
    if (globalActivities.length > 0) {
      setDayStreak(computeDayStreaks(globalActivities));
      setWeekStreak(computeWeekStreaks(globalActivities));
    } else {
      setDayStreak({ current: 0, best: 0 });
      setWeekStreak({ current: 0, best: 0 });
    }
  }, [globalActivities]);

  // Weekly goal streaks
  const { weeklyGoal, numberRecentWeeks, useElapsedTime } = useSettings();
  useEffect(() => {
    if (globalActivities.length > 0) {
      setGoalWeekStreak(computeWeeklyGoalStreaks(globalActivities, weeklyGoal));
    } else {
      setGoalWeekStreak({ current: 0, best: 0 });
    }
  }, [globalActivities, weeklyGoal]);

  // Weekly summary for current ISO week
  useEffect(() => {
    if (globalActivities.length === 0) {
      setWeeklySummary({ totalHours: 0, totalDistanceKm: 0, totalElevationM: 0 });
      return;
    }

    // Reuse weeklyData and only look at the most recent week
    const activityTypes = Array.from(new Set(globalActivities.map(a => a.type))).sort((a, b) =>
      a.localeCompare(b)
    ) as string[];
    const weeks = weeklyData(activityTypes, globalActivities, 1, useElapsedTime);
    if (weeks.length === 0) {
      setWeeklySummary({ totalHours: 0, totalDistanceKm: 0, totalElevationM: 0 });
      return;
    }

    const mostRecent = weeks[0];
    const totalHours = mostRecent.extraValues.get('totalH') ?? 0;
    const totalDistanceKm = (mostRecent.extraValues.get('dist') ?? 0) / 1000;
    const totalElevationM = mostRecent.extraValues.get('elev') ?? 0;

    setWeeklySummary({
      totalHours,
      totalDistanceKm,
      totalElevationM
    });
  }, [globalActivities, useElapsedTime]);

  // Recent achievements (across all activities)
  useEffect(() => {
    if (globalActivities.length === 0) {
      setRecentAchievements({
        longestDistanceKm: 0,
        longestDistanceName: null,
        biggestClimbM: 0,
        biggestClimbName: null,
        longestWeekKm: 0
      });
      return;
    }

    // Limit to activities in the last 3 months
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 3);
    setAchievementsStartDate(threshold);

    const recentActivities = globalActivities.filter(
      activity => activityUtcMs(activity) >= threshold.getTime()
    );

    if (recentActivities.length === 0) {
      setAchievementsStartDate(threshold);
      setRecentAchievements({
        longestDistanceKm: 0,
        longestDistanceName: null,
        biggestClimbM: 0,
        biggestClimbName: null,
        longestWeekKm: 0
      });
      return;
    }

    let longestDistanceKm = 0;
    let longestDistanceName: string | null = null;
    let biggestClimbM = 0;
    let biggestClimbName: string | null = null;

    for (const activity of recentActivities) {
      const distanceKm = activity.distance / 1000;
      if (distanceKm > longestDistanceKm) {
        longestDistanceKm = distanceKm;
        longestDistanceName = activity.name;
      }

      if (activity.total_elevation_gain > biggestClimbM) {
        biggestClimbM = activity.total_elevation_gain;
        biggestClimbName = activity.name;
      }
    }

    // Compute longest recent week by total distance
    const activityTypes = Array.from(new Set(recentActivities.map(a => a.type))).sort((a, b) =>
      a.localeCompare(b)
    ) as string[];
    const weeks = weeklyData(activityTypes, recentActivities, numberRecentWeeks, useElapsedTime);

    let longestWeekKm = 0;
    if (weeks.length > 0) {
      for (const week of weeks) {
        const dist = week.extraValues.get('dist') ?? 0; // meters
        const distanceKm = dist / 1000; // convert to kilometers
        if (distanceKm > longestWeekKm) {
          longestWeekKm = distanceKm;
        }
      }
    }

    setRecentAchievements({
      longestDistanceKm,
      longestDistanceName,
      biggestClimbM,
      biggestClimbName,
      longestWeekKm
    });
  }, [globalActivities, numberRecentWeeks, useElapsedTime]);

  const handleActivityChange = (activity: Activity) => {
    simpleLogger.log('Activity selection changed', {
      activityId: activity.id,
      activityName: activity.name,
      activityType: activity.type,
      totalActivities: globalActivities.length,
      timestamp: new Date().toISOString()
    });
    setSelectedActivity(activity);
    // Clear stream state immediately to prevent stale data display
    setHomeScreenStream({ stream: undefined });
    setIsLoadingStream(true);
    // Recalculate stats for the selected activity
    if (globalActivities.length > 0) {
      const stats = calculateRecentActivityStats(activity, globalActivities);
      setSelectedActivityStats(stats);
    }
  };

  /**
   * Opens the day sheet for a calendar day, whether or not it holds
   * activities — days often carry several (a ride plus an evening Yoga), so
   * the tap lists them all instead of silently picking the most recent one.
   */
  const openDaySheet = useCallback((date: string) => {
    setDaySheetDate(date);
  }, []);

  const handleDaySheetSelect = (activity: Activity) => {
    setDaySheetDate(null);
    handleActivityChange(activity);
  };

  const handleDaySheetAdd = (date: string) => {
    setDaySheetDate(null);
    openManualEntry(date);
  };

  const daySheetActivities = useMemo(() => {
    if (daySheetDate === null) return [];
    return globalActivities.filter(a => activityLocalDate(a) === daySheetDate);
  }, [daySheetDate, globalActivities]);

  /**
   * Handles the press event on a day in the calendar.
   * It updates the selected activity and the calendar's selected date.
   * @param {Activity} activity The activity associated with the pressed day.
   */
  const handleCalendarDayPress = (activity: Activity) => {
    simpleLogger.log('User selected activity from calendar', {
      activityId: activity.id,
      activityName: activity.name,
      activityType: activity.type,
      activityDate: activity.start_date_local,
      timestamp: new Date().toISOString()
    });
    openDaySheet(activityLocalDate(activity));
  };

  /**
   * Handles the press event on an empty calendar day: same sheet, Add first.
   */
  const handleCalendarEmptyDayPress = (date: string) => {
    simpleLogger.log('User pressed empty calendar day', {
      activityDate: date,
      timestamp: new Date().toISOString()
    });
    openDaySheet(date);
  };

  // Update calendar date when selected activity changes
  useEffect(() => {
    if (selectedActivity) {
      setCalendarDate(activityLocalDate(selectedActivity));
    }
  }, [selectedActivity]);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchData = async () => {
      if (selectedActivity && isMounted) {
        try {
          setIsLoadingStream(true);
          const stream = await loadStreamForActivity(selectedActivity);

          // Check if the request was aborted or component unmounted
          if (abortController.signal.aborted || !isMounted) {
            // Ensure loading indicator is cleared even if aborted/unmounted mid-flight
            setIsLoadingStream(false);
            return;
          }

          if (stream) {
            setHomeScreenStream({ stream: stream });
            simpleLogger.log(`Loaded stream for activity ${selectedActivity.id}`, {
              coordinatesCount: stream.coordinates?.length || 0
            });
          } else {
            setHomeScreenStream({ stream: undefined });
            simpleLogger.warn(`No stream found for activity ${selectedActivity.id}`);
          }
        } catch (error) {
          if (!abortController.signal.aborted && isMounted) {
            simpleLogger.error(`Error loading stream for activity ${selectedActivity.id}:`, error);
            setHomeScreenStream({ stream: undefined });
          }
        }
        setIsLoadingStream(false);
      }
    };

    void fetchData();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [selectedActivity]);

  // Stream cache counters for the "Streams" row. Counting is derived from the
  // records (getNoStreamIds), so the activity-set dependency refreshes exactly
  // when it matters — a backup Restore writing new stream files also changes
  // the set — and the 120 s tick covers completion between changes.
  useEffect(() => {
    let isMounted = true;

    const updateStreamStatus = async () => {
      try {
        const status = await countStreamsStatus(globalActivities);
        if (isMounted) setStreamStatus(status);
      } catch (error) {
        if (isMounted) simpleLogger.error('Error updating stream status:', error);
      }
    };

    void updateStreamStatus();
    const interval = setInterval(updateStreamStatus, 120 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [globalActivities]);

  // Handle screen focus to refresh map if needed
  useFocusEffect(
    React.useCallback(() => {
      // Force map refresh when returning to the screen
      if (homeScreenStream?.stream) {
        setMapRefreshKey(prev => prev + 1);
      }
    }, [homeScreenStream])
  );

  // Re-read the backup stamp whenever the screen gains focus as a fallback when
  // returning from another tab or drawer destination. Live syncs inside the Settings
  // modal update lastBackupSync immediately via ActivitiesSyncContext.
  useFocusEffect(
    useCallback(() => {
      void loadBackupFreshness();
    }, [loadBackupFreshness])
  );

  React.useLayoutEffect(() => {
    navigation?.setOptions({
      // prettier-ignore
      headerRight: () => ( // NOSONAR - render prop must close over backupFreshness
        <View style={{ marginRight: 10 }}>
          {/* The label itself carries the age ("Synced 3 weeks ago"); colour
              only lifts it out of the muted tier. theme.warning is not used
              because the palette test (theme.spec.ts) guarantees 4.5:1 for
              text/textMuted/primary/success only, not for the semantic
              warning colour. */}
          <Text
            numberOfLines={1}
            style={backupFreshness.stale ? styles.headerMetaStale : styles.headerMeta}
          >
            {backupFreshness.label}
          </Text>
        </View>
      )
    });
  }, [navigation, backupFreshness, styles]);

  return (
    <View style={{ flex: 1, paddingTop: 0, paddingBottom: insets.bottom }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={fetchingData}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Activity Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Data</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Stored Locally</Text>
              <View style={styles.infoValueContainer}>
                <Text style={styles.infoValue}>{totalActivitiesStored}</Text>
                <TouchableOpacity
                  onPress={() => {
                    navigation.navigate('Details', undefined);
                  }}
                  style={styles.actionButton}
                >
                  <Ionicons name="list" size={18} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Streams</Text>
              <View style={styles.infoValueContainer}>
                <Text style={[styles.infoValue, { color: theme.success }]}>
                  {streamStatus.downloadedStreams} /{' '}
                  {totalActivitiesStored > 0
                    ? totalActivitiesStored - streamStatus.missingStreams
                    : 0}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {/* End of Activity Information Section */}

        {/* Weekly Summary Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Week</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoValue}>
                {weeklySummary.totalHours > 0
                  ? seconds_to_label(weeklySummary.totalHours)
                  : 'No activity yet'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Distance</Text>
              <Text style={styles.infoValue}>{weeklySummary.totalDistanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Elevation</Text>
              <Text style={styles.infoValue}>{weeklySummary.totalElevationM.toFixed(0)} m</Text>
            </View>
          </View>
        </View>
        {/* End of Weekly Summary Section */}

        {/* Streaks Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Streaks</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Day Streak</Text>
              <Text
                style={styles.infoValue}
              >{`${dayStreak.current} current • ${dayStreak.best} best`}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Week Streak</Text>
              <Text
                style={styles.infoValue}
              >{`${weekStreak.current} current • ${weekStreak.best} best`}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Weekly Goal Streak</Text>
              <Text
                style={styles.infoValue}
              >{`${goalWeekStreak.current} current • ${goalWeekStreak.best} best`}</Text>
            </View>
          </View>
        </View>
        {/* End of Streaks Section */}

        {/* Calendar Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Calendar</Text>
            <TouchableOpacity
              onPress={() => openManualEntry(calendarDate)}
              accessibilityLabel={`Add activity on ${calendarDate}`}
              accessibilityRole="button"
              style={styles.actionButton}
            >
              <Ionicons name="add" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarContainer}>
            <ActivityCalendarPeriod
              activities={globalActivities}
              onDayPress={handleCalendarDayPress}
              onEmptyDayPress={handleCalendarEmptyDayPress}
              selectedDate={calendarDate}
              navigation={navigation}
            />
          </View>
        </View>
        {/* End of Calendar Section */}

        {/* Recent Activity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <LastActivitySummary
            activity={selectedActivity}
            stats={selectedActivityStats}
            allActivities={globalActivities}
            onActivityChange={handleActivityChange}
          />
        </View>
        {/* End of Recent Activity Section */}

        {/* Recent Achievements Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Achievements</Text>
            {achievementsStartDate ? (
              <Text style={styles.sectionSubtitle}>
                since{' '}
                {achievementsStartDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            ) : null}
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                Longest activity{' '}
                {achievementLabel(
                  recentAchievements.longestDistanceKm > 0
                    ? `${recentAchievements.longestDistanceKm.toFixed(1)} km`
                    : null,
                  recentAchievements.longestDistanceName
                )}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                Biggest climb{' '}
                {achievementLabel(
                  recentAchievements.biggestClimbM > 0
                    ? `${recentAchievements.biggestClimbM.toFixed(0)} m`
                    : null,
                  recentAchievements.biggestClimbName
                )}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                Longest week{' '}
                {achievementLabel(
                  recentAchievements.longestWeekKm > 0
                    ? `${recentAchievements.longestWeekKm.toFixed(1)} km`
                    : null
                )}
              </Text>
            </View>
          </View>
        </View>
        {/* End of Recent Achievements Section */}

        {/* Activity Map Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Map</Text>
          <View style={styles.mapContainer}>
            {isLoadingStream ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading map...</Text>
              </View>
            ) : null}
            {!isLoadingStream && homeScreenStream?.stream ? (
              <MiniMapComponent key={mapRefreshKey} stream={homeScreenStream.stream} />
            ) : null}
            {!isLoadingStream && !homeScreenStream?.stream ? (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>No map data available</Text>
              </View>
            ) : null}
          </View>
        </View>
        {/* End of Activity Map Section */}

        {/* Footer Section - Branding and Version */}
        <View style={styles.section}>
          <View style={styles.footerCard}>
            <View style={styles.footerContent}>
              <View style={styles.footerText}>
                <Text style={styles.appTitle}>Offline Fitness</Text>
                <Text style={styles.versionText}>
                  Version: {nativeApplicationVersion + '-' + nativeBuildVersion}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {/* End of Footer Section */}
      </ScrollView>
      <DayActivitiesSheet
        visible={daySheetDate !== null}
        date={daySheetDate ?? calendarDate}
        activities={daySheetActivities}
        onSelect={handleDaySheetSelect}
        onAdd={handleDaySheetAdd}
        onClose={() => setDaySheetDate(null)}
      />
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    headerMeta: {
      fontSize: 13,
      color: theme.textMuted
    },
    headerMetaStale: {
      // Same size, stronger colour: the label itself already says how old the
      // backup is, this only lifts it out of the muted tier.
      fontSize: 13,
      color: theme.textStrong
    },
    section: {
      marginBottom: 24
    },
    sectionHeader: {
      marginBottom: 12
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.primary
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 4,
      fontStyle: 'italic'
    },
    statusCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16,
      borderLeftWidth: 4,
      borderLeftColor: theme.success
    },
    errorCard: {
      borderLeftColor: theme.dangerPressed,
      backgroundColor: theme.dangerSoft
    },
    connectionText: {
      fontSize: 16,
      color: theme.text,
      fontWeight: '500'
    },
    infoCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    infoLabel: {
      fontSize: 16,
      color: theme.text,
      fontWeight: '500'
    },
    infoValueContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    infoValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text
    },
    actionButton: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.surfaceSunken
    },
    calendarContainer: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 8,
      overflow: 'hidden'
    },
    mapContainer: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 8,
      minHeight: 200
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200
    },
    loadingText: {
      fontSize: 16,
      color: theme.textMuted,
      fontStyle: 'italic'
    },
    noDataContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200
    },
    noDataText: {
      fontSize: 16,
      color: theme.textSubtle,
      fontStyle: 'italic'
    },
    footerCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16,
      marginTop: 8
    },
    footerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    },
    footerText: {
      alignItems: 'center'
    },
    appTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: 4
    },
    versionText: {
      fontSize: 12,
      color: theme.textMuted
    },
    errorContainer: {
      marginTop: 12,
      padding: 12,
      backgroundColor: theme.dangerSoft,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.dangerBorder
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.danger,
      marginBottom: 4
    },
    errorText: {
      fontSize: 13,
      color: theme.danger,
      marginBottom: 8,
      lineHeight: 18
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.surface,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.dangerBorder
    },
    retryText: {
      fontSize: 13,
      fontWeight: '500',
      marginLeft: 4
    }
  });
