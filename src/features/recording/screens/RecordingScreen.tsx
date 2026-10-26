import { ResolvedTheme, useTheme } from '@/theme';
import { SPACING, METERS_PER_KILOMETER, createStyles } from './RecordingScreen.styles';
import React, { JSX, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  Vibration,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRecording } from '../hooks/useRecording';
import { HeartRateCard } from '@/features/heart-rate';
import type {
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingMeta,
  RecordingSummary
} from '../services/gpsTracker';
import type { SplitEvent } from '../services/splits';
import { PROFILE_LABELS, PROFILES } from '../services/profiles';

const PROFILE_ICONS: Record<Profile, string> = {
  walking: 'walk-outline',
  running: 'fitness-outline',
  hiking: 'trail-sign-outline',
  cycling: 'bicycle-outline',
  swimming: 'water-outline'
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const METERS_PER_100M = 100;
const MIN_PACE_SPEED_MPS = 0.1;

export type RateDisplayMode = 'pace' | 'speed';

export const defaultRateModeForProfile = (profile: Profile): RateDisplayMode =>
  profile === 'cycling' ? 'speed' : 'pace';

const formatElapsed = (elapsedSec: number): string => {
  const hours = Math.floor(elapsedSec / SECONDS_PER_HOUR);
  const minutes = Math.floor((elapsedSec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = elapsedSec % SECONDS_PER_MINUTE;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatDistance = (meters: number): string =>
  `${(meters / METERS_PER_KILOMETER).toFixed(2)} km`;

export const formatSpeed = (metersPerSecond: number | null): string =>
  metersPerSecond === null ? '—' : `${(metersPerSecond * 3.6).toFixed(1)} km/h`;

export const formatPace = (metersPerSecond: number | null, profile: Profile): string => {
  if (metersPerSecond === null || metersPerSecond < MIN_PACE_SPEED_MPS) {
    return '—';
  }
  const unitMeters = profile === 'swimming' ? METERS_PER_100M : METERS_PER_KILOMETER;
  const unitSuffix = profile === 'swimming' ? '/100m' : '/km';
  const totalSeconds = Math.round(unitMeters / metersPerSecond);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, '0')} ${unitSuffix}`;
};

export const formatRate = (
  metersPerSecond: number | null,
  profile: Profile,
  mode: RateDisplayMode
): string =>
  mode === 'pace' ? formatPace(metersPerSecond, profile) : formatSpeed(metersPerSecond);

export const computeAverageSpeedMps = (liveStats: LiveStats): number | null => {
  if (liveStats.elapsedSec <= 0 || liveStats.distanceMeters <= 0) {
    return null;
  }
  return liveStats.distanceMeters / liveStats.elapsedSec;
};

export const formatElevationGain = (
  meters: number | null | undefined,
  profile: Profile
): string => {
  if (profile === 'swimming') {
    return '0 m';
  }
  if (meters == null) {
    return '—';
  }
  return `+${Math.round(meters)} m`;
};

export const formatSplitDistance = (meters: number): string =>
  meters < 950 ? `${Math.round(meters)} m` : `${(meters / METERS_PER_KILOMETER).toFixed(2)} km`;

export const formatSplitRate = (
  split: SplitEvent,
  profile: Profile,
  rateMode: RateDisplayMode
): string => {
  const speedMps =
    split.splitDurationMs > 0 ? (split.splitDistanceMeters * 1000) / split.splitDurationMs : null;
  return formatRate(speedMps, profile, rateMode);
};

const formatAltitude = (meters: number | null): string =>
  meters === null ? '—' : `${Math.round(meters)} m`;

const formatSlope = (slopePercent: number | null | undefined): string => {
  if (slopePercent == null) {
    return '—';
  }
  const sign = slopePercent >= 0 ? '+' : '';
  return `${sign}${slopePercent.toFixed(1)}%`;
};

const availabilityText = (capabilities: GpsTrackerCapabilities | null): string =>
  capabilities?.canRecord ? 'Ready to record' : 'Recording is Android-only in this build.';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  recording: 'Recording',
  paused: 'Paused',
  'stopped-unsaved': 'Stopped'
};

const gpsAccuracyColor = (meters: number, theme: ResolvedTheme): string => {
  if (meters < 10) {
    return theme.success;
  }
  if (meters < 25) {
    return theme.warning ?? theme.textMuted;
  }
  return theme.danger;
};

/**
 * Recording screen: profiles, live stats, save/discard flow.
 *
 * Visual hierarchy: elapsed time is the hero metric, distance secondary,
 * speed/altitude tertiary. Action buttons use colour to convey intent
 * (primary = start/save, danger = stop/discard, secondary = pause/resume).
 */
export function RecordingScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const {
    capabilities,
    state,
    activeProfile,
    liveStats,
    summary,
    splits = [],
    heartRateSummary,
    lastSplit,
    error,
    isBusy,
    isSaving,
    unfinished,
    start,
    pause,
    resume,
    stop,
    save,
    discard,
    saveUnfinished,
    discardUnfinished
  } = useRecording();
  const [profile, setProfile] = useState<Profile>('walking');
  // Which live stat is promoted to the hero (large) position. The user taps
  // a compact tile to promote it; tapping the hero cycles back to elapsed time.
  const [heroStat, setHeroStat] = useState<StatKey>('time');
  const [rateOverride, setRateOverride] = useState<{
    profile: Profile;
    mode: RateDisplayMode;
  } | null>(null);
  const [isScreenLocked, setIsScreenLocked] = useState(false);

  // Automatically reset screen lock if session is no longer live.
  useEffect(() => {
    if (state.phase !== 'recording' && state.phase !== 'paused') {
      setIsScreenLocked(false);
    }
  }, [state.phase]);

  // Keep the screen awake only while a session is live.
  useEffect(() => {
    const isLive = state.phase === 'recording' || state.phase === 'paused';
    if (isLive) {
      void activateKeepAwakeAsync();
    } else {
      void deactivateKeepAwake();
    }
    return () => {
      void deactivateKeepAwake();
    };
  }, [state.phase]);

  const isLive = state.phase === 'recording' || state.phase === 'paused';
  const displayedProfile = activeProfile ?? profile;
  const rateMode: RateDisplayMode =
    rateOverride?.profile === displayedProfile
      ? rateOverride.mode
      : defaultRateModeForProfile(displayedProfile);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.lg }}
      showsVerticalScrollIndicator={false}
    >
      {state.phase === 'idle' ? (
        <Text
          style={[
            styles.subtitle,
            { marginTop: insets.top + SPACING.md, marginHorizontal: SPACING.lg }
          ]}
        >
          {availabilityText(capabilities)}
        </Text>
      ) : null}

      {unfinished.length > 0 ? (
        <UnfinishedRecoveryCard
          unfinished={unfinished}
          isSaving={isSaving}
          onSave={saveUnfinished}
          onDiscard={discardUnfinished}
          styles={styles}
          theme={theme}
        />
      ) : null}

      <SessionCard
        phase={state.phase}
        liveStats={liveStats}
        isLocked={isScreenLocked}
        styles={styles}
        theme={theme}
      />
      <HeartRateCard />

      <LiveStatsCard
        liveStats={liveStats}
        profile={displayedProfile}
        rateMode={rateMode}
        onToggleRateMode={() => {
          setRateOverride({
            profile: displayedProfile,
            mode: rateMode === 'pace' ? 'speed' : 'pace'
          });
        }}
        heroStat={heroStat}
        onPromote={setHeroStat}
        isLocked={isScreenLocked}
        styles={styles}
      />

      {lastSplit ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Last split</Text>
          <Text style={styles.cardHint}>
            #{lastSplit.splitNumber} · {(lastSplit.splitDistanceMeters / 1000).toFixed(2)} km · pace{' '}
            {lastSplit.paceFormatted} /km
          </Text>
        </View>
      ) : null}

      {state.phase === 'idle' ? (
        <ProfileCard profile={profile} onSelect={setProfile} styles={styles} />
      ) : null}
      {isLive ? (
        <View style={styles.profileBadge}>
          <Ionicons
            name={PROFILE_ICONS[displayedProfile] as never}
            size={16}
            color={theme.primary}
          />
          <Text style={styles.profileBadgeLabel}>{PROFILE_LABELS[displayedProfile]}</Text>
        </View>
      ) : null}

      <RecordingActions
        phase={state.phase}
        isBusy={isBusy}
        isLocked={isScreenLocked}
        onStart={() => {
          void start(profile);
        }}
        onPause={() => {
          void pause();
        }}
        onResume={() => {
          void resume();
        }}
        onStop={() => {
          void stop();
        }}
        onLock={() => {
          setIsScreenLocked(true);
        }}
        onUnlock={() => {
          setIsScreenLocked(false);
        }}
        styles={styles}
        theme={theme}
      />

      {state.phase === 'stopped-unsaved' ? (
        <LastSessionCard
          summary={summary}
          splits={splits}
          profile={displayedProfile}
          rateMode={rateMode}
          heartRateSummary={heartRateSummary}
          onSave={save}
          onDiscard={discard}
          isSaving={isSaving}
          styles={styles}
          theme={theme}
        />
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text style={styles.error}>{error}</Text>
          {error.toLowerCase().includes('permission') ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void Linking.openSettings();
              }}
              style={styles.linkButton}
            >
              <Text style={styles.linkButtonLabel}>Open settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

interface SessionCardProps {
  readonly phase: string;
  readonly liveStats: LiveStats | null;
  readonly isLocked: boolean;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

function phaseColorFor(phase: string, theme: ResolvedTheme): string {
  if (phase === 'recording') {
    return theme.success;
  }
  if (phase === 'paused') {
    return theme.warning ?? theme.textMuted;
  }
  return theme.textMuted;
}

function GpsStatusRow({
  liveStats,
  phase,
  styles,
  theme
}: {
  readonly liveStats: LiveStats | null;
  readonly phase: string;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}): JSX.Element | null {
  if (liveStats?.gpsLost) {
    return (
      <View style={styles.gpsRow}>
        <Ionicons name="location-outline" size={14} color={theme.danger} />
        <Text style={[styles.cardHint, { color: theme.danger }]}>Waiting for GPS…</Text>
      </View>
    );
  }
  if (liveStats?.hAccM != null) {
    const color = gpsAccuracyColor(liveStats.hAccM, theme);
    return (
      <View style={styles.gpsRow}>
        <Ionicons name="locate-outline" size={14} color={color} />
        <Text style={[styles.cardHint, { color }]}>
          GPS: {Math.round(liveStats.hAccM)} m accuracy
        </Text>
      </View>
    );
  }
  if (phase === 'recording') {
    return (
      <View style={styles.gpsRow}>
        <Ionicons name="locate-outline" size={14} color={theme.textMuted} />
        <Text style={styles.cardHint}>Acquiring GPS…</Text>
      </View>
    );
  }
  return null;
}

function SessionCard({ phase, liveStats, isLocked, styles, theme }: SessionCardProps): JSX.Element {
  const phaseColor = phaseColorFor(phase, theme);

  return (
    <View style={styles.card}>
      <View style={styles.sessionHeaderRow}>
        <View style={styles.sessionHeader}>
          <View style={[styles.statusDot, { backgroundColor: phaseColor }]} />
          <Text style={styles.phase}>{PHASE_LABEL[phase] ?? phase}</Text>
          {phase === 'recording' ? (
            <View style={styles.recordingPulse}>
              <Ionicons name="radio-button-on" size={12} color={theme.danger} />
            </View>
          ) : null}
        </View>
        {isLocked ? (
          <View style={styles.sessionLockBadge}>
            <Ionicons name="lock-closed" size={12} color={theme.primary} />
            <Text style={styles.sessionLockBadgeLabel}>Screen locked</Text>
          </View>
        ) : null}
      </View>
      <GpsStatusRow liveStats={liveStats} phase={phase} styles={styles} theme={theme} />
    </View>
  );
}

type StatKey = 'time' | 'distance' | 'speed' | 'avgSpeed' | 'elevationGain' | 'altitude' | 'slope';

interface StatDef {
  readonly key: StatKey;
  readonly label: string;
  readonly icon: string;
}

const getStatDefs = (rateMode: RateDisplayMode): readonly StatDef[] => [
  { key: 'time', label: 'Elapsed', icon: 'time-outline' },
  { key: 'distance', label: 'Distance', icon: 'map-outline' },
  { key: 'speed', label: rateMode === 'pace' ? 'Pace' : 'Speed', icon: 'speedometer-outline' },
  {
    key: 'avgSpeed',
    label: rateMode === 'pace' ? 'Avg pace' : 'Avg speed',
    icon: 'analytics-outline'
  },
  { key: 'elevationGain', label: 'Elev gain', icon: 'arrow-up-outline' },
  { key: 'altitude', label: 'Altitude', icon: 'triangle-outline' },
  { key: 'slope', label: 'Slope', icon: 'trending-up-outline' }
];

const statValue = (
  key: StatKey,
  liveStats: LiveStats | null,
  profile: Profile,
  rateMode: RateDisplayMode
): string => {
  if (!liveStats) {
    return key === 'time' ? '0:00' : '—';
  }
  switch (key) {
    case 'time':
      return formatElapsed(liveStats.elapsedSec);
    case 'distance':
      return formatDistance(liveStats.distanceMeters);
    case 'speed':
      return formatRate(liveStats.currentSpeedMps, profile, rateMode);
    case 'avgSpeed':
      return formatRate(computeAverageSpeedMps(liveStats), profile, rateMode);
    case 'elevationGain':
      return formatElevationGain(liveStats.elevationGainM, profile);
    case 'altitude':
      return formatAltitude(liveStats.altitudeM);
    case 'slope':
      return formatSlope(liveStats.slopePercent);
  }
};

const rateToggleText = (profile: Profile, rateMode: RateDisplayMode): string => {
  if (rateMode === 'pace') {
    return 'Show km/h';
  }
  return profile === 'swimming' ? 'Show /100m' : 'Show /km';
};

interface LiveStatsCardProps {
  readonly liveStats: LiveStats | null;
  readonly profile: Profile;
  readonly rateMode: RateDisplayMode;
  readonly onToggleRateMode: () => void;
  readonly heroStat: StatKey;
  readonly onPromote: (key: StatKey) => void;
  readonly isLocked?: boolean;
  readonly styles: Styles;
}

function LiveStatsCard({
  liveStats,
  profile,
  rateMode,
  onToggleRateMode,
  heroStat,
  onPromote,
  isLocked = false,
  styles
}: LiveStatsCardProps): JSX.Element {
  const statDefs = getStatDefs(rateMode);
  const heroDef = statDefs.find(def => def.key === heroStat) ?? statDefs[0];
  const compactDefs = statDefs.filter(def => def.key !== heroStat);

  return (
    <View style={styles.card}>
      <View style={styles.liveStatsHeader}>
        <Text style={styles.cardLabel}>Live stats</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rateMode === 'pace' ? 'Switch to speed (km/h)' : 'Switch to pace'}
          disabled={isLocked}
          onPress={onToggleRateMode}
          style={({ pressed }) => [
            styles.rateToggleButton,
            pressed && !isLocked ? styles.chipPressed : null
          ]}
        >
          <Text style={styles.rateToggleLabel}>{rateToggleText(profile, rateMode)}</Text>
        </Pressable>
      </View>
      <Text style={styles.tapHint}>
        {isLocked ? 'Screen locked · Touch controls disabled' : 'Tap a stat to enlarge it'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Promote ${heroDef.label} (currently enlarged)`}
        disabled={isLocked}
        onPress={() => {
          // Tapping the hero cycles back to elapsed time.
          if (heroStat !== 'time') {
            onPromote('time');
          }
        }}
        style={styles.heroStat}
      >
        <View style={styles.heroIconRow}>
          <Ionicons
            name={heroDef.icon as never}
            size={18}
            color={styles.heroLabel.color as string}
          />
          <Text style={styles.heroLabel}>{heroDef.label}</Text>
        </View>
        <Text style={styles.heroValue}>{statValue(heroStat, liveStats, profile, rateMode)}</Text>
      </Pressable>
      <View style={styles.tiles}>
        {compactDefs.map(def => (
          <Pressable
            key={def.key}
            accessibilityRole="button"
            accessibilityLabel={`Enlarge ${def.label}`}
            disabled={isLocked}
            onPress={() => onPromote(def.key)}
            style={({ pressed }) => [styles.tile, pressed && !isLocked ? styles.tilePressed : null]}
          >
            <View style={styles.tileHeader}>
              <Ionicons
                name={def.icon as never}
                size={14}
                color={styles.tileLabel.color as string}
              />
              <Text style={styles.tileLabel}>{def.label}</Text>
            </View>
            <Text style={styles.tileValue}>{statValue(def.key, liveStats, profile, rateMode)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface ProfileCardProps {
  readonly profile: Profile;
  readonly onSelect: (profile: Profile) => void;
  readonly styles: Styles;
}

function ProfileCard({ profile, onSelect, styles }: ProfileCardProps): JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Activity type</Text>
      <View style={styles.chips}>
        {PROFILES.map(candidate => {
          const isSelected = candidate === profile;
          return (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(candidate)}
              style={({ pressed }) => [
                styles.chip,
                isSelected ? styles.chipSelected : null,
                pressed ? styles.chipPressed : null
              ]}
            >
              <Text style={[styles.chipLabel, isSelected ? styles.chipLabelSelected : null]}>
                {PROFILE_LABELS[candidate]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const HOLD_DURATION_MS = 1500;

interface HoldToUnlockControlProps {
  readonly onUnlock: () => void;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

function HoldToUnlockControl({ onUnlock, styles, theme }: HoldToUnlockControlProps): JSX.Element {
  const [showHint, setShowHint] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const isUnlockedRef = useRef(false);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHintTimeout = () => {
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  };

  const handlePressIn = () => {
    clearHintTimeout();
    setShowHint(false);
    isUnlockedRef.current = false;
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (finished) {
        isUnlockedRef.current = true;
        try {
          Vibration.vibrate(80);
        } catch {
          // Ignore vibration failures if unsupported on device/platform
        }
        onUnlock();
      }
    });
  };

  const handlePressOut = () => {
    progress.stopAnimation();
    if (!isUnlockedRef.current) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false
      }).start();
      setShowHint(true);
      clearHintTimeout();
      hintTimeoutRef.current = setTimeout(() => {
        setShowHint(false);
      }, 2500);
    }
  };

  useEffect(() => {
    return () => {
      progress.stopAnimation();
      clearHintTimeout();
    };
  }, [progress]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  return (
    <View style={styles.unlockContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold to unlock screen"
        accessibilityHint="Press and hold for 1.5 seconds to unlock the screen"
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.unlockButton}
      >
        <Animated.View style={[styles.unlockProgressFill, { width: fillWidth }]} />
        <View style={styles.unlockContent}>
          <Ionicons name="lock-closed" size={20} color={theme.primary} />
          <View style={styles.unlockTextColumn}>
            <Text style={styles.unlockButtonLabel}>Hold to unlock</Text>
            <Text style={styles.unlockSubtext}>Press and hold for 1.5s</Text>
          </View>
        </View>
      </Pressable>
      {showHint ? <Text style={styles.unlockHint}>Keep holding until unlocked</Text> : null}
    </View>
  );
}

interface RecordingActionsProps {
  readonly phase: string;
  readonly isBusy: boolean;
  readonly isLocked: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly onLock: () => void;
  readonly onUnlock: () => void;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

function RecordingActions({
  phase,
  isBusy,
  isLocked,
  onStart,
  onPause,
  onResume,
  onStop,
  onLock,
  onUnlock,
  styles,
  theme
}: RecordingActionsProps): JSX.Element {
  if (isLocked) {
    return (
      <View style={styles.actions}>
        <HoldToUnlockControl onUnlock={onUnlock} styles={styles} theme={theme} />
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      {phase === 'idle' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start recording"
          disabled={isBusy}
          onPress={onStart}
          style={({ pressed }) => [
            styles.primaryButton,
            isBusy ? styles.buttonDisabled : null,
            pressed && !isBusy ? styles.buttonPressed : null
          ]}
        >
          <Ionicons name="play" size={20} color={styles.primaryButtonLabel.color as string} />
          <Text style={styles.primaryButtonLabel}>{isBusy ? 'Starting…' : 'Start recording'}</Text>
        </Pressable>
      ) : null}
      {phase === 'recording' ? (
        <>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause recording"
              onPress={onPause}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressedLight : null
              ]}
            >
              <Ionicons
                name="pause"
                size={18}
                color={styles.secondaryButtonLabel.color as string}
              />
              <Text style={styles.secondaryButtonLabel}>Pause</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={onStop}
              style={({ pressed }) => [styles.dangerButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="stop" size={18} color={styles.dangerButtonLabel.color as string} />
              <Text style={styles.dangerButtonLabel}>Stop</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lock screen against accidental touches"
            onPress={onLock}
            style={({ pressed }) => [
              styles.lockScreenButton,
              pressed ? styles.buttonPressedLight : null
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={theme.text} />
            <Text style={styles.lockScreenButtonLabel}>Lock screen (pocket & rain safe)</Text>
          </Pressable>
        </>
      ) : null}
      {phase === 'paused' ? (
        <>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume recording"
              onPress={onResume}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="play" size={18} color={styles.primaryButtonLabel.color as string} />
              <Text style={styles.primaryButtonLabel}>Resume</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={onStop}
              style={({ pressed }) => [styles.dangerButton, pressed ? styles.buttonPressed : null]}
            >
              <Ionicons name="stop" size={18} color={styles.dangerButtonLabel.color as string} />
              <Text style={styles.dangerButtonLabel}>Stop</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lock screen against accidental touches"
            onPress={onLock}
            style={({ pressed }) => [
              styles.lockScreenButton,
              pressed ? styles.buttonPressedLight : null
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={theme.text} />
            <Text style={styles.lockScreenButtonLabel}>Lock screen (pocket & rain safe)</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

interface LastSessionCardProps {
  readonly summary: RecordingSummary | null;
  readonly splits: SplitEvent[];
  readonly profile: Profile;
  readonly rateMode: RateDisplayMode;
  readonly heartRateSummary: { average: number; max: number } | null;
  readonly onSave: (name: string) => Promise<void>;
  readonly onDiscard: () => Promise<void>;
  readonly isSaving: boolean;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

const computeSummaryAverageSpeedMps = (summary: RecordingSummary | null): number | null => {
  if (!summary) {
    return null;
  }
  if (summary.liveStats.currentSpeedMps != null && summary.liveStats.currentSpeedMps > 0) {
    return summary.liveStats.currentSpeedMps;
  }
  const activeSeconds = summary.liveStats.movingTimeSec ?? summary.liveStats.elapsedSec;
  if (activeSeconds <= 0 || summary.liveStats.distanceMeters <= 0) {
    return null;
  }
  return summary.liveStats.distanceMeters / activeSeconds;
};

function SplitsBreakdownTable({
  splits,
  profile,
  rateMode,
  styles
}: {
  readonly splits: SplitEvent[];
  readonly profile: Profile;
  readonly rateMode: RateDisplayMode;
  readonly styles: Styles;
}): JSX.Element | null {
  if (splits.length === 0) {
    return null;
  }
  return (
    <View style={styles.splitsSection}>
      <Text style={styles.cardLabel}>Splits</Text>
      <View style={styles.splitsHeaderRow}>
        <Text style={styles.splitHeaderLabel}>Split</Text>
        <Text style={styles.splitHeaderLabel}>Distance</Text>
        <Text style={styles.splitHeaderLabel}>Time</Text>
        <Text style={styles.splitHeaderLabelRight}>{rateMode === 'pace' ? 'Pace' : 'Speed'}</Text>
      </View>
      {splits.map(split => (
        <View key={split.splitNumber} style={styles.splitRow}>
          <Text style={styles.splitCellText}>{`#${split.splitNumber}`}</Text>
          <Text style={styles.splitCellText}>{formatSplitDistance(split.splitDistanceMeters)}</Text>
          <Text style={styles.splitCellText}>
            {formatElapsed(Math.round(split.splitDurationMs / 1000))}
          </Text>
          <Text style={styles.splitCellTextRight}>{formatSplitRate(split, profile, rateMode)}</Text>
        </View>
      ))}
    </View>
  );
}

function LastSessionCard({
  summary,
  splits,
  profile,
  rateMode,
  heartRateSummary,
  onSave,
  onDiscard,
  isSaving,
  styles,
  theme
}: LastSessionCardProps): JSX.Element {
  const [name, setName] = useState('');
  const sessionProfile = (summary?.meta?.profile as Profile | undefined) ?? profile;
  const distanceKm = summary ? (summary.liveStats.distanceMeters / 1000).toFixed(2) : '—';
  const movingSec = summary?.liveStats.movingTimeSec ?? summary?.liveStats.elapsedSec;
  const movingTime = movingSec !== undefined ? formatElapsed(movingSec) : '—';
  const duration = summary ? formatElapsed(summary.liveStats.elapsedSec) : '—';
  const avgRate = formatRate(computeSummaryAverageSpeedMps(summary), sessionProfile, rateMode);
  const elevGain = summary
    ? formatElevationGain(summary.liveStats.elevationGainM, sessionProfile)
    : '—';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="checkmark-circle" size={18} color={theme.success} />
        <Text style={styles.cardLabel}>Recording complete</Text>
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{distanceKm} km</Text>
          <Text style={styles.summaryLabel}>distance</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{movingTime}</Text>
          <Text style={styles.summaryLabel}>moving time</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{duration}</Text>
          <Text style={styles.summaryLabel}>duration</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{avgRate}</Text>
          <Text style={styles.summaryLabel}>{rateMode === 'pace' ? 'avg pace' : 'avg speed'}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{elevGain}</Text>
          <Text style={styles.summaryLabel}>elev gain</Text>
        </View>
        {heartRateSummary ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {heartRateSummary.average}/{heartRateSummary.max}
            </Text>
            <Text style={styles.summaryLabel}>HR avg/max</Text>
          </View>
        ) : null}
      </View>
      <SplitsBreakdownTable
        splits={splits}
        profile={sessionProfile}
        rateMode={rateMode}
        styles={styles}
      />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name this activity (optional)"
        placeholderTextColor={theme.textMuted}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save as activity"
        disabled={isSaving}
        onPress={() => {
          void onSave(name);
        }}
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
        onPress={() => {
          Alert.alert(
            'Discard recording?',
            'This deletes the track and all recorded fixes. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  void onDiscard();
                }
              }
            ]
          );
        }}
        style={styles.discardLink}
      >
        <Text style={styles.discardLinkLabel}>Discard recording</Text>
      </Pressable>
    </View>
  );
}

interface UnfinishedRecoveryCardProps {
  readonly unfinished: RecordingMeta[];
  readonly isSaving: boolean;
  readonly onSave: (sessionId: string) => Promise<void>;
  readonly onDiscard: (sessionId: string) => Promise<void>;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

function UnfinishedRecoveryCard({
  unfinished,
  isSaving,
  onSave,
  onDiscard,
  styles,
  theme
}: UnfinishedRecoveryCardProps): JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="time-outline" size={18} color={theme.warning ?? theme.textMuted} />
        <Text style={styles.cardLabel}>Unfinished recording</Text>
      </View>
      {unfinished.map(session => (
        <View key={session.sessionId} style={styles.recoveryRow}>
          <View style={styles.recoveryInfo}>
            <Text style={styles.recoveryTitle}>
              {PROFILE_LABELS[session.profile as Profile] ?? session.profile}
            </Text>
            <Text style={styles.cardHint}>{new Date(session.startedAtUtcMs).toLocaleString()}</Text>
          </View>
          <View style={styles.recoveryActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save unfinished recording"
              disabled={isSaving}
              onPress={() => {
                void onSave(session.sessionId);
              }}
              style={({ pressed }) => [
                styles.recoverySaveButton,
                isSaving ? styles.buttonDisabled : null,
                pressed && !isSaving ? styles.buttonPressed : null
              ]}
            >
              <Text style={styles.primaryButtonLabel}>Save</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discard unfinished recording"
              disabled={isSaving}
              onPress={() => {
                Alert.alert(
                  'Discard unfinished recording?',
                  'This deletes the track and all recorded fixes. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () => {
                        void onDiscard(session.sessionId);
                      }
                    }
                  ]
                );
              }}
              style={({ pressed }) => [
                styles.recoveryDiscardButton,
                isSaving ? styles.buttonDisabled : null,
                pressed && !isSaving ? styles.buttonPressed : null
              ]}
            >
              <Text style={styles.dangerButtonLabel}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
