import { ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRecording } from '../hooks/useRecording';
import type {
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingSummary
} from '../services/gpsTracker';
import { PROFILE_LABELS, PROFILES } from '../services/profiles';

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
const RADIUS = { card: 16, pill: 24, chip: 20, button: 14 } as const;
const METERS_PER_KILOMETER = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

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

const formatSpeed = (metersPerSecond: number | null): string =>
  metersPerSecond === null ? '—' : `${(metersPerSecond * 3.6).toFixed(1)} km/h`;

const formatAltitude = (meters: number | null): string =>
  meters === null ? '—' : `${Math.round(meters)} m`;

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
    liveStats,
    summary,
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
    discardUnfinished
  } = useRecording();
  const [profile, setProfile] = useState<Profile>('walking');
  // Which live stat is promoted to the hero (large) position. The user taps
  // a compact tile to promote it; tapping the hero cycles back to elapsed time.
  const [heroStat, setHeroStat] = useState<'time' | 'distance' | 'speed' | 'altitude'>('time');

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { marginTop: insets.top + SPACING.md }]}>
        <Text style={styles.title}>Record</Text>
        <Text style={styles.subtitle}>{availabilityText(capabilities)}</Text>
      </View>

      {unfinished.length > 0 ? (
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
                <Text style={styles.cardHint}>
                  {new Date(session.startedAtUtcMs).toLocaleString()}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard unfinished recording"
                onPress={() => {
                  void discardUnfinished(session.sessionId);
                }}
                style={({ pressed }) => [
                  styles.dangerButton,
                  pressed ? styles.buttonPressed : null
                ]}
              >
                <Text style={styles.dangerButtonLabel}>Discard</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <SessionCard phase={state.phase} liveStats={liveStats} styles={styles} theme={theme} />

      <LiveStatsCard
        liveStats={liveStats}
        heroStat={heroStat}
        onPromote={setHeroStat}
        styles={styles}
      />

      {state.phase === 'idle' ? (
        <ProfileCard profile={profile} onSelect={setProfile} styles={styles} />
      ) : null}
      {isLive && state.phase === 'recording' ? (
        <View style={styles.profileBadge}>
          <Ionicons name="walk-outline" size={16} color={theme.primary} />
          <Text style={styles.profileBadgeLabel}>{PROFILE_LABELS[profile]}</Text>
        </View>
      ) : null}

      <RecordingActions
        phase={state.phase}
        isBusy={isBusy}
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
        styles={styles}
      />

      {state.phase === 'stopped-unsaved' ? (
        <LastSessionCard
          summary={summary}
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

function SessionCard({ phase, liveStats, styles, theme }: SessionCardProps): JSX.Element {
  const phaseColor = phaseColorFor(phase, theme);

  return (
    <View style={styles.card}>
      <View style={styles.sessionHeader}>
        <View style={[styles.statusDot, { backgroundColor: phaseColor }]} />
        <Text style={styles.phase}>{PHASE_LABEL[phase] ?? phase}</Text>
        {phase === 'recording' ? (
          <View style={styles.recordingPulse}>
            <Ionicons name="radio-button-on" size={12} color={theme.danger} />
          </View>
        ) : null}
      </View>
      <GpsStatusRow liveStats={liveStats} phase={phase} styles={styles} theme={theme} />
    </View>
  );
}

type StatKey = 'time' | 'distance' | 'speed' | 'altitude';

interface StatDef {
  readonly key: StatKey;
  readonly label: string;
  readonly icon: string;
}

const STAT_DEFS: readonly StatDef[] = [
  { key: 'time', label: 'Elapsed', icon: 'time-outline' },
  { key: 'distance', label: 'Distance', icon: 'map-outline' },
  { key: 'speed', label: 'Speed', icon: 'speedometer-outline' },
  { key: 'altitude', label: 'Altitude', icon: 'trending-up-outline' }
];

const statValue = (key: StatKey, liveStats: LiveStats | null): string => {
  if (!liveStats) {
    return key === 'time' ? '0:00' : '—';
  }
  switch (key) {
    case 'time':
      return formatElapsed(liveStats.elapsedSec);
    case 'distance':
      return formatDistance(liveStats.distanceMeters);
    case 'speed':
      return formatSpeed(liveStats.currentSpeedMps);
    case 'altitude':
      return formatAltitude(liveStats.altitudeM);
  }
};

interface LiveStatsCardProps {
  readonly liveStats: LiveStats | null;
  readonly heroStat: StatKey;
  readonly onPromote: (key: StatKey) => void;
  readonly styles: Styles;
}

function LiveStatsCard({
  liveStats,
  heroStat,
  onPromote,
  styles
}: LiveStatsCardProps): JSX.Element {
  const heroDef = STAT_DEFS.find(def => def.key === heroStat) ?? STAT_DEFS[0];
  const compactDefs = STAT_DEFS.filter(def => def.key !== heroStat);

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Live stats</Text>
      <Text style={styles.tapHint}>Tap a stat to enlarge it</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Promote ${heroDef.label} (currently enlarged)`}
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
        <Text style={styles.heroValue}>{statValue(heroStat, liveStats)}</Text>
      </Pressable>
      <View style={styles.tiles}>
        {compactDefs.map(def => (
          <Pressable
            key={def.key}
            accessibilityRole="button"
            accessibilityLabel={`Enlarge ${def.label}`}
            onPress={() => onPromote(def.key)}
            style={({ pressed }) => [styles.tile, pressed ? styles.tilePressed : null]}
          >
            <View style={styles.tileHeader}>
              <Ionicons
                name={def.icon as never}
                size={14}
                color={styles.tileLabel.color as string}
              />
              <Text style={styles.tileLabel}>{def.label}</Text>
            </View>
            <Text style={styles.tileValue}>{statValue(def.key, liveStats)}</Text>
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

interface RecordingActionsProps {
  readonly phase: string;
  readonly isBusy: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly styles: Styles;
}

function RecordingActions({
  phase,
  isBusy,
  onStart,
  onPause,
  onResume,
  onStop,
  styles
}: RecordingActionsProps): JSX.Element {
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
            <Ionicons name="pause" size={18} color={styles.secondaryButtonLabel.color as string} />
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
      ) : null}
      {phase === 'paused' ? (
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
      ) : null}
    </View>
  );
}

interface LastSessionCardProps {
  readonly summary: RecordingSummary | null;
  readonly onSave: (name: string) => Promise<void>;
  readonly onDiscard: () => Promise<void>;
  readonly isSaving: boolean;
  readonly styles: Styles;
  readonly theme: ResolvedTheme;
}

function LastSessionCard({
  summary,
  onSave,
  onDiscard,
  isSaving,
  styles,
  theme
}: LastSessionCardProps): JSX.Element {
  const [name, setName] = useState('');
  const fixCount = summary?.meta.fixCount ?? 0;
  const distanceKm = summary ? (summary.liveStats.distanceMeters / 1000).toFixed(2) : '—';
  const duration = summary ? formatElapsed(summary.liveStats.elapsedSec) : '—';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="checkmark-circle" size={18} color={theme.success} />
        <Text style={styles.cardLabel}>Recording complete</Text>
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{fixCount}</Text>
          <Text style={styles.summaryLabel}>fixes</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{distanceKm} km</Text>
          <Text style={styles.summaryLabel}>distance</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{duration}</Text>
          <Text style={styles.summaryLabel}>duration</Text>
        </View>
      </View>
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

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      flex: 1
    },
    header: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.sm
    },
    title: {
      color: theme.textStrong,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.5
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: SPACING.xs
    },
    card: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.lg
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginBottom: SPACING.sm
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    },
    sessionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm
    },
    statusDot: {
      borderRadius: 6,
      height: 12,
      width: 12
    },
    phase: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '700'
    },
    recordingPulse: {
      marginLeft: SPACING.xs
    },
    cardHint: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: SPACING.xs
    },
    gpsRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginTop: SPACING.xs
    },
    heroStat: {
      alignItems: 'center',
      marginBottom: SPACING.md,
      marginTop: SPACING.sm
    },
    heroValue: {
      color: theme.text,
      fontVariant: ['tabular-nums'],
      fontSize: 48,
      fontWeight: '800',
      letterSpacing: -1
    },
    heroLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '500',
      marginTop: SPACING.xs,
      textTransform: 'uppercase'
    },
    tapHint: {
      color: theme.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
      marginBottom: SPACING.xs
    },
    heroIconRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      justifyContent: 'center'
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.sm
    },
    tile: {
      marginBottom: SPACING.md,
      width: '33.33%'
    },
    tilePressed: {
      opacity: 0.6
    },
    tileHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginBottom: SPACING.xs
    },
    tileLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500'
    },
    tileValue: {
      color: theme.text,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      fontWeight: '600'
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.sm
    },
    chip: {
      borderColor: theme.border,
      borderRadius: RADIUS.chip,
      borderWidth: 1,
      marginBottom: SPACING.sm,
      marginRight: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    chipSelected: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
    },
    chipPressed: {
      opacity: 0.7
    },
    chipLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500'
    },
    chipLabelSelected: {
      color: theme.textStrong,
      fontWeight: '700'
    },
    actions: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg
    },
    actionRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.button,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    primaryButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    secondaryButtonLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600'
    },
    dangerButton: {
      alignItems: 'center',
      backgroundColor: theme.danger,
      borderRadius: RADIUS.button,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    dangerButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    discardLink: {
      alignItems: 'center',
      marginTop: SPACING.md,
      paddingVertical: SPACING.sm
    },
    discardLinkLabel: {
      color: theme.textMuted,
      fontSize: 14,
      textDecorationLine: 'underline'
    },
    buttonDisabled: {
      opacity: 0.5
    },
    buttonPressed: {
      opacity: 0.85
    },
    buttonPressedLight: {
      backgroundColor: theme.surfaceMuted
    },
    button: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.pill,
      marginTop: SPACING.sm,
      paddingVertical: SPACING.md
    },
    buttonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    input: {
      borderColor: theme.border,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      color: theme.text,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    profileBadge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: theme.primarySoft,
      borderRadius: RADIUS.chip,
      flexDirection: 'row',
      gap: SPACING.xs,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs
    },
    profileBadgeLabel: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '600'
    },
    recoveryRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.sm
    },
    recoveryInfo: {
      flex: 1
    },
    recoveryTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600'
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: SPACING.md
    },
    summaryItem: {
      alignItems: 'center'
    },
    summaryValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700'
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: SPACING.xs
    },
    errorCard: {
      alignItems: 'center',
      backgroundColor: theme.dangerSoft,
      borderColor: theme.danger,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.md
    },
    error: {
      color: theme.danger,
      flex: 1,
      fontSize: 14
    },
    linkButton: {
      marginTop: SPACING.xs
    },
    linkButtonLabel: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600'
    }
  });
