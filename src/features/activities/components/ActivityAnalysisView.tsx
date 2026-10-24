import { getActivityStreams } from '@/features/activities/services/fetchAndStoreStreams';
import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
// Reverted: no gesture handler for chart zoom
import {
  Activity,
  activityUtcMs,
  compareActivitiesByUtcAsc,
  formatActivityLocalDateTime,
  calculateSpeedKmh,
  calculateTrendLine,
  ActivityWithStream,
  findSimilarActivities,
  ActivityStream,
  simpleLogger
} from '@/shared';
import { exportData } from '@/shared/services/exportData';
import { findSimilarActivitiesByTrack } from '@/shared/services/trackComparison';
import { createChartTheme, useTheme } from '@/theme';
import { createStyles } from './ActivityAnalysisView.styles';
import {
  VictoryAxis,
  VictoryChart,
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
  iouThreshold,
  trackSimilarityThreshold,
  setIsIoUModalVisible,
  setIsTrackModalVisible,
  onExport
}: Readonly<{
  similarActivities: Activity[];
  trackSimilarCount: number;
  iouThreshold: number;
  trackSimilarityThreshold: number;
  setIsIoUModalVisible: (visible: boolean) => void;
  setIsTrackModalVisible: (visible: boolean) => void;
  onExport: () => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name="alpha-s-box-outline" size={24} color={theme.success} />
          <Text
            style={[
              styles.similarActivityTitle,
              { marginLeft: 6, marginBottom: 0, color: theme.success }
            ]}
          >
            {similarActivities.length}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name="alpha-t-circle-outline" size={24} color={theme.textMuted} />
          <Text style={[styles.similarActivityTitle, { marginLeft: 6, marginBottom: 0 }]}>
            {trackSimilarCount}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => setIsIoUModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Adjust IoU threshold"
          style={styles.chip}
        >
          <Text style={styles.chipText}>{`IoU: ${iouThreshold.toFixed(2)}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIsTrackModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Adjust track similarity threshold"
          style={styles.chip}
        >
          <Text style={styles.chipText}>{`Track: ${trackSimilarityThreshold.toFixed(2)}`}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={onExport}
        accessibilityRole="button"
        accessibilityLabel="Export similar activities"
        style={{ padding: 6 }}
      >
        <MaterialCommunityIcons name="application-export" size={24} color={theme.textMuted} />
      </TouchableOpacity>
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
  similarActivitiesByTrack: { activity: Activity; similarity: number }[];
  trackSimilarityThreshold: number;
  onActivityPress: (activity: Activity | null) => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ width: '100%' }}
      contentContainerStyle={{ paddingHorizontal: 10 }}
    >
      {similarActivities.map(activity => {
        const similarByTrackInfo = similarActivitiesByTrack.find(
          a => a.activity.id === activity.id
        );
        const isSimilarByTrack =
          !!similarByTrackInfo && similarByTrackInfo.similarity >= trackSimilarityThreshold;
        return (
          <Pressable
            key={activity.id}
            onPressIn={() => onActivityPress(activity)}
            onPressOut={() => onActivityPress(null)}
          >
            <View
              style={[
                styles.similarActivityItem,
                isSimilarByTrack ? { backgroundColor: theme.success } : null
              ]}
            >
              <Text selectable>{activity.name}</Text>
              <Text selectable>Date: {formatActivityLocalDateTime(activity)}</Text>
              <Text selectable>Distance: {(activity.distance / 1000).toFixed(1)} km</Text>
              {similarByTrackInfo ? (
                <Text selectable>Similarity: {similarByTrackInfo.similarity.toFixed(2)}</Text>
              ) : null}
              <Text selectable>
                Average Speed:{' '}
                {calculateSpeedKmh(activity.distance, activity.moving_time).toFixed(1)} km/h
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
  trendLineData,
  trackTrendLineData,
  mapWidth
}: Readonly<{
  item: Activity;
  similarActivities: Activity[];
  similarActivitiesByTrack: { activity: Activity; similarity: number }[];
  trackSimilarityThreshold: number;
  trendLineData: { x: Date; y: number }[];
  trackTrendLineData: { x: Date; y: number }[];
  mapWidth: number;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (similarActivities.length === 0) return <></>;

  return (
    <VictoryChart
      theme={chartTheme}
      width={mapWidth}
      minDomain={{ y: 0 }}
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
        label="Avg Speed (km/h)"
        style={{
          axisLabel: { padding: 40 }
        }}
      />
      <VictoryScatter
        data={[item, ...similarActivities].sort(compareActivitiesByUtcAsc).map(a => ({
          x: new Date(activityUtcMs(a)),
          y: calculateSpeedKmh(a.distance, a.moving_time),
          activity: a
        }))}
        style={{
          data: {
            fill: ({ datum }) => {
              if (datum.activity.id === item.id) {
                return theme.danger;
              }
              if (
                similarActivitiesByTrack.some(
                  a =>
                    a.activity.id === datum.activity.id && a.similarity >= trackSimilarityThreshold
                )
              ) {
                return theme.success;
              }
              return theme.info;
            }
          }
        }}
      />
      {trendLineData.length > 0 ? (
        <VictoryLine
          data={trendLineData}
          style={{
            data: { stroke: theme.text, strokeWidth: 2, strokeDasharray: '4' }
          }}
        />
      ) : null}
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
  mapWidth
}: Readonly<{
  altitudeDataXY: { x: number; y: number }[] | undefined;
  mapWidth: number;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (!altitudeDataXY) {
    return <Text>No altitude data available</Text>;
  }

  return (
    <VictoryChart theme={chartTheme} width={mapWidth}>
      <VictoryAxis
        label="Time (h:min)"
        tickFormat={formatTime}
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
 * Component for displaying elevation gain chart
 */
function ElevationGainChart({
  elevationGain,
  mapWidth
}: Readonly<{
  elevationGain: { x: number; y: number }[] | undefined;
  mapWidth: number;
}>): JSX.Element {
  const theme = useTheme();
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  if (!elevationGain) {
    return <Text>No elevation gain data available</Text>;
  }

  return (
    <VictoryChart theme={chartTheme} width={mapWidth}>
      <VictoryAxis
        label="Time (h:min)"
        tickFormat={formatTime}
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

/**
 * Component for displaying activity details
 */
function ActivityDetails({ item }: Readonly<{ item: Activity }>): JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ padding: 10 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Activity Details:</Text>
      {Object.entries(item).map(([key, value]) => {
        const valueString =
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              marginVertical: 2,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
              paddingBottom: 5
            }}
          >
            <Text selectable style={{ fontWeight: 'bold', width: 150 }}>
              {key}
            </Text>
            <Text selectable style={{ flex: 1, flexWrap: 'wrap' }}>
              {valueString}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Component for IoU threshold modal.
 * Uses internal display state so the label updates live during drag,
 * while onSlidingComplete is called only on release to avoid triggering
 * the expensive findSimilarActivities on every slider step.
 */
function IoUThresholdModal({
  isVisible,
  iouThreshold,
  onClose,
  onSlidingComplete
}: Readonly<{
  isVisible: boolean;
  iouThreshold: number;
  onClose: () => void;
  onSlidingComplete: (value: number) => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [displayValue, setDisplayValue] = useState(iouThreshold);

  // Sync display value when modal opens with current threshold
  useEffect(() => {
    if (isVisible) setDisplayValue(iouThreshold);
  }, [isVisible, iouThreshold]);

  return (
    <Modal transparent animationType="slide" visible={isVisible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalRow}>
            <Text style={{ fontSize: 16, fontWeight: 'bold' }}>IoU Threshold</Text>
            <Text style={{ fontSize: 14 }}>{displayValue.toFixed(2)}</Text>
          </View>
          <Slider
            minimumValue={0.5}
            maximumValue={0.95}
            step={0.05}
            value={displayValue}
            minimumTrackTintColor={theme.primary}
            maximumTrackTintColor={theme.surfaceMuted}
            thumbTintColor={theme.primaryPressed}
            onValueChange={setDisplayValue}
            onSlidingComplete={onSlidingComplete}
            accessibilityLabel="IoU threshold slider"
          />
          <View style={[styles.modalRow, { marginTop: 12 }]}>
            <Button title="Close" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Component for track similarity threshold modal
 */
function TrackSimilarityModal({
  isVisible,
  trackSimilarityThreshold,
  onClose,
  onValueChange
}: Readonly<{
  isVisible: boolean;
  trackSimilarityThreshold: number;
  onClose: () => void;
  onValueChange: (value: number) => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Modal transparent animationType="slide" visible={isVisible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalRow}>
            <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Track Similarity</Text>
            <Text style={{ fontSize: 14 }}>{trackSimilarityThreshold.toFixed(2)}</Text>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={trackSimilarityThreshold}
            minimumTrackTintColor={theme.primary}
            maximumTrackTintColor={theme.surfaceMuted}
            thumbTintColor={theme.primaryPressed}
            onValueChange={onValueChange}
            accessibilityLabel="Track similarity threshold slider"
          />
          <View style={[styles.modalRow, { marginTop: 12 }]}>
            <Button title="Close" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [trackSimilarityThreshold, setTrackSimilarityThreshold] = useState<number>(0.15);
  const [iouThreshold, setIouThreshold] = useState<number>(0.8);
  const [isIoUModalVisible, setIsIoUModalVisible] = useState<boolean>(false);
  const [isTrackModalVisible, setIsTrackModalVisible] = useState<boolean>(false);
  const [mapWidth, setMapWidth] = useState<number>(0);
  const [loadedStream, setLoadedStream] = useState<ActivityWithStream>();
  const [overlayStream, setOverlayStream] = useState<ActivityStream | undefined>();
  const [similarActivities, setSimilarActivities] = useState<Activity[]>([]);
  const [similarActivitiesByTrack, setSimilarActivitiesByTrack] = useState<
    { activity: Activity; similarity: number }[]
  >([]);
  const [trendLineData, setTrendLineData] = useState<{ x: Date; y: number }[]>([]);
  const [trackTrendLineData, setTrackTrendLineData] = useState<{ x: Date; y: number }[]>([]);
  const [exportProgress, setExportProgress] = useState(0);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const trackSimilarCount = similarActivitiesByTrack.filter(
    a => a.similarity >= trackSimilarityThreshold
  ).length;

  // Heavy effect: re-runs only when item, activities, or IoU threshold changes.
  // trackSimilarityThreshold intentionally excluded — it only filters the
  // already-computed byTrack results, so changing it should not re-trigger
  // findSimilarActivitiesByTrack (async file I/O against all similar activities).
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const similar = findSimilarActivities(item, allActivities, iouThreshold);
    setSimilarActivities(similar);
    setTrendLineData(similar.length > 0 ? calculateTrendLine([item, ...similar]) : []);
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
      .filter(a => a.similarity >= trackSimilarityThreshold)
      .map(a => a.activity);
    setTrackTrendLineData(
      trackSimilarActivities.length > 0 ? calculateTrendLine([item, ...trackSimilarActivities]) : []
    );
  }, [item, similarActivitiesByTrack, trackSimilarityThreshold]);

  useEffect(() => {
    let isMounted = true;

    const loadStream = async () => {
      try {
        const streams = await getActivityStreams([item]);
        if (!isMounted) {
          return;
        }

        if (streams.length > 0) {
          setLoadedStream(streams[0]);
        } else {
          simpleLogger.warn('No stream found for activity in ActivityAnalysisView', {
            activityId: item.id
          });
          setLoadedStream(undefined);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        simpleLogger.error('Error loading stream for ActivityAnalysisView:', error);
        setLoadedStream(undefined);
      }
    };

    void loadStream();

    return () => {
      isMounted = false;
    };
  }, [item]);

  const timeData = loadedStream?.streamSet.time;

  // workaround for Strava swimming activities (altitude data is not good enough)
  const altitudeData = item.type === 'Swim' ? undefined : loadedStream?.streamSet.altitude;
  const { altitudeDataXY, elevationGain } = item.type === 'Swim' ? {} : computeData();

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
    <View>
      <ScrollView>
        <View
          onLayout={event => {
            const { width } = event.nativeEvent.layout;
            setMapWidth(width); // so that the chart has same size as the map
          }}
        >
          <MiniMapComponent stream={loadedStream?.streamSet} overlayStream={overlayStream} />
        </View>
        <View style={styles.similarActivitiesContainer}>
          <SimilarActivitiesHeader
            similarActivities={similarActivities}
            trackSimilarCount={trackSimilarCount}
            iouThreshold={iouThreshold}
            trackSimilarityThreshold={trackSimilarityThreshold}
            setIsIoUModalVisible={setIsIoUModalVisible}
            setIsTrackModalVisible={setIsTrackModalVisible}
            onExport={handleExport}
          />
          {exportProgress > 0 && exportProgress < 1 ? (
            <Text>Exporting... {Math.round(exportProgress * 100)}%</Text>
          ) : null}
          <SimilarActivitiesList
            similarActivities={similarActivities}
            similarActivitiesByTrack={similarActivitiesByTrack}
            trackSimilarityThreshold={trackSimilarityThreshold}
            onActivityPress={handleActivityPress}
          />
          <SpeedTrendChart
            item={item}
            similarActivities={similarActivities}
            similarActivitiesByTrack={similarActivitiesByTrack}
            trackSimilarityThreshold={trackSimilarityThreshold}
            trendLineData={trendLineData}
            trackTrendLineData={trackTrendLineData}
            mapWidth={mapWidth}
          />
        </View>
        <AltitudeChart altitudeDataXY={altitudeDataXY} mapWidth={mapWidth} />
        <ElevationGainChart elevationGain={elevationGain} mapWidth={mapWidth} />
        <ActivityDetails item={item} />
      </ScrollView>
      <IoUThresholdModal
        isVisible={isIoUModalVisible}
        iouThreshold={iouThreshold}
        onClose={() => setIsIoUModalVisible(false)}
        onSlidingComplete={setIouThreshold}
      />
      <TrackSimilarityModal
        isVisible={isTrackModalVisible}
        trackSimilarityThreshold={trackSimilarityThreshold}
        onClose={() => setIsTrackModalVisible(false)}
        onValueChange={setTrackSimilarityThreshold}
      />
    </View>
  );

  /**
   * Computes the data for the altitude and elevation gain charts.
   * Uses deadband hysteresis so microscopic sensor noise is not accumulated
   * into phantom elevation gain.
   * If the activity recorded 0 elevation gain, the cumulative gain line stays 0.
   * @returns An object with the data for the charts.
   */
  function computeData() {
    if (!altitudeData || !timeData) return { altitudeDataXY: undefined, elevationGain: undefined };

    const altXY: { x: number; y: number }[] = [];
    const elGain: { x: number; y: number }[] = [];

    if (item.total_elevation_gain === 0) {
      for (let i = 0; i < altitudeData.length; i++) {
        const x = timeData[i] / 3600;
        altXY.push({ x, y: altitudeData[i] });
        elGain.push({ x, y: 0 });
      }
      return { altitudeDataXY: altXY, elevationGain: elGain };
    }

    let sumGain = 0;
    const HYSTERESIS_THRESHOLD = 1.5;
    let anchor: number | null = null;

    for (let i = 0; i < altitudeData.length; i++) {
      const x = timeData[i] / 3600;
      const y = altitudeData[i];
      altXY.push({ x, y });

      if (i === 0) {
        anchor = y;
        elGain.push({ x, y: 0 });
      } else if (anchor !== null) {
        const delta = y - anchor;
        if (delta >= HYSTERESIS_THRESHOLD) {
          sumGain += delta;
          anchor = y;
        } else if (delta <= -HYSTERESIS_THRESHOLD) {
          anchor = y;
        }
        elGain.push({ x, y: Math.round(sumGain * 10) / 10 });
      }
    }

    return { altitudeDataXY: altXY, elevationGain: elGain };
  }
}
