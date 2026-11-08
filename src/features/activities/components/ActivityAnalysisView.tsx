import { getActivityStreams } from '@/features/activities/services/fetchAndStoreStreams';
import {
  computeHeartRateZoneDistribution,
  HeartRateZoneDistribution,
  HeartRateZonesCard,
  resolveMaxHeartRate
} from '@/features/heart-rate';
import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import { useUserProfile } from '@/features/profile';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
// Reverted: no gesture handler for chart zoom
import {
  Activity,
  activityUtcMs,
  compareActivitiesByUtcAsc,
  formatActivityLocalDateTime,
  calculatePaceMinPerKm,
  calculateSpeedKmh,
  calculateTrendLine,
  findSimilarActivities,
  formatActivityRate,
  formatPace,
  getDefaultIoUThreshold,
  isPaceSport,
  ActivityStream,
  getActivityIcon,
  LatLng,
  seconds_to_label,
  simpleLogger
} from '@/shared';
import { haversineDistance } from '@/features/maps/services/flyoverInterpolator';
import { exportData } from '@/shared/services/exportData';
import { findSimilarActivitiesByTrack } from '@/shared/services/trackComparison';
import { createChartTheme, useTheme } from '@/theme';
import { createStyles } from './ActivityAnalysisView.styles';
import { useLoadedStream } from '../hooks/useLoadedStream';
import { computeStreamSplits, StreamSplit } from '../services/computeStreamSplits';
import {
  LineSegment,
  VictoryAxis,
  VictoryChart,
  VictoryCursorContainer,
  VictoryLine,
  VictoryScatter,
  VictoryZoomContainer
} from 'victory-native';

/**
 * Formats a time value in hours to a string in the format "h:mm".
 * @param tick The time value in hours.
 * @returns The formatted time string.
 */
const formatTime = (tick: number) => {
  const hours = Math.floor(tick);
  const minutes = Math.floor((tick - hours) * 60);
  return `${hours}:${minutes}`;
};

/**
 * Component for displaying similar activities with icons and controls
 */
function SimilarActivitiesHeader({
  similarActivities,
  trackSimilarCount,
  trackReverseCount,
  trackSimilarityThreshold,
  onOpenSettings,
  onExport
}: Readonly<{
  similarActivities: Activity[];
  trackSimilarCount: number;
  trackReverseCount: number;
  trackSimilarityThreshold: number;
  onOpenSettings: () => void;
  onExport: () => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const filterPercentage = Math.round(trackSimilarityThreshold * 100);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}
    >
      <View style={styles.headerBadgeRow}>
        <View style={styles.headerBadgeArea}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={theme.textMuted} />
          <Text style={styles.headerBadgeText}>{`${similarActivities.length} area`}</Text>
        </View>
        <View style={styles.headerBadgeTrack}>
          <MaterialCommunityIcons name="routes" size={14} color={theme.success} />
          <Text style={styles.headerBadgeTrackText}>{`${trackSimilarCount} route`}</Text>
        </View>
        {trackReverseCount > 0 ? (
          <View style={styles.headerBadgeReverse}>
            <MaterialCommunityIcons name="swap-horizontal" size={15} color={theme.chartReverse} />
            <Text style={styles.headerBadgeReverseText}>{`${trackReverseCount} rev`}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={`Matching sensitivity filters, current threshold ${filterPercentage} percent`}
          style={styles.filterPill}
        >
          <MaterialCommunityIcons name="tune-variant" size={14} color={theme.primary} />
          <Text style={styles.filterPillText}>{`Filter (${filterPercentage}%)`}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onExport}
          accessibilityRole="button"
          accessibilityLabel="Export similar activities"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 4 }}
        >
          <MaterialCommunityIcons name="application-export" size={22} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Component for displaying the list of similar activities
 */
