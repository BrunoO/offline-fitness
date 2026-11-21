import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Activity, formatActivityRate, isNoGpsActivity, LatLng, seconds_to_label } from '@/shared';
import type { EncodableStreamSet } from '@/shared/services/streamCodec';
import { useTheme } from '@/theme';
import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
import {
  applyActivityMetadataPatch,
  buildTrimPreviewStreams,
  computeCutPointMetrics,
  previewTrimmedActivity,
  trimActivityStream
} from '../services/activityTrimmer';
import type {
  CutPointMetrics,
  TrimPreviewResult,
  TrimPreviewStreams
} from '../services/activityTrimmer';
import { buildManualTypeList } from '../services/manualActivity';
import { addCustomManualEntryType, loadManualEntryPrefs } from '../services/manualEntryPrefs';
import type { StreamSet } from '../types/stravaActivityStream.model';
import { createActivityEditModalStyles } from './ActivityEditModal.styles';

export interface ActivityEditModalProps {
  visible: boolean;
  activity: Activity;
  globalActivities: readonly Activity[];
  rawStream?: StreamSet | null;
  initialTab?: 'details' | 'trim';
  onClose: () => void;
  onSave: (updatedActivity: Activity, trimmedStream?: EncodableStreamSet) => Promise<void>;
}

interface DetailsTabProps {
  name: string;
  setName: (v: string) => void;
  selectedType: string;
  setSelectedType: (v: string) => void;
  availableSportTypes: string[];
  showCustomInput: boolean;
  setShowCustomInput: React.Dispatch<React.SetStateAction<boolean>>;
  customTypeInputValue: string;
  setCustomTypeInputValue: (v: string) => void;
  onAddCustomType: () => void;
  hasStream: boolean;
  hasGps: boolean;
  isNoGps: boolean;
  isSwim: boolean;
  durationMin: string;
  setDurationMin: (v: string) => void;
  durationSec: string;
  setDurationSec: (v: string) => void;
  distanceKm: string;
  setDistanceKm: (v: string) => void;
  elevationGainM: string;
  setElevationGainM: (v: string) => void;
  onOpenTrimTab: () => void;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createActivityEditModalStyles>;
}

