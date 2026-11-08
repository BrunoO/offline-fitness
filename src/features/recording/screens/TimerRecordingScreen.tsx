import { useTheme } from '@/theme';
import type { ResolvedTheme } from '@/theme';
import React, { JSX, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { STACK_ROUTES } from '@/constants';
import {
  getZoneForBpm,
  HeartRateCard,
  resolveMaxHeartRate,
  useHeartRate
} from '@/features/heart-rate';
import { useUserProfile } from '@/features/profile';
import { useTimerRecording, type TimerHeartRateSummary } from '../hooks/useTimerRecording';
import { NO_GPS_ACTIVITY_TYPES } from '@/shared';
import { createStyles } from './TimerRecordingScreen.styles';

const formatElapsed = (elapsedSec: number): string => {
  const hours = Math.floor(elapsedSec / 3600);
  const minutes = Math.floor((elapsedSec % 3600) / 60);
  const seconds = elapsedSec % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const INTERVAL_PRESETS = [1, 3, 5, 10, 15, 30];

const statusColor = (phase: string, theme: ResolvedTheme): string => {
  if (phase === 'running') return theme.success;
  if (phase === 'paused') return theme.warning ?? theme.textMuted;
  return theme.textMuted;
};

const phaseLabel = (phase: string): string => {
  if (phase === 'idle') return 'Ready';
  if (phase === 'running') return 'Recording';
  if (phase === 'paused') return 'Paused';
  return 'Stopped';
};

export interface TimerRecordingScreenProps {
  readonly navigation?: { navigate: (route: string, params?: unknown) => void };
}

type Styles = ReturnType<typeof createStyles>;

function LandscapeHeartRateBadge({
  liveHr,
  maxHr,
  theme,
  styles
}: {
  readonly liveHr: number | null;
  readonly maxHr: number;
  readonly theme: ResolvedTheme;
  readonly styles: Styles;
}): JSX.Element | null {
  if (liveHr === null) {
    return null;
  }
  const activeZone = getZoneForBpm(liveHr, maxHr);
  const zoneColor = activeZone
    ? (theme.heartRateZones[activeZone.zone - 1] ?? theme.primary)
    : theme.primary;

  return (
    <View style={styles.landscapeHrRow}>
      <Ionicons name="heart" size={20} color={zoneColor} />
      <Text style={styles.landscapeHrValue}>{liveHr}</Text>
      <Text style={styles.landscapeHrUnit}>bpm</Text>
      {activeZone ? (
        <View style={[styles.landscapeZoneBadge, { borderColor: zoneColor }]}>
          <View style={[styles.landscapeZoneDot, { backgroundColor: zoneColor }]} />
          <Text style={styles.landscapeZoneText}>{`${activeZone.code} · ${activeZone.name}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LandscapeLiveTimerView({
  phase,
  elapsedSec,
  activityType,
  liveHr,
  maxHr,
  onPause,
  onResume,
  onStop,
  theme,
  styles
}: {
  readonly phase: 'running' | 'paused';
  readonly elapsedSec: number;
  readonly activityType: string;
  readonly liveHr: number | null;
  readonly maxHr: number;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly theme: ResolvedTheme;
  readonly styles: Styles;
}): JSX.Element {
  return (
    <View style={styles.landscapeContainer}>
      <View style={styles.timerPane}>
        <Text style={styles.heroTimer}>{formatElapsed(elapsedSec)}</Text>
        <Text style={styles.heroLabel}>{activityType}</Text>
        <LandscapeHeartRateBadge liveHr={liveHr} maxHr={maxHr} theme={theme} styles={styles} />
      </View>
      <View style={styles.buttonPane}>
        {phase === 'running' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause recording"
              onPress={onPause}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressedLight : null
              ]}
            >
              <Ionicons name="pause" size={24} color={theme.text} />
              <Text style={styles.secondaryButtonLabel}>Pause</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={onStop}
              style={({ pressed }) => [styles.dangerButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="stop" size={24} color={theme.onPrimary} />
              <Text style={styles.dangerButtonLabel}>Stop</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume recording"
              onPress={onResume}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="play" size={24} color={theme.onPrimary} />
              <Text style={styles.primaryButtonLabel}>Resume</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={onStop}
              style={({ pressed }) => [styles.dangerButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="stop" size={24} color={theme.onPrimary} />
              <Text style={styles.dangerButtonLabel}>Stop</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function StoppedSummaryCard({
  finalDurationSec,
  activityType,
  heartRateSummary,
  name,
  onChangeName,
  isSaving,
  onSave,
  onDiscard,
  theme,
  styles
}: {
  readonly finalDurationSec: number;
  readonly activityType: string;
  readonly heartRateSummary: TimerHeartRateSummary | null;
  readonly name: string;
  readonly onChangeName: (value: string) => void;
  readonly isSaving: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly theme: ResolvedTheme;
  readonly styles: Styles;
}): JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="checkmark-circle" size={18} color={theme.success} />
        <Text style={styles.cardLabel}>Recording complete</Text>
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatElapsed(finalDurationSec)}</Text>
          <Text style={styles.summaryLabel}>duration</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activityType}</Text>
          <Text style={styles.summaryLabel}>type</Text>
        </View>
        {heartRateSummary ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {`${heartRateSummary.average}/${heartRateSummary.max}`}
            </Text>
            <Text style={styles.summaryLabel}>HR avg/max</Text>
          </View>
        ) : null}
      </View>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder="Name this activity (optional)"
        placeholderTextColor={theme.textMuted}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save as activity"
        disabled={isSaving}
        onPress={onSave}
        style={({ pressed }) => [
          styles.primaryButton,
          isSaving ? styles.buttonDisabled : null,
          pressed && !isSaving ? styles.buttonPressed : null
        ]}
      >
        <Ionicons name="save-outline" size={18} color={theme.onPrimary} />
        <Text style={styles.primaryButtonLabel}>{isSaving ? 'Saving…' : 'Save as activity'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        disabled={isSaving}
        onPress={onDiscard}
        style={styles.discardLink}
      >
        <Text style={styles.discardLinkLabel}>Discard recording</Text>
      </Pressable>
    </View>
  );
}

export function TimerRecordingScreen({
  navigation: navigationProp
}: TimerRecordingScreenProps = {}): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navContext = useContext(NavigationContext);
  const navigation =
    navigationProp ??
    (navContext as { navigate: (route: string, params?: unknown) => void } | undefined);
  const hr = useHeartRate();
  const userProfile = useUserProfile();
  const { maxHr } = useMemo(() => resolveMaxHeartRate({ profile: userProfile }), [userProfile]);

  const {
    phase,
    activityType,
    intervalMinutes,
    elapsedSec,
    finalDurationSec,
    heartRateSummary,
    error,
    isSaving,
    setActivityType,
    setIntervalMinutes,
    start,
    pause,
    resume,
    stop,
    save,
    discard
  } = useTimerRecording();

  const [name, setName] = useState('');
  const [customIntervalText, setCustomIntervalText] = useState('');

  const isLive = phase === 'running' || phase === 'paused';

  useEffect(() => {
    if (isLive) {
      void activateKeepAwakeAsync();
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {
        // Orientation lock may be unavailable on some platforms.
      });
    } else {
      void deactivateKeepAwake();
      void ScreenOrientation.unlockAsync().catch(() => {
        // Ignore unlock failures.
      });
    }
    return () => {
      void deactivateKeepAwake();
      void ScreenOrientation.unlockAsync().catch(() => {
        // Ignore unlock failures.
      });
    };
  }, [isLive]);

  const handleSave = async () => {
    const savedActivity = await save(name);
    setName('');
    if (savedActivity?.id) {
      navigation?.navigate(STACK_ROUTES.ActivityDetail, {
        activityId: savedActivity.id
      });
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard recording?', 'This deletes the session. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => discard() }
    ]);
  };

  const handleCustomInterval = () => {
    const parsed = Number.parseInt(customIntervalText.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setIntervalMinutes(parsed);
      setCustomIntervalText('');
    }
  };

  if (phase === 'running' || phase === 'paused') {
    return (
      <LandscapeLiveTimerView
        phase={phase}
        elapsedSec={elapsedSec}
        activityType={activityType}
        liveHr={hr.liveHr}
        maxHr={maxHr}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        theme={theme}
        styles={styles}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {phase === 'idle' ? <HeartRateCard /> : null}

      {phase === 'idle' ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Activity type</Text>
          <View style={styles.chips}>
            {Array.from(NO_GPS_ACTIVITY_TYPES).map(candidate => {
              const isSelected = candidate === activityType;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  accessibilityLabel={candidate}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setActivityType(candidate)}
                  style={({ pressed }) => [
                    styles.chip,
                    isSelected ? styles.chipSelected : null,
                    pressed ? styles.buttonPressedLight : null
                  ]}
                >
                  <Text style={[styles.chipLabel, isSelected ? styles.chipLabelSelected : null]}>
                    {candidate}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {phase === 'idle' ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Vocal announcement interval (minutes)</Text>
          <View style={styles.chips}>
            {INTERVAL_PRESETS.map(value => {
              const isSelected = value === intervalMinutes;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} minutes`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setIntervalMinutes(value)}
                  style={({ pressed }) => [
                    styles.chip,
                    isSelected ? styles.chipSelected : null,
                    pressed ? styles.buttonPressedLight : null
                  ]}
                >
                  <Text style={[styles.chipLabel, isSelected ? styles.chipLabelSelected : null]}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.intervalInputRow}>
            <TextInput
              accessibilityLabel="Custom interval in minutes"
              value={customIntervalText}
              onChangeText={setCustomIntervalText}
              keyboardType="numeric"
              placeholder="Custom minutes"
              placeholderTextColor={theme.textMuted}
              style={styles.intervalInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set custom interval"
              onPress={handleCustomInterval}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressedLight : null
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Set</Text>
            </Pressable>
          </View>
          <Text style={styles.heroLabel}>Current: {intervalMinutes} min</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(phase, theme) }]} />
          <Text style={styles.phase}>{phaseLabel(phase)}</Text>
        </View>
        <Text style={styles.heroTimer}>
          {formatElapsed(phase === 'stopped' ? finalDurationSec : elapsedSec)}
        </Text>
        <Text style={styles.heroLabel}>
          {phase === 'idle' ? 'Press start to begin' : activityType}
        </Text>
      </View>

      {phase === 'idle' ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start timer recording"
            onPress={start}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
          >
            <Ionicons name="play" size={20} color={theme.onPrimary} />
            <Text style={styles.primaryButtonLabel}>Start</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'stopped' ? (
        <StoppedSummaryCard
          finalDurationSec={finalDurationSec}
          activityType={activityType}
          heartRateSummary={heartRateSummary}
          name={name}
          onChangeName={setName}
          isSaving={isSaving}
          onSave={() => {
            void handleSave();
          }}
          onDiscard={handleDiscard}
          theme={theme}
          styles={styles}
        />
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