function SimilarActivitiesList({
  similarActivities,
  similarActivitiesByTrack,
  trackSimilarityThreshold,
  onActivityPress
}: Readonly<{
  similarActivities: Activity[];
  similarActivitiesByTrack: { activity: Activity; similarity: number; reversed: boolean }[];
  trackSimilarityThreshold: number;
  onActivityPress: (activity: Activity | null) => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Index track-similarity results by activity id once (O(n)) instead of an
  // O(n) .find() inside the render loop (O(n^2) for large similar sets).
  const trackSimilarityById = useMemo(() => {
    const map = new Map<string, { activity: Activity; similarity: number; reversed: boolean }>();
    similarActivitiesByTrack.forEach(entry => {
      map.set(entry.activity.id, entry);
    });
    return map;
  }, [similarActivitiesByTrack]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ width: '100%' }}
      contentContainerStyle={{ paddingHorizontal: 10 }}
    >
      {similarActivities.map(activity => {
        const similarByTrackInfo = trackSimilarityById.get(activity.id);
        const isSimilar =
          !!similarByTrackInfo && similarByTrackInfo.similarity >= trackSimilarityThreshold;
        const isReversed = isSimilar && similarByTrackInfo.reversed;
        const isSameDirection = isSimilar && !similarByTrackInfo.reversed;

        let cardStyle = null;
        if (isSameDirection) {
          cardStyle = styles.similarActivityItemTrackMatch;
        } else if (isReversed) {
          cardStyle = styles.similarActivityItemTrackReverseMatch;
        }

        return (
          <Pressable
            key={activity.id}
            onPressIn={() => onActivityPress(activity)}
            onPressOut={() => onActivityPress(null)}
          >
            <View style={[styles.similarActivityItem, cardStyle]}>
              <Text selectable style={styles.similarActivityItemTitle}>
                {activity.name}
              </Text>
              <Text selectable style={styles.similarActivityItemText}>
                Date: {formatActivityLocalDateTime(activity)}
              </Text>
              <Text selectable style={styles.similarActivityItemText}>
                Distance: {(activity.distance / 1000).toFixed(1)} km
              </Text>
              {similarByTrackInfo ? (
                <Text selectable style={styles.similarActivityItemText}>
                  Similarity: {similarByTrackInfo.similarity.toFixed(2)}
                  {isReversed ? ' (⇄ reverse)' : ''}
                </Text>
              ) : null}
              <Text selectable style={styles.similarActivityItemText}>
                {isPaceSport(activity.type) ? 'Average Pace' : 'Average Speed'}:{' '}
                {formatActivityRate(
                  activity.distance,
                  activity.moving_time || activity.elapsed_time,
                  activity.type
                )}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Component for displaying the speed trend chart
 */
function SpeedTrendChart({
  item,
  similarActivities,
  similarActivitiesByTrack,
  trackSimilarityThreshold,
  trackTrendLineData,
  mapWidth
}: Readonly<{
  item: Activity;
  similarActivities: Activity[];
  similarActivitiesByTrack: { activity: Activity; similarity: number; reversed: boolean }[];
  trackSimilarityThreshold: number;
  trackTrendLineData: { x: Date; y: number }[];
  mapWidth: number;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  const paceSport = isPaceSport(item.type);

  // Scatter data is a sort+map over activities; memoize so VictoryScatter keeps
  // a stable data reference (the compiler can't see through the chained calls).
  const scatterData = useMemo(
    () =>
      [item, ...similarActivities]
        .sort(compareActivitiesByUtcAsc)
        .map(a => ({
          x: new Date(activityUtcMs(a)),
          y: paceSport
            ? calculatePaceMinPerKm(a.distance, a.moving_time || a.elapsed_time)
            : calculateSpeedKmh(a.distance, a.moving_time || a.elapsed_time),
          activity: a
        }))
        .filter(point => point.y > 0),
    [item, similarActivities, paceSport]
  );

  // Precompute qualifying track classifications so the per-point fill check is O(1)
  const { qualifyingTrackIds, qualifyingReverseTrackIds } = useMemo(() => {
    const sameDir = new Set<string>();
    const revDir = new Set<string>();
    for (const entry of similarActivitiesByTrack) {
      if (entry.similarity >= trackSimilarityThreshold) {
        if (entry.reversed) {
          revDir.add(entry.activity.id);
        } else {
          sameDir.add(entry.activity.id);
        }
      }
    }
    return { qualifyingTrackIds: sameDir, qualifyingReverseTrackIds: revDir };
  }, [similarActivitiesByTrack, trackSimilarityThreshold]);

  if (similarActivities.length === 0) return <></>;

  return (
    <VictoryChart
      theme={chartTheme}
      width={mapWidth}
      minDomain={paceSport ? undefined : { y: 0 }}
      containerComponent={<VictoryZoomContainer zoomDimension="x" allowZoom allowPan />}
    >
      <VictoryAxis
        label="Date"
        tickFormat={x => new Date(x).toLocaleDateString()}
        style={{
          axisLabel: { padding: 30 },
          tickLabels: { angle: -45, textAnchor: 'end' }
        }}
      />
      <VictoryAxis
        dependentAxis
        label={paceSport ? 'Avg Pace (min/km)' : 'Avg Speed (km/h)'}
        tickFormat={paceSport ? (y: number) => formatPace(y) : undefined}
        style={{
          axisLabel: { padding: 40 }
        }}
      />
      <VictoryScatter
        data={scatterData}
        style={{
          data: {
            fill: ({ datum }) => {
              if (datum.activity.id === item.id) {
                return theme.danger;
              }
              if (qualifyingTrackIds.has(datum.activity.id)) {
                return theme.success;
              }
              if (qualifyingReverseTrackIds.has(datum.activity.id)) {
                return theme.chartReverse;
              }
              return theme.info;
            }
          }
        }}
      />
      {trackTrendLineData.length > 0 ? (
        <VictoryLine
          data={trackTrendLineData}
          style={{
            data: { stroke: theme.success, strokeWidth: 2, strokeDasharray: '2' }
          }}
        />
      ) : null}
    </VictoryChart>
  );
}

/**
 * Component for displaying altitude chart
 */
function AltitudeChart({
  altitudeDataXY,
  mapWidth,
  hasDistanceAxis = false,
  scrubX,
  onScrubChange
}: Readonly<{
  altitudeDataXY: { x: number; y: number }[] | undefined;
  mapWidth: number;
  hasDistanceAxis?: boolean;
  scrubX?: number | null;
  onScrubChange?: (x: number | null) => void;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (!altitudeDataXY || altitudeDataXY.length === 0) {
    return <Text style={{ color: theme.textMuted, padding: 10 }}>No altitude data available</Text>;
  }

  const xAxisLabel = hasDistanceAxis ? 'Distance (km)' : 'Time (h:min)';
  const tickFormatter = hasDistanceAxis ? (d: number) => d.toFixed(1) : formatTime;

  const containerComponent = onScrubChange ? (
    <VictoryCursorContainer
      cursorDimension="x"
      defaultCursorValue={scrubX ?? undefined}
      cursorComponent={
        <LineSegment
          style={{
            stroke: theme.primary,
            strokeWidth: 2,
            strokeDasharray: '4, 4'
          }}
        />
      }
      onCursorChange={value => {
        if (typeof value === 'number') {
          onScrubChange(value);
        } else if (
          value &&
          typeof value === 'object' &&
          'x' in value &&
          typeof (value as { x: unknown }).x === 'number'
        ) {
          onScrubChange((value as { x: number }).x);
        } else {
          onScrubChange(null);
        }
      }}
    />
  ) : undefined;

  return (
    <VictoryChart theme={chartTheme} width={mapWidth} containerComponent={containerComponent}>
      <VictoryAxis
        label={xAxisLabel}
        tickFormat={tickFormatter}
        style={{
          axisLabel: { padding: 30 }
        }}
      />
      <VictoryAxis
        dependentAxis
        label="Altitude (m)"
        style={{
          axisLabel: { padding: 40 }
        }}
      />
      <VictoryLine
        data={altitudeDataXY}
        style={{
          data: { stroke: theme.danger }
        }}
      />
    </VictoryChart>
  );
}

/**
 * Maps the heart-rate series onto hours-since-start.
 *
 * The series is aligned with `time` and carries `null` for points without a
 * reading, so gaps are skipped instead of being drawn as 0 bpm (which would
 * collapse the chart's y-domain).
 */
function buildHeartRateXY(
  heartRateData: (number | null)[],
  timeData: number[]
): { x: number; y: number }[] {
  const hasTime = Array.isArray(timeData) && timeData.length > 0;
  const pointCount = heartRateData.length;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < pointCount; i++) {
    const bpm = heartRateData[i];
    if (bpm === null) {
      continue;
    }
    // Fall back to the sample index when no time series is available, so
    // heart-rate-only activities still get a chart.
    const x = hasTime && timeData[i] !== undefined ? timeData[i] / 3600 : i;
    points.push({ x, y: bpm });
  }
  return points;
}

/**
 * Component for displaying heart-rate chart
 */
function HeartRateChart({
  heartRateDataXY,
  mapWidth,
  hasTimeAxis = true
}: Readonly<{
  heartRateDataXY: { x: number; y: number }[];
  mapWidth: number;
  hasTimeAxis?: boolean;
}>): JSX.Element | null {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (!heartRateDataXY || heartRateDataXY.length === 0) {
    return null;
  }

  return (
    <VictoryChart theme={chartTheme} width={mapWidth}>
      <VictoryAxis
        label={hasTimeAxis ? 'Time (h:min)' : 'Sample'}
        tickFormat={hasTimeAxis ? formatTime : (t: number) => String(Math.round(t))}
        style={{
          axisLabel: { padding: 30 }
        }}
      />
      <VictoryAxis
        dependentAxis
        label="Heart rate (bpm)"
        style={{
          axisLabel: { padding: 40 }
        }}
      />
      <VictoryLine
        data={heartRateDataXY}
        style={{
          data: { stroke: theme.danger }
        }}
      />
    </VictoryChart>
  );
}

/**
 * Component for displaying elevation gain chart
 */
function ElevationGainChart({
  elevationGain,
  mapWidth,
  hasDistanceAxis = false
}: Readonly<{
  elevationGain: { x: number; y: number }[] | undefined;
  mapWidth: number;
  hasDistanceAxis?: boolean;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (!elevationGain || elevationGain.length === 0) {
    return (
      <Text style={{ color: theme.textMuted, padding: 10 }}>No elevation gain data available</Text>
    );
  }

  const xAxisLabel = hasDistanceAxis ? 'Distance (km)' : 'Time (h:min)';
  const tickFormatter = hasDistanceAxis ? (d: number) => d.toFixed(1) : formatTime;

  return (
    <VictoryChart theme={chartTheme} width={mapWidth}>
      <VictoryAxis
        label={xAxisLabel}
        tickFormat={tickFormatter}
        style={{
          axisLabel: { padding: 30 }
        }}
      />
      <VictoryAxis
        dependentAxis
        label="Gain (m)"
        style={{
          axisLabel: { padding: 40 }
        }}
      />
      <VictoryLine
        data={elevationGain}
        style={{
          data: { stroke: theme.info }
        }}
      />
    </VictoryChart>
  );
}

type AnalysisTab = 'overview' | 'charts' | 'routes';

interface AnalysisTabBarProps {
  activeTab: AnalysisTab;
  onSelectTab: (tab: AnalysisTab) => void;
  similarCount: number;
}

function AnalysisTabBar({
  activeTab,
  onSelectTab,
  similarCount
}: Readonly<AnalysisTabBarProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const tabs: { key: AnalysisTab; label: string }[] = [
    { key: 'routes', label: similarCount > 0 ? `Matches (${similarCount})` : 'Matches' },
    { key: 'overview', label: 'Overview' },
    { key: 'charts', label: 'Telemetry' }
  ];

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarTrack}>
        {tabs.map(tab => {
          const isActive = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} section`}
              style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
              onPress={() => {
                if (!isActive) {
                  void Haptics.selectionAsync().catch(() => undefined);
                  onSelectTab(tab.key);
                }
              }}
            >
              <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Binary searches the closest data point in a monotonic or semi-monotonic series.
 */
function findNearestProfileIndex(series: { x: number; y: number }[], targetX: number): number {
  if (series.length === 0) return -1;
  let low = 0;
  let high = series.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midX = series[mid].x;
    if (midX < targetX) {
      low = mid + 1;
    } else if (midX > targetX) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  const clampLow = Math.max(0, Math.min(series.length - 1, low));
  const clampHigh = Math.max(0, Math.min(series.length - 1, high));
  const distLow = Math.abs(series[clampLow].x - targetX);
  const distHigh = Math.abs(series[clampHigh].x - targetX);
  return distLow < distHigh ? clampLow : clampHigh;
}

/**
 * Calculates cumulative X values for profile charts: cumulative km if coordinates are valid,
 * otherwise elapsed time in hours.
 */
function buildProfileXValues(
  n: number,
  coordinates?: LatLng[],
  timeData?: number[]
): { xValues: number[]; hasDistanceAxis: boolean } {
  const canUseDistance = Array.isArray(coordinates) && coordinates.length === n && n > 1;
  const xValues: number[] = new Array(n);

  if (canUseDistance) {
    let cumMeters = 0;
    xValues[0] = 0;
    for (let i = 1; i < n; i++) {
      cumMeters += haversineDistance(coordinates[i - 1], coordinates[i]);
      xValues[i] = cumMeters / 1000;
    }
  } else {
    for (let i = 0; i < n; i++) {
      xValues[i] = (timeData?.[i] ?? i) / 3600;
    }
  }

  return { xValues, hasDistanceAxis: canUseDistance };
}

/**
 * Calculates cumulative elevation gain series using deadband hysteresis.
 */
function buildElevationGainSeries(
  altitudeData: number[],
  xValues: number[],
  totalGain: number
): { x: number; y: number }[] {
  const n = altitudeData.length;
  const elGain: { x: number; y: number }[] = [];

  if (totalGain === 0) {
    for (let i = 0; i < n; i++) {
      elGain.push({ x: xValues[i], y: 0 });
    }
    return elGain;
  }

  let sumGain = 0;
  const HYSTERESIS_THRESHOLD = 1.5;
  let anchor: number | null = null;

  for (let i = 0; i < n; i++) {
    const y = altitudeData[i];
    if (i === 0) {
      anchor = y;
      elGain.push({ x: xValues[i], y: 0 });
    } else if (anchor !== null) {
      const delta = y - anchor;
      if (delta >= HYSTERESIS_THRESHOLD) {
        sumGain += delta;
        anchor = y;
      } else if (delta <= -HYSTERESIS_THRESHOLD) {
        anchor = y;
      }
      elGain.push({ x: xValues[i], y: Math.round(sumGain * 10) / 10 });
    }
  }

  return elGain;
}

/**
 * Hero summary card displaying primary metrics (Distance, Time, Pace/Speed, Elevation).
 */
function ActivityHeroSummary({ item }: Readonly<{ item: Activity }>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const distanceKm = (item.distance / 1000).toFixed(2);
  const durationSec = item.moving_time || item.elapsed_time || 0;
  const durationLabel = seconds_to_label(durationSec);
  const paceSport = isPaceSport(item.type);
  const paceOrSpeedLabel = paceSport ? 'Avg Pace' : 'Avg Speed';
  const paceOrSpeedValue = formatActivityRate(item.distance, durationSec, item.type);

  const elevationGain = Math.round(item.total_elevation_gain || 0);

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroHeader}>
        <View style={styles.heroIconContainer}>
          <Text style={styles.heroIcon}>{getActivityIcon(item.type)}</Text>
        </View>
        <View style={styles.heroHeaderText}>
          <Text selectable style={styles.heroTitle} numberOfLines={1}>
            {item.name || item.type}
          </Text>
          <Text selectable style={styles.heroSubtitle}>
            {formatActivityLocalDateTime(item)}
          </Text>
        </View>
      </View>
      <View style={styles.heroGrid}>
        <View style={styles.heroMetricItem}>
          <Text selectable style={styles.heroMetricValue}>
            {distanceKm} km
          </Text>
          <Text style={styles.heroMetricLabel}>Distance</Text>
        </View>
        <View style={styles.heroMetricItem}>
          <Text selectable style={styles.heroMetricValue}>
            {durationLabel}
          </Text>
          <Text style={styles.heroMetricLabel}>Moving Time</Text>
        </View>
        <View style={styles.heroMetricItem}>
          <Text selectable style={styles.heroMetricValue}>
            {paceOrSpeedValue}
          </Text>
          <Text style={styles.heroMetricLabel}>{paceOrSpeedLabel}</Text>
        </View>
        <View style={styles.heroMetricItem}>
          <Text selectable style={styles.heroMetricValue}>
            +{elevationGain} m
          </Text>
          <Text style={styles.heroMetricLabel}>Elevation Gain</Text>
        </View>
      </View>
    </View>
  );
}

const CLEAN_PRESENTED_KEYS = new Set([
  'name',
  'type',
  'distance',
  'moving_time',
  'elapsed_time',
  'total_elevation_gain',
  'elev_high',
  'elev_low',
  'average_speed',
  'average_heartrate',
  'max_heartrate',
  'timezone',
  'start_date_local',
  'local_date',
  'local_time'
]);

function RawMetadataSection({
  rawEntries
}: Readonly<{
  rawEntries: [string, unknown][];
}>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showRaw, setShowRaw] = useState(false);

  if (rawEntries.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.rawToggleBtn}
        onPress={() => setShowRaw(!showRaw)}
        accessibilityRole="button"
        accessibilityLabel="Toggle raw activity properties"
      >
        <Text style={styles.rawToggleText}>
          {showRaw ? 'Hide Raw Metadata' : 'Show Raw Metadata'}
        </Text>
        <MaterialCommunityIcons
          name={showRaw ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.primary}
        />
      </TouchableOpacity>

      {showRaw ? (
        <View style={styles.rawContainer}>
          {rawEntries.map(([key, value]) => {
            const valueString =
              typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
            return (
              <View key={key} style={styles.detailRow}>
                <Text selectable style={styles.detailLabel}>
                  {key}
                </Text>
                <Text selectable style={styles.detailValue}>
                  {valueString}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

/**
 * Clean, structured display of activity properties with collapsible raw metadata.
 */
function ActivityDetails({ item }: Readonly<{ item: Activity }>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const activeTimeSec = item.moving_time || item.elapsed_time;
  const avgSpeedKmh = calculateSpeedKmh(item.distance, activeTimeSec).toFixed(1);
  const rawEntries = Object.entries(item).filter(([k]) => !CLEAN_PRESENTED_KEYS.has(k));
  const hasMinMaxElev = item.elev_high !== undefined || item.elev_low !== undefined;

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Activity Summary</Text>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Sport Type</Text>
        <Text selectable style={styles.detailValue}>
          {item.type}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Elapsed Time</Text>
        <Text selectable style={styles.detailValue}>
          {seconds_to_label(item.elapsed_time || 0)}
        </Text>
      </View>

      {isPaceSport(item.type) && item.distance > 0 ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Average Pace</Text>
          <Text selectable style={styles.detailValue}>
            {formatActivityRate(item.distance, activeTimeSec, item.type)}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Average Speed</Text>
        <Text selectable style={styles.detailValue}>
          {avgSpeedKmh} km/h
        </Text>
      </View>

      {hasMinMaxElev ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Elevation (Min / Max)</Text>
          <Text selectable style={styles.detailValue}>
            {Math.round(item.elev_low || 0)} m / {Math.round(item.elev_high || 0)} m
          </Text>
        </View>
      ) : null}

      {item.average_heartrate ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Average Heart Rate</Text>
          <Text selectable style={styles.detailValue}>
            {Math.round(item.average_heartrate)} bpm
          </Text>
        </View>
      ) : null}

      {item.max_heartrate ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Max Heart Rate</Text>
          <Text selectable style={styles.detailValue}>
            {Math.round(item.max_heartrate)} bpm
          </Text>
        </View>
      ) : null}

      {item.timezone ? (
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Timezone</Text>
          <Text selectable style={styles.detailValue} numberOfLines={1}>
            {item.timezone}
          </Text>
        </View>
      ) : null}

      <RawMetadataSection rawEntries={rawEntries} />
    </View>
  );
}

interface MatchSettingsModalProps {
  isVisible: boolean;
  activity: Activity;
  similarActivitiesCount: number;
  trackSimilarCount: number;
  trackReverseCount: number;
  iouThreshold: number;
  trackSimilarityThreshold: number;
  onClose: () => void;
  onTrackSimilarityChange: (value: number) => void;
  onIoUChange: (value: number) => void;
  onResetDefaults: () => void;
}

/**
 * Unified modal sheet for tuning route similarity and area tolerance.
 */
function MatchSettingsModal({
  isVisible,
  activity,
  similarActivitiesCount,
  trackSimilarCount,
  trackReverseCount,
  iouThreshold,
  trackSimilarityThreshold,
  onClose,
  onTrackSimilarityChange,
  onIoUChange,
  onResetDefaults
}: Readonly<MatchSettingsModalProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [displayTrack, setDisplayTrack] = useState(trackSimilarityThreshold);
  const [displayIoU, setDisplayIoU] = useState(iouThreshold);

  useEffect(() => {
    if (isVisible) {
      setDisplayTrack(trackSimilarityThreshold);
      setDisplayIoU(iouThreshold);
    }
  }, [isVisible, trackSimilarityThreshold, iouThreshold]);

  const defaultIoU = useMemo(() => getDefaultIoUThreshold(activity), [activity]);
  const reverseSuffix = trackReverseCount > 0 ? ` (⇄ ${trackReverseCount})` : '';

  return (
    <Modal transparent animationType="slide" visible={isVisible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {/* Header */}
          <View style={styles.modalRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.textStrong }}>
                Matching Sensitivity
              </Text>
              <Text style={styles.modalSubtitle}>
                Tune how strictly matching routes are detected
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={styles.headerBadgeArea}>
                <Text style={styles.headerBadgeText}>{`${similarActivitiesCount} in area`}</Text>
              </View>
              <View style={styles.headerBadgeTrack}>
                <Text style={styles.headerBadgeTrackText}>
                  {`${trackSimilarCount} matched${reverseSuffix}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Slider 1: Route Similarity (Primary) */}
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <View>
                <Text style={styles.modalSectionTitle}>Route Match</Text>
                <Text style={styles.modalSectionCaption}>
                  How closely the GPS path must overlap this route
                </Text>
              </View>
              <Text style={styles.modalValueBadge}>{`${Math.round(displayTrack * 100)}%`}</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={displayTrack}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.surfaceMuted}
              thumbTintColor={theme.primaryPressed}
              onValueChange={setDisplayTrack}
              onSlidingComplete={onTrackSimilarityChange}
              accessibilityLabel="Route similarity threshold slider"
            />
            <View style={styles.modalScaleLegend}>
              <Text style={styles.modalScaleLabel}>Loose (0%)</Text>
              <Text style={styles.modalScaleLabel}>Recommended (70%)</Text>
              <Text style={styles.modalScaleLabel}>Exact (100%)</Text>
            </View>
          </View>

          <View style={styles.modalDivider} />

          {/* Slider 2: Geographic Area Tolerance */}
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <View>
                <Text style={styles.modalSectionTitle}>Area Tolerance</Text>
                <Text style={styles.modalSectionCaption}>Coarse location bounding-box overlap</Text>
              </View>
              <Text style={styles.modalValueBadge}>{`${Math.round(displayIoU * 100)}%`}</Text>
            </View>
            <Slider
              minimumValue={0.05}
              maximumValue={0.95}
              step={0.05}
              value={displayIoU}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.surfaceMuted}
              thumbTintColor={theme.primaryPressed}
              onValueChange={setDisplayIoU}
              onSlidingComplete={onIoUChange}
              accessibilityLabel="Area tolerance threshold slider"
            />
            <View style={styles.modalScaleLegend}>
              <Text style={styles.modalScaleLabel}>5% (Swims / Loops)</Text>
              <Text
                style={styles.modalScaleLabel}
              >{`Default (${Math.round(defaultIoU * 100)}%)`}</Text>
              <Text style={styles.modalScaleLabel}>95% (Strict)</Text>
            </View>
          </View>

          {/* Footer actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={() => {
                onResetDefaults();
                setDisplayTrack(0.7);
                setDisplayIoU(defaultIoU);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reset sensitivity thresholds to defaults"
            >
              <Text style={styles.modalResetText}>Reset to Defaults</Text>
            </TouchableOpacity>
            <Button title="Done" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface TelemetryChartsProps {
  altitudeDataXY: { x: number; y: number }[] | undefined;
  elevationGain: { x: number; y: number }[] | undefined;
  heartRateDataXY: { x: number; y: number }[] | undefined;
  heartRateSummary: { avg: number; max: number } | null;
  hrZoneDistribution: HeartRateZoneDistribution | null;
  hasDistanceAxis: boolean;
  hasTimeAxis: boolean;
  mapWidth: number;
  scrubX?: number | null;
  scrubDetails?: { x: number; altitude: number } | null;
  onScrubChange?: (x: number | null) => void;
}

function TelemetryChartsSection({
  altitudeDataXY,
  elevationGain,
  heartRateDataXY,
  heartRateSummary,
  hrZoneDistribution,
  hasDistanceAxis,
  hasTimeAxis,
  mapWidth,
  scrubX,
  scrubDetails,
  onScrubChange
}: Readonly<TelemetryChartsProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <View style={styles.chartSectionCard}>
        <View style={styles.chartHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chartSectionTitle}>Altitude Profile</Text>
            <Text style={styles.chartSectionSubtitle}>
              {hasDistanceAxis ? 'Drag or tap to inspect location on map' : 'Elevation along time'}
            </Text>
          </View>
          {scrubDetails ? (
            <View style={styles.scrubPill}>
              <Text style={styles.scrubPillText}>
                {hasDistanceAxis
                  ? `${scrubDetails.x.toFixed(2)} km • ${scrubDetails.altitude} m`
                  : `${formatTime(scrubDetails.x)} • ${scrubDetails.altitude} m`}
              </Text>
              <TouchableOpacity
                onPress={() => onScrubChange?.(null)}
                accessibilityRole="button"
                accessibilityLabel="Clear scrub cursor"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <AltitudeChart
          altitudeDataXY={altitudeDataXY}
          mapWidth={mapWidth}
          hasDistanceAxis={hasDistanceAxis}
          scrubX={scrubX}
          onScrubChange={onScrubChange}
        />
      </View>

      <View style={styles.chartSectionCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartSectionTitle}>Cumulative Elevation Gain</Text>
          <Text style={styles.chartSectionSubtitle}>
            Filtered gain with 1.5m deadband hysteresis
          </Text>
        </View>
        <ElevationGainChart
          elevationGain={elevationGain}
          mapWidth={mapWidth}
          hasDistanceAxis={hasDistanceAxis}
        />
      </View>

      {heartRateDataXY && heartRateDataXY.length > 0 ? (
        <View style={styles.chartSectionCard}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.chartSectionTitle}>Heart Rate</Text>
            {heartRateSummary ? (
              <Text style={styles.chartSectionSubtitle}>
                Avg: {heartRateSummary.avg} bpm • Max: {heartRateSummary.max} bpm
              </Text>
            ) : null}
          </View>
          <HeartRateChart
            heartRateDataXY={heartRateDataXY}
            mapWidth={mapWidth}
            hasTimeAxis={hasTimeAxis}
          />
          {hrZoneDistribution ? (
            <HeartRateZonesCard distribution={hrZoneDistribution} embedded />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

interface RouteMatchesSectionProps {
  item: Activity;
  similarActivities: Activity[];
  similarActivitiesByTrack: { activity: Activity; similarity: number; reversed: boolean }[];
  trackSimilarCount: number;
  trackReverseCount: number;
  trackSimilarityThreshold: number;
  exportProgress: number;
  trackTrendLineData: { x: Date; y: number }[];
  mapWidth: number;
  onOpenSettings: () => void;
  onExport: () => void;
  onActivityPress: (activity: Activity | null) => void;
}

function extractSplitRate(split: StreamSplit, paceSport: boolean): number {
  if (paceSport) {
    return split.paceMinPerKm > 0 ? 1 / split.paceMinPerKm : 0;
  }
  return split.speedKmh;
}

function computeSplitBarWidthPercent(
  split: StreamSplit,
  splits: readonly StreamSplit[],
  paceSport: boolean
): number {
  const rates = splits.map(s => extractSplitRate(s, paceSport)).filter(r => r > 0);
  if (rates.length === 0) return 50;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const currentRate = extractSplitRate(split, paceSport);
  if (maxRate <= minRate) return 85;
  const normalized = (currentRate - minRate) / (maxRate - minRate);
  return Math.round(38 + normalized * 62);
}

function formatSplitElevation(delta: number | null): string {
  if (delta === null) return '—';
  if (delta > 0) return `+${delta} m`;
  return `${delta} m`;
}

function SplitsSection({
  splits,
  activityType
}: Readonly<{
  splits: readonly StreamSplit[];
  activityType: string;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const paceSport = isPaceSport(activityType);
  const hasElevation = splits.some(s => s.elevationDeltaM !== null);
  const hasHeartRate = splits.some(s => s.avgHeartRateBpm !== null);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Splits (1 km)</Text>
      <View style={styles.splitsHeaderRow}>
        <Text style={[styles.splitsHeaderCell, { width: 44 }]}>Km</Text>
        <Text style={[styles.splitsHeaderCell, { flex: 1 }]}>
          {paceSport ? 'Pace (/km)' : 'Speed (km/h)'}
        </Text>
        {hasElevation ? (
          <Text style={[styles.splitsHeaderCell, { width: 56, textAlign: 'right' }]}>Elev</Text>
        ) : null}
        {hasHeartRate ? (
          <Text style={[styles.splitsHeaderCell, { width: 56, textAlign: 'right' }]}>HR</Text>
        ) : null}
      </View>
      {splits.map((split, idx) => {
        const isLast = idx === splits.length - 1;
        const kmLabel = split.isPartial
          ? `${(split.distanceMeters / 1000).toFixed(1)}`
          : `${split.splitNumber}`;
        const rateLabel = paceSport
          ? formatPace(split.paceMinPerKm)
          : `${split.speedKmh.toFixed(1)}`;
        const widthPct = computeSplitBarWidthPercent(split, splits, paceSport);

        return (
          <View
            key={split.splitNumber}
            style={[styles.splitRow, isLast ? styles.splitRowLast : null]}
          >
            <Text selectable style={styles.splitKmCell}>
              {kmLabel}
            </Text>
            <View style={styles.splitPaceBarTrack}>
              <View
                style={[
                  styles.splitPaceBarFill,
                  split.isFastest ? styles.splitPaceBarFillFastest : null,
                  { width: `${widthPct}%` }
                ]}
              />
              <View style={styles.splitPaceTextRow}>
                <Text selectable style={styles.splitPaceText}>
                  {rateLabel}
                </Text>
                {split.isFastest ? <Text style={styles.splitFastestBadge}>Fastest</Text> : null}
              </View>
            </View>
            {hasElevation ? (
              <Text selectable style={styles.splitMetaCell}>
                {formatSplitElevation(split.elevationDeltaM)}
              </Text>
            ) : null}
            {hasHeartRate ? (
              <Text selectable style={styles.splitMetaCell}>
                {split.avgHeartRateBpm !== null ? `${split.avgHeartRateBpm}` : '—'}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

interface OverviewSectionProps {
  item: Activity;
  splits: readonly StreamSplit[];
  hrZoneDistribution: HeartRateZoneDistribution | null;
  altitudeDataXY: { x: number; y: number }[] | undefined;
  mapWidth: number;
  hasDistanceAxis: boolean;
  scrubX: number | null;
  scrubDetails: { x: number; altitude: number } | null;
  onScrubChange: (x: number | null) => void;
}

function OverviewSection({
  item,
  splits,
  hrZoneDistribution,
  altitudeDataXY,
  mapWidth,
  hasDistanceAxis,
  scrubX,
  scrubDetails,
  onScrubChange
}: Readonly<OverviewSectionProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <ActivityDetails item={item} />
      {splits.length > 0 ? <SplitsSection splits={splits} activityType={item.type} /> : null}
      {hrZoneDistribution ? <HeartRateZonesCard distribution={hrZoneDistribution} /> : null}
      {altitudeDataXY && altitudeDataXY.length > 0 ? (
        <View style={styles.chartSectionCard}>
          <View style={styles.chartHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chartSectionTitle}>Altitude Profile</Text>
              <Text style={styles.chartSectionSubtitle}>
                {hasDistanceAxis ? 'Elevation over distance' : 'Elevation over time'}
              </Text>
            </View>
            {scrubDetails ? (
              <View style={styles.scrubPill}>
                <Text style={styles.scrubPillText}>
                  {hasDistanceAxis
                    ? `${scrubDetails.x.toFixed(2)} km • ${scrubDetails.altitude} m`
                    : `${formatTime(scrubDetails.x)} • ${scrubDetails.altitude} m`}
                </Text>
                <TouchableOpacity
                  onPress={() => onScrubChange(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Clear scrub cursor"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <AltitudeChart
            altitudeDataXY={altitudeDataXY}
            mapWidth={mapWidth}
            hasDistanceAxis={hasDistanceAxis}
            scrubX={scrubX}
            onScrubChange={onScrubChange}
          />
        </View>
      ) : null}
    </>
  );
}

function RouteMatchesSection({
  item,
  similarActivities,
  similarActivitiesByTrack,
  trackSimilarCount,
  trackReverseCount,
  trackSimilarityThreshold,
  exportProgress,
  trackTrendLineData,
  mapWidth,
  onOpenSettings,
  onExport,
  onActivityPress
}: Readonly<RouteMatchesSectionProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.similarActivitiesContainer}>
      <SimilarActivitiesHeader
        similarActivities={similarActivities}
        trackSimilarCount={trackSimilarCount}
        trackReverseCount={trackReverseCount}
        trackSimilarityThreshold={trackSimilarityThreshold}
        onOpenSettings={onOpenSettings}
        onExport={onExport}
      />
      {exportProgress > 0 && exportProgress < 1 ? (
        <Text style={{ color: theme.textMuted, marginVertical: 4 }}>
          Exporting... {Math.round(exportProgress * 100)}%
        </Text>
      ) : null}
      <SimilarActivitiesList
        similarActivities={similarActivities}
        similarActivitiesByTrack={similarActivitiesByTrack}
        trackSimilarityThreshold={trackSimilarityThreshold}
        onActivityPress={onActivityPress}
      />
      <SpeedTrendChart
        item={item}
        similarActivities={similarActivities}
        similarActivitiesByTrack={similarActivitiesByTrack}
        trackSimilarityThreshold={trackSimilarityThreshold}
        trackTrendLineData={trackTrendLineData}
        mapWidth={mapWidth}
      />
    </View>
  );
}

/**
 * A comprehensive component for displaying activity analysis including map, similar activities, charts, and detailed information.
 * @param item The activity to display.
 * @param allActivities An array of all activities.
 * @returns A React component.
 */
export function ActivityAnalysisView({
  item,
  allActivities
}: Readonly<{
  item: Activity;
  allActivities: Activity[];
}>): JSX.Element {
  const [trackSimilarityThreshold, setTrackSimilarityThreshold] = useState<number>(0.7);
  const [iouThreshold, setIouThreshold] = useState<number>(() => getDefaultIoUThreshold(item));
  const [activeTab, setActiveTab] = useState<AnalysisTab>('routes');
  const [scrubX, setScrubX] = useState<number | null>(null);
  const [isMatchSettingsVisible, setIsMatchSettingsVisible] = useState<boolean>(false);
  const [mapWidth, setMapWidth] = useState<number>(0);
  const { loadedStream } = useLoadedStream(item);
  const [overlayStream, setOverlayStream] = useState<ActivityStream | undefined>();
  const [similarActivities, setSimilarActivities] = useState<Activity[]>([]);
  const [similarActivitiesByTrack, setSimilarActivitiesByTrack] = useState<
    { activity: Activity; similarity: number; reversed: boolean }[]
  >([]);
  const [trackTrendLineData, setTrackTrendLineData] = useState<{ x: Date; y: number }[]>([]);
  const [exportProgress, setExportProgress] = useState(0);
  const userProfile = useUserProfile();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const trackSimilarCount = similarActivitiesByTrack.filter(
    a => a.similarity >= trackSimilarityThreshold && !a.reversed
  ).length;
  const trackReverseCount = similarActivitiesByTrack.filter(
    a => a.similarity >= trackSimilarityThreshold && a.reversed
  ).length;

  // Reset scrub position when activity or active tab changes
  useEffect(() => {
    setScrubX(null);
  }, [item.id, activeTab]);

  // Sync default IoU threshold when activity changes
  useEffect(() => {
    setIouThreshold(getDefaultIoUThreshold(item));
  }, [item]);

  // Heavy effect: re-runs only when item, activities, or IoU threshold changes.
  // trackSimilarityThreshold intentionally excluded — it only filters the
  // already-computed byTrack results, so changing it should not re-trigger
  // findSimilarActivitiesByTrack (async file I/O against all similar activities).
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const similar = findSimilarActivities(item, allActivities, iouThreshold);
    setSimilarActivities(similar);
    if (similar.length > 0) {
      findSimilarActivitiesByTrack(item, similar)
        .then(byTrack => {
          if (!cancelled) setSimilarActivitiesByTrack(byTrack);
        })
        .catch(error => {
          if (!cancelled) {
            simpleLogger.error('Error finding similar activities by track:', error);
            setSimilarActivitiesByTrack([]);
          }
        });
    } else {
      setSimilarActivitiesByTrack([]);
    }
    return () => {
      cancelled = true;
    };
  }, [item, allActivities, iouThreshold]);

  // Cheap effect: recalculates track trendline when the threshold or the raw
  // byTrack results change. Separated so threshold changes don't re-trigger
  // the expensive findSimilarActivitiesByTrack above.
  useEffect(() => {
    const trackSimilarActivities = similarActivitiesByTrack
      .filter(a => a.similarity >= trackSimilarityThreshold && !a.reversed)
      .map(a => a.activity);
    const paceSport = isPaceSport(item.type);
    const valueExtractor = paceSport
      ? (a: Activity) => calculatePaceMinPerKm(a.distance, a.moving_time || a.elapsed_time)
      : (a: Activity) => calculateSpeedKmh(a.distance, a.moving_time || a.elapsed_time);
    setTrackTrendLineData(
      trackSimilarActivities.length > 0
        ? calculateTrendLine([item, ...trackSimilarActivities], valueExtractor)
        : []
    );
  }, [item, similarActivitiesByTrack, trackSimilarityThreshold]);

  const coordinates = loadedStream?.streamSet.coordinates;
  const timeData = loadedStream?.streamSet.time;
  const splits = useMemo(
    () => (item.type === 'Swim' ? [] : computeStreamSplits(loadedStream?.streamSet)),
    [item.type, loadedStream?.streamSet]
  );

  // workaround for Strava swimming activities (altitude data is not good enough)
  const altitudeData = item.type === 'Swim' ? undefined : loadedStream?.streamSet.altitude;
  const heartRateData = loadedStream?.streamSet.heartrate;
  const { altitudeDataXY, elevationGain, heartRateDataXY, hasDistanceAxis } = computeData();
  const scrubDetails = useMemo(() => {
    if (scrubX === null || !altitudeDataXY || altitudeDataXY.length === 0) {
      return null;
    }
    const bestIdx = findNearestProfileIndex(altitudeDataXY, scrubX);
    if (bestIdx < 0) return null;
    const point = altitudeDataXY[bestIdx];
    const coord = coordinates?.length === altitudeDataXY.length ? coordinates[bestIdx] : null;
    return {
      index: bestIdx,
      x: point.x,
      altitude: Math.round(point.y),
      coordinate: coord
    };
  }, [scrubX, altitudeDataXY, coordinates]);

  const heartRateSummary = useMemo(() => {
    if (!heartRateData) return null;
    const values = heartRateData.filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    const avg = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
    const max = Math.max(...values);
    return { avg, max };
  }, [heartRateData]);

  const hrZoneDistribution = useMemo(() => {
    if (!heartRateData || heartRateData.length === 0) return null;
    const maxHrResolution = resolveMaxHeartRate({
      profile: userProfile,
      activities: allActivities,
      activityMaxHr: heartRateSummary?.max ?? item.max_heartrate
    });
    return computeHeartRateZoneDistribution({
      heartrate: heartRateData,
      time: timeData,
      maxHrResolution,
      fallbackDurationSeconds: item.moving_time || item.elapsed_time
    });
  }, [
    heartRateData,
    timeData,
    userProfile,
    allActivities,
    heartRateSummary?.max,
    item.max_heartrate,
    item.moving_time,
    item.elapsed_time
  ]);

  const handleActivityPress = async (activity: Activity | null) => {
    try {
      if (activity) {
        const streams = await getActivityStreams([activity]);
        if (streams.length > 0) {
          setOverlayStream(streams[0].streamSet);
        } else {
          setOverlayStream(undefined);
        }
      } else {
        setOverlayStream(undefined);
      }
    } catch (error) {
      simpleLogger.error('Failed to load overlay stream:', error);
      setOverlayStream(undefined);
    }
  };

  const handleExport = () => {
    // exportData wraps its whole body in try/catch and logs internally; it never rejects.
    void exportData(setExportProgress, [item, ...similarActivities]);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <ActivityHeroSummary item={item} />
        <View
          onLayout={event => {
            const { width } = event.nativeEvent.layout;
            setMapWidth(width); // so that the chart has same size as the map
          }}
        >
          <MiniMapComponent
            stream={loadedStream?.streamSet}
            overlayStream={overlayStream}
            title={item.name}
            activityType={item.type}
            highlightCoordinate={scrubDetails?.coordinate}
          />
        </View>

        <AnalysisTabBar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          similarCount={similarActivities.length}
        />

        {activeTab === 'routes' ? (
          <RouteMatchesSection
            item={item}
            similarActivities={similarActivities}
            similarActivitiesByTrack={similarActivitiesByTrack}
            trackSimilarCount={trackSimilarCount}
            trackReverseCount={trackReverseCount}
            trackSimilarityThreshold={trackSimilarityThreshold}
            exportProgress={exportProgress}
            trackTrendLineData={trackTrendLineData}
            mapWidth={mapWidth}
            onOpenSettings={() => setIsMatchSettingsVisible(true)}
            onExport={handleExport}
            onActivityPress={handleActivityPress}
          />
        ) : null}

        {activeTab === 'overview' ? (
          <OverviewSection
            item={item}
            splits={splits}
            hrZoneDistribution={hrZoneDistribution}
            altitudeDataXY={altitudeDataXY}
            mapWidth={mapWidth}
            hasDistanceAxis={hasDistanceAxis}
            scrubX={scrubX}
            scrubDetails={scrubDetails}
            onScrubChange={setScrubX}
          />
        ) : null}

        {activeTab === 'charts' ? (
          <TelemetryChartsSection
            altitudeDataXY={altitudeDataXY}
            elevationGain={elevationGain}
            heartRateDataXY={heartRateDataXY}
            heartRateSummary={heartRateSummary}
            hrZoneDistribution={hrZoneDistribution}
            hasDistanceAxis={hasDistanceAxis}
            hasTimeAxis={!!timeData?.length}
            mapWidth={mapWidth}
            scrubX={scrubX}
            scrubDetails={scrubDetails}
            onScrubChange={setScrubX}
          />
        ) : null}
      </ScrollView>
      <MatchSettingsModal
        isVisible={isMatchSettingsVisible}
        activity={item}
        similarActivitiesCount={similarActivities.length}
        trackSimilarCount={trackSimilarCount}
        trackReverseCount={trackReverseCount}
        iouThreshold={iouThreshold}
        trackSimilarityThreshold={trackSimilarityThreshold}
        onClose={() => setIsMatchSettingsVisible(false)}
        onTrackSimilarityChange={setTrackSimilarityThreshold}
        onIoUChange={setIouThreshold}
        onResetDefaults={() => {
          setTrackSimilarityThreshold(0.7);
          setIouThreshold(getDefaultIoUThreshold(item));
        }}
      />
    </View>
  );

  /**
   * Computes the data for the altitude and elevation gain charts.
   * If coordinates are present with matching length, uses cumulative distance (km)
   * for the X-axis; otherwise falls back to elapsed time in hours.
   * Uses deadband hysteresis so microscopic sensor noise is not accumulated
   * into phantom elevation gain.
   * @returns An object with the data for the charts.
   */
  function computeData() {
    const hrXY = heartRateData ? buildHeartRateXY(heartRateData, timeData ?? []) : undefined;

    if (!altitudeData || (!timeData && !coordinates)) {
      return {
        altitudeDataXY: undefined,
        elevationGain: undefined,
        heartRateDataXY: hrXY,
        hasDistanceAxis: false
      };
    }

    const { xValues, hasDistanceAxis: isDistance } = buildProfileXValues(
      altitudeData.length,
      coordinates,
      timeData
    );

    const altXY = altitudeData.map((y, i) => ({ x: xValues[i], y }));
    const elGain = buildElevationGainSeries(altitudeData, xValues, item.total_elevation_gain);

    return {
      altitudeDataXY: altXY,
      elevationGain: elGain,
      heartRateDataXY: hrXY,
      hasDistanceAxis: isDistance
    };
  }
}