function DetailsTabContent({
  name,
  setName,
  selectedType,
  setSelectedType,
  availableSportTypes,
  showCustomInput,
  setShowCustomInput,
  customTypeInputValue,
  setCustomTypeInputValue,
  onAddCustomType,
  hasStream,
  hasGps,
  isNoGps,
  isSwim,
  durationMin,
  setDurationMin,
  durationSec,
  setDurationSec,
  distanceKm,
  setDistanceKm,
  elevationGainM,
  setElevationGainM,
  onOpenTrimTab,
  theme,
  styles
}: Readonly<DetailsTabProps>): JSX.Element {
  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Activity name"
          placeholderTextColor={theme.textMuted}
          style={styles.textInput}
          autoCapitalize="sentences"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Sport Type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {availableSportTypes.map(candidate => {
            const isSelected = candidate.toLowerCase() === selectedType.toLowerCase();
            return (
              <Pressable
                key={candidate}
                accessibilityRole="button"
                accessibilityLabel={`Select sport ${candidate}`}
                onPress={() => setSelectedType(candidate)}
                style={[styles.chip, isSelected ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, isSelected ? styles.chipTextActive : null]}>
                  {candidate}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add custom sport type"
            onPress={() => setShowCustomInput(prev => !prev)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>+ Custom</Text>
          </Pressable>
        </ScrollView>
        {showCustomInput ? (
          <View style={styles.customTypeRow}>
            <TextInput
              value={customTypeInputValue}
              onChangeText={setCustomTypeInputValue}
              placeholder="Custom sport name"
              placeholderTextColor={theme.textMuted}
              style={styles.customTypeInput}
              autoFocus
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add custom type"
              onPress={onAddCustomType}
              style={styles.customTypeAddButton}
            >
              <Text style={styles.customTypeAddButtonText}>Add</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {!hasStream ? (
        <>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Duration</Text>
            <View style={styles.inlineFieldsRow}>
              <View style={styles.inlineFieldItem}>
                <TextInput
                  value={durationMin}
                  onChangeText={setDurationMin}
                  placeholder="Minutes"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  style={styles.textInput}
                />
              </View>
              <View style={styles.inlineFieldItem}>
                <TextInput
                  value={durationSec}
                  onChangeText={setDurationSec}
                  placeholder="Seconds"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  style={styles.textInput}
                />
              </View>
            </View>
          </View>

          {!isNoGps ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Distance (km)</Text>
              <TextInput
                value={distanceKm}
                onChangeText={setDistanceKm}
                placeholder="e.g. 5.2"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                style={styles.textInput}
              />
            </View>
          ) : null}
        </>
      ) : null}

      {!isSwim ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Elevation Gain (m)</Text>
          <TextInput
            value={elevationGainM}
            onChangeText={setElevationGainM}
            placeholder="e.g. 150"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            style={styles.textInput}
          />
        </View>
      ) : null}

      {hasStream ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open trim on map"
          onPress={onOpenTrimTab}
          style={styles.trimShortcutCard}
        >
          <View>
            <Text style={styles.trimShortcutTitle}>
              {hasGps ? 'Trim / Shorten on Map →' : 'Trim / Shorten Workout →'}
            </Text>
            <Text style={styles.trimShortcutSubtitle}>
              Scrub start and end with live map & cut-point telemetry
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: theme.primary }}>›</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function TelemetryCard({
  metrics,
  activeHandle,
  styles
}: Readonly<{
  metrics: CutPointMetrics;
  activeHandle: 'start' | 'end';
  styles: ReturnType<typeof createActivityEditModalStyles>;
}>): JSX.Element {
  return (
    <View style={styles.telemetryCard}>
      <Text style={styles.telemetryTitle}>
        {activeHandle === 'end' ? 'Cut-point (End)' : 'Cut-point (Start)'}
      </Text>
      <View style={styles.telemetryGrid}>
        <View style={styles.telemetryItem}>
          <Text style={styles.telemetryLabel}>Time</Text>
          <Text style={styles.telemetryValue}>{seconds_to_label(metrics.elapsedSec)}</Text>
        </View>
        <View style={styles.telemetryItem}>
          <Text style={styles.telemetryLabel}>Wall Clock</Text>
          <Text style={styles.telemetryValue}>{metrics.wallClockTime}</Text>
        </View>
        {metrics.speedKmh !== null ? (
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Speed</Text>
            <Text style={styles.telemetryValue}>{metrics.speedKmh.toFixed(1)} km/h</Text>
          </View>
        ) : null}
        {metrics.heartRateBpm !== null ? (
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Heart Rate</Text>
            <Text style={styles.telemetryValue}>{metrics.heartRateBpm} bpm</Text>
          </View>
        ) : null}
        {metrics.altitudeM !== null ? (
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>Elevation</Text>
            <Text style={styles.telemetryValue}>{Math.round(metrics.altitudeM)} m</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SummaryComparisonCard({
  preview,
  activity,
  selectedType,
  hasGps,
  isSwim,
  styles
}: Readonly<{
  preview: TrimPreviewResult;
  activity: Activity;
  selectedType: string;
  hasGps: boolean;
  isSwim: boolean;
  styles: ReturnType<typeof createActivityEditModalStyles>;
}>): JSX.Element {
  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewTitle}>Summary Comparison</Text>

      {hasGps ? (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Distance</Text>
          <View style={styles.previewValuesContainer}>
            <Text style={styles.previewOldText}>{(activity.distance / 1000).toFixed(2)} km</Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewNewText}>
              {(preview.distanceMeters / 1000).toFixed(2)} km
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>Duration</Text>
        <View style={styles.previewValuesContainer}>
          <Text style={styles.previewOldText}>{seconds_to_label(activity.elapsed_time)}</Text>
          <Text style={styles.previewArrow}>→</Text>
          <Text style={styles.previewNewText}>{seconds_to_label(preview.elapsedTimeSec)}</Text>
        </View>
      </View>

      {hasGps ? (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Pace / Speed</Text>
          <View style={styles.previewValuesContainer}>
            <Text style={styles.previewOldText}>
              {formatActivityRate(
                activity.distance,
                activity.moving_time > 0 ? activity.moving_time : activity.elapsed_time,
                selectedType
              )}
            </Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewNewText}>
              {formatActivityRate(preview.distanceMeters, preview.movingTimeSec, selectedType)}
            </Text>
          </View>
        </View>
      ) : null}

      {!isSwim && (hasGps || activity.total_elevation_gain > 0) ? (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Elevation Gain</Text>
          <View style={styles.previewValuesContainer}>
            <Text style={styles.previewOldText}>{Math.round(activity.total_elevation_gain)} m</Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewNewText}>{Math.round(preview.elevationGainM)} m</Text>
          </View>
        </View>
      ) : null}

      {preview.averageHeartRate !== undefined ? (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Avg Heart Rate</Text>
          <View style={styles.previewValuesContainer}>
            <Text style={styles.previewOldText}>
              {activity.average_heartrate ? `${activity.average_heartrate} bpm` : '-'}
            </Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewNewText}>{preview.averageHeartRate} bpm</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface TrimTabProps {
  hasGps: boolean;
  previewStreams: TrimPreviewStreams;
  fullCoordinates: LatLng[];
  selectedType: string;
  name: string;
  activeHandle: 'start' | 'end';
  setActiveHandle: (v: 'start' | 'end') => void;
  cutPointMetrics: CutPointMetrics | null;
  startIndex: number;
  endIndex: number;
  totalPoints: number;
  setStartIndex: (v: number) => void;
  setEndIndex: (v: number) => void;
  onStepTime: (deltaSec: number) => void;
  onResetTrim: () => void;
  previewMetrics: TrimPreviewResult | null;
  activity: Activity;
  isSwim: boolean;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createActivityEditModalStyles>;
}

function TrimTabContent({
  hasGps,
  previewStreams,
  fullCoordinates,
  selectedType,
  name,
  activeHandle,
  setActiveHandle,
  cutPointMetrics,
  startIndex,
  endIndex,
  totalPoints,
  setStartIndex,
  setEndIndex,
  onStepTime,
  onResetTrim,
  previewMetrics,
  activity,
  isSwim,
  theme,
  styles
}: Readonly<TrimTabProps>): JSX.Element {
  return (
    <>
      {hasGps ? (
        <View style={styles.mapContainer}>
          <MiniMapComponent
            stream={previewStreams.keptStream}
            overlayStream={previewStreams.cutStream}
            overlaySecondaryStream={previewStreams.cutTailStream}
            overlayColor={theme.textMuted}
            highlightCoordinate={previewStreams.activeCoordinate}
            fitCoordinates={fullCoordinates}
            autoFitOnCoordinateChange={false}
            showDirectionArrows={false}
            showRecenterButton={true}
            allowFlyover={false}
            activityType={selectedType}
            title={name}
          />
        </View>
      ) : null}

      <View style={styles.handleSelectorRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select Trim End handle"
          onPress={() => setActiveHandle('end')}
          style={[styles.handleButton, activeHandle === 'end' ? styles.handleButtonActive : null]}
        >
          <Text
            style={[
              styles.handleButtonText,
              activeHandle === 'end' ? styles.handleButtonTextActive : null
            ]}
          >
            Trim End (Cut Tail)
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select Trim Start handle"
          onPress={() => setActiveHandle('start')}
          style={[styles.handleButton, activeHandle === 'start' ? styles.handleButtonActive : null]}
        >
          <Text
            style={[
              styles.handleButtonText,
              activeHandle === 'start' ? styles.handleButtonTextActive : null
            ]}
          >
            Trim Start (Cut Head)
          </Text>
        </Pressable>
      </View>

      {cutPointMetrics ? (
        <TelemetryCard metrics={cutPointMetrics} activeHandle={activeHandle} styles={styles} />
      ) : null}

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={activeHandle === 'end' ? startIndex + 1 : 0}
          maximumValue={activeHandle === 'end' ? totalPoints - 1 : endIndex - 1}
          step={1}
          value={activeHandle === 'end' ? endIndex : startIndex}
          onValueChange={val => {
            const rounded = Math.round(val);
            if (activeHandle === 'end') {
              setEndIndex(rounded);
            } else {
              setStartIndex(rounded);
            }
          }}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.surfaceMuted}
          thumbTintColor={theme.primary}
          accessibilityLabel={activeHandle === 'end' ? 'Trim end slider' : 'Trim start slider'}
        />

        <View style={styles.steppersRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minus 10 seconds"
            onPress={() => onStepTime(-10)}
            style={styles.stepperButton}
          >
            <Text style={styles.stepperButtonText}>-10s</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minus 1 second"
            onPress={() => onStepTime(-1)}
            style={styles.stepperButton}
          >
            <Text style={styles.stepperButtonText}>-1s</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset trim"
            onPress={onResetTrim}
            style={styles.stepperResetButton}
          >
            <Text style={styles.stepperResetButtonText}>Reset</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plus 1 second"
            onPress={() => onStepTime(1)}
            style={styles.stepperButton}
          >
            <Text style={styles.stepperButtonText}>+1s</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plus 10 seconds"
            onPress={() => onStepTime(10)}
            style={styles.stepperButton}
          >
            <Text style={styles.stepperButtonText}>+10s</Text>
          </Pressable>
        </View>
      </View>

      {previewMetrics ? (
        <SummaryComparisonCard
          preview={previewMetrics}
          activity={activity}
          selectedType={selectedType}
          hasGps={hasGps}
          isSwim={isSwim}
          styles={styles}
        />
      ) : null}
    </>
  );
}

function computeSteppedIndex(
  times: readonly number[],
  currentIndex: number,
  deltaSec: number,
  minIdx: number,
  maxIdx: number
): number {
  const targetT = (times[currentIndex] ?? 0) + deltaSec;
  let bestIdx = currentIndex;
  let minDiff = Infinity;
  for (let i = minIdx; i <= maxIdx; i++) {
    const diff = Math.abs((times[i] ?? 0) - targetT);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function useActivityEditForm(
  visible: boolean,
  activity: Activity,
  totalPoints: number,
  hasStream: boolean,
  initialTab: 'details' | 'trim'
) {
  const [activeTab, setActiveTab] = useState<'details' | 'trim'>(
    hasStream && initialTab === 'trim' ? 'trim' : 'details'
  );
  const [name, setName] = useState<string>(activity.name);
  const [selectedType, setSelectedType] = useState<string>(activity.type);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [customTypeInputValue, setCustomTypeInputValue] = useState<string>('');

  const [durationMin, setDurationMin] = useState<string>(
    String(Math.floor(activity.elapsed_time / 60))
  );
  const [durationSec, setDurationSec] = useState<string>(String(activity.elapsed_time % 60));
  const [distanceKm, setDistanceKm] = useState<string>(
    activity.distance > 0 ? (activity.distance / 1000).toFixed(2) : ''
  );
  const [elevationGainM, setElevationGainM] = useState<string>(
    activity.total_elevation_gain !== undefined ? String(activity.total_elevation_gain) : ''
  );

  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(Math.max(1, totalPoints - 1));
  const [activeHandle, setActiveHandle] = useState<'start' | 'end'>('end');

  useEffect(() => {
    if (!visible) return undefined;
    setName(activity.name);
    setSelectedType(activity.type);
    setDurationMin(String(Math.floor(activity.elapsed_time / 60)));
    setDurationSec(String(activity.elapsed_time % 60));
    setDistanceKm(activity.distance > 0 ? (activity.distance / 1000).toFixed(2) : '');
    setElevationGainM(
      activity.total_elevation_gain !== undefined ? String(activity.total_elevation_gain) : ''
    );
    setStartIndex(0);
    setEndIndex(Math.max(1, totalPoints - 1));
    setActiveHandle('end');
    setActiveTab(hasStream && initialTab === 'trim' ? 'trim' : 'details');
    setShowCustomInput(false);
    setCustomTypeInputValue('');

    let mounted = true;
    loadManualEntryPrefs()
      .then(prefs => {
        if (mounted) setCustomTypes(prefs.customTypes);
      })
      .catch(() => {
        if (mounted) setCustomTypes([]);
      });
    return () => {
      mounted = false;
    };
  }, [visible, activity, totalPoints, hasStream, initialTab]);

  return {
    activeTab,
    setActiveTab,
    name,
    setName,
    selectedType,
    setSelectedType,
    customTypes,
    setCustomTypes,
    showCustomInput,
    setShowCustomInput,
    customTypeInputValue,
    setCustomTypeInputValue,
    durationMin,
    setDurationMin,
    durationSec,
    setDurationSec,
    distanceKm,
    setDistanceKm,
    elevationGainM,
    setElevationGainM,
    startIndex,
    setStartIndex,
    endIndex,
    setEndIndex,
    activeHandle,
    setActiveHandle
  };
}

interface ComputePatchedMetaOptions {
  activity: Activity;
  name: string;
  selectedType: string;
  hasStream: boolean;
  durationMin: string;
  durationSec: string;
  isNoGps: boolean;
  distanceKm: string;
  isSwim: boolean;
  elevationGainM: string;
}

function computePatchedMeta(options: Readonly<ComputePatchedMetaOptions>): Activity {
  const {
    activity,
    name,
    selectedType,
    hasStream,
    durationMin,
    durationSec,
    isNoGps,
    distanceKm,
    isSwim,
    elevationGainM
  } = options;
  let duration: number | undefined;
  if (!hasStream) {
    duration = (Number(durationMin) || 0) * 60 + (Number(durationSec) || 0);
  }
  let distMeters: number | undefined;
  if (!hasStream && !isNoGps && distanceKm.trim() !== '') {
    distMeters = Number(distanceKm) * 1000;
  }
  let elevGain: number | undefined;
  if (!isSwim && elevationGainM.trim() !== '') {
    elevGain = Number(elevationGainM);
  }
  return applyActivityMetadataPatch(activity, {
    name,
    type: selectedType,
    durationSec: duration,
    distanceMeters: distMeters,
    totalElevationGainM: elevGain
  });
}

interface SaveEditedActivityOptions {
  patchedMetaActivity: Activity;
  rawStream: StreamSet | null | undefined;
  hasStream: boolean;
  startIndex: number;
  endIndex: number;
  totalPoints: number;
  onSave: (updatedActivity: Activity, trimmedStream?: EncodableStreamSet) => Promise<void>;
}

function saveEditedActivity(options: Readonly<SaveEditedActivityOptions>) {
  const { patchedMetaActivity, rawStream, hasStream, startIndex, endIndex, totalPoints, onSave } =
    options;
  const isTrimmed =
    hasStream && Boolean(rawStream) && (startIndex > 0 || endIndex < totalPoints - 1);
  if (isTrimmed && rawStream) {
    const { updatedActivity, trimmedStream } = trimActivityStream(
      patchedMetaActivity,
      rawStream,
      startIndex,
      endIndex
    );
    return onSave(updatedActivity, trimmedStream);
  }
  return onSave(patchedMetaActivity, undefined);
}

export function ActivityEditModal({
  visible,
  activity,
  globalActivities,
  rawStream,
  initialTab = 'details',
  onClose,
  onSave
}: Readonly<ActivityEditModalProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createActivityEditModalStyles(theme), [theme]);

  const totalPoints = useMemo(() => {
    return (
      rawStream?.time?.data?.length ??
      rawStream?.latlng?.data?.length ??
      rawStream?.heartrate?.data?.length ??
      0
    );
  }, [rawStream]);

  const hasStream = totalPoints >= 2;
  const hasGps = Boolean(rawStream?.latlng?.data && rawStream.latlng.data.length >= 2);

  const fullCoordinates = useMemo<LatLng[]>(() => {
    if (!rawStream?.latlng?.data) return [];
    return rawStream.latlng.data.map(([latitude, longitude]) => ({
      latitude,
      longitude
    }));
  }, [rawStream]);

  const form = useActivityEditForm(visible, activity, totalPoints, hasStream, initialTab);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableSportTypes = useMemo(() => {
    return buildManualTypeList({
      activities: globalActivities,
      lastType: form.selectedType,
      customTypes: form.customTypes
    });
  }, [globalActivities, form.selectedType, form.customTypes]);

  const isSwim = form.selectedType.toLowerCase() === 'swim';
  const isNoGps = isNoGpsActivity(form.selectedType);

  const patchedMetaActivity = useMemo(() => {
    return computePatchedMeta({
      activity,
      name: form.name,
      selectedType: form.selectedType,
      hasStream,
      durationMin: form.durationMin,
      durationSec: form.durationSec,
      isNoGps,
      distanceKm: form.distanceKm,
      isSwim,
      elevationGainM: form.elevationGainM
    });
  }, [
    activity,
    form.name,
    form.selectedType,
    hasStream,
    form.durationMin,
    form.durationSec,
    isNoGps,
    form.distanceKm,
    isSwim,
    form.elevationGainM
  ]);

  const previewMetrics = useMemo(() => {
    if (!hasStream || !rawStream || totalPoints < 2) return null;
    return previewTrimmedActivity(patchedMetaActivity, rawStream, form.startIndex, form.endIndex);
  }, [hasStream, rawStream, totalPoints, patchedMetaActivity, form.startIndex, form.endIndex]);

  const previewStreams = useMemo(() => {
    if (!hasStream || !rawStream || totalPoints < 2) {
      return {
        keptStream: { coordinates: [], altitude: [], time: [] },
        cutStream: undefined,
        activeCoordinate: null
      };
    }
    return buildTrimPreviewStreams(rawStream, form.startIndex, form.endIndex, form.activeHandle);
  }, [hasStream, rawStream, totalPoints, form.startIndex, form.endIndex, form.activeHandle]);

  const cutPointMetrics = useMemo(() => {
    if (!hasStream || !rawStream || totalPoints < 2) return null;
    const activeIndex = form.activeHandle === 'end' ? form.endIndex : form.startIndex;
    return computeCutPointMetrics(rawStream, activeIndex, patchedMetaActivity);
  }, [
    hasStream,
    rawStream,
    totalPoints,
    form.activeHandle,
    form.endIndex,
    form.startIndex,
    patchedMetaActivity
  ]);

  const handleStepTime = (deltaSec: number) => {
    if (!rawStream?.time?.data || totalPoints < 2) return;
    const times = rawStream.time.data;
    const currentIndex = form.activeHandle === 'end' ? form.endIndex : form.startIndex;
    const minIdx = form.activeHandle === 'end' ? form.startIndex + 1 : 0;
    const maxIdx = form.activeHandle === 'end' ? totalPoints - 1 : form.endIndex - 1;
    const stepped = computeSteppedIndex(times, currentIndex, deltaSec, minIdx, maxIdx);
    if (form.activeHandle === 'end') {
      form.setEndIndex(stepped);
    } else {
      form.setStartIndex(stepped);
    }
  };

  const handleAddCustomType = async () => {
    const trimmed = form.customTypeInputValue.trim();
    if (!trimmed) return;
    const nextCustoms = await addCustomManualEntryType(trimmed);
    form.setCustomTypes(nextCustoms);
    form.setSelectedType(trimmed);
    form.setShowCustomInput(false);
    form.setCustomTypeInputValue('');
  };

  const executeSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await saveEditedActivity({
        patchedMetaActivity,
        rawStream,
        hasStream,
        startIndex: form.startIndex,
        endIndex: form.endIndex,
        totalPoints,
        onSave
      });
      onClose();
    } catch {
      setErrorMessage('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePress = () => {
    const isTrimmed = hasStream && (form.startIndex > 0 || form.endIndex < totalPoints - 1);
    if (isTrimmed && previewMetrics) {
      const deltaSec = Math.abs(previewMetrics.deltaElapsedTimeSec);
      Alert.alert(
        'Trim recording?',
        `This will permanently shorten the recording by removing ${seconds_to_label(deltaSec)} from the stream. Are you sure?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Trim & Save',
            style: 'destructive',
            onPress: () => {
              void executeSave();
            }
          }
        ]
      );
    } else {
      void executeSave();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Edit Activity</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close editor"
              onPress={onClose}
              style={styles.headerCloseButton}
            >
              <Text style={{ fontSize: 18, color: theme.textMuted }}>✕</Text>
            </Pressable>
          </View>

          {hasStream ? (
            <View style={styles.tabsRow}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Details tab"
                onPress={() => form.setActiveTab('details')}
                style={[
                  styles.tabButton,
                  form.activeTab === 'details' ? styles.tabButtonActive : null
                ]}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    form.activeTab === 'details' ? styles.tabButtonTextActive : null
                  ]}
                >
                  Details
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Trim and shorten tab"
                onPress={() => form.setActiveTab('trim')}
                style={[
                  styles.tabButton,
                  form.activeTab === 'trim' ? styles.tabButtonActive : null
                ]}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    form.activeTab === 'trim' ? styles.tabButtonTextActive : null
                  ]}
                >
                  Trim / Shorten
                </Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.contentScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {form.activeTab === 'details' ? (
              <DetailsTabContent
                name={form.name}
                setName={form.setName}
                selectedType={form.selectedType}
                setSelectedType={form.setSelectedType}
                availableSportTypes={availableSportTypes}
                showCustomInput={form.showCustomInput}
                setShowCustomInput={form.setShowCustomInput}
                customTypeInputValue={form.customTypeInputValue}
                setCustomTypeInputValue={form.setCustomTypeInputValue}
                onAddCustomType={() => {
                  void handleAddCustomType();
                }}
                hasStream={hasStream}
                hasGps={hasGps}
                isNoGps={isNoGps}
                isSwim={isSwim}
                durationMin={form.durationMin}
                setDurationMin={form.setDurationMin}
                durationSec={form.durationSec}
                setDurationSec={form.setDurationSec}
                distanceKm={form.distanceKm}
                setDistanceKm={form.setDistanceKm}
                elevationGainM={form.elevationGainM}
                setElevationGainM={form.setElevationGainM}
                onOpenTrimTab={() => form.setActiveTab('trim')}
                theme={theme}
                styles={styles}
              />
            ) : (
              <TrimTabContent
                hasGps={hasGps}
                previewStreams={previewStreams}
                fullCoordinates={fullCoordinates}
                selectedType={form.selectedType}
                name={form.name}
                activeHandle={form.activeHandle}
                setActiveHandle={form.setActiveHandle}
                cutPointMetrics={cutPointMetrics}
                startIndex={form.startIndex}
                endIndex={form.endIndex}
                totalPoints={totalPoints}
                setStartIndex={form.setStartIndex}
                setEndIndex={form.setEndIndex}
                onStepTime={handleStepTime}
                onResetTrim={() => {
                  form.setStartIndex(0);
                  form.setEndIndex(totalPoints - 1);
                }}
                previewMetrics={previewMetrics}
                activity={activity}
                isSwim={isSwim}
                theme={theme}
                styles={styles}
              />
            )}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footerButtonsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              onPress={onClose}
              disabled={isSaving}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save activity changes"
              onPress={handleSavePress}
              disabled={isSaving}
              style={[styles.saveButton, isSaving ? styles.saveButtonDisabled : null]}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
