import { ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecording } from '../hooks/useRecording';
import type {
  GpsTrackerCapabilities,
  LiveStats,
  Profile,
  RecordingSummary
} from '../services/gpsTracker';
import { PROFILE_LABELS, PROFILES } from '../services/profiles';

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
const RADIUS = { card: 12, pill: 24, chip: 16 } as const;
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
  capabilities?.canRecord
    ? 'Recording is available on this device.'
    : 'Recording is Android-only in this build.';

/**
 * Phase 1 screen: the recorder driven end to end.
 *
 * Deliberately plain - the real screen (profiles picker, save sheet, stats,
 * splits) replaces it in Phase 4, keeping this file's theme and JSX
 * conventions.
 */
export function RecordingScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { capabilities, state, liveStats, summary, error, isBusy, start, pause, resume, stop } =
    useRecording();
  const [profile, setProfile] = useState<Profile>('walking');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.lg }}
    >
      <Text style={[styles.title, { marginTop: insets.top + SPACING.lg }]}>Record</Text>
      <Text style={styles.subtitle}>{availabilityText(capabilities)}</Text>

      <SessionCard phase={state.phase} sessionId={state.sessionId} styles={styles} />
      <LiveStatsCard liveStats={liveStats} styles={styles} />

      {state.phase === 'idle' ? (
        <ProfileCard profile={profile} onSelect={setProfile} styles={styles} />
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

      {summary ? <LastSessionCard summary={summary} styles={styles} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

interface SessionCardProps {
  readonly phase: string;
  readonly sessionId?: string;
  readonly styles: Styles;
}

function SessionCard({ phase, sessionId, styles }: SessionCardProps): JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Session</Text>
      <Text style={styles.phase}>{phase}</Text>
      {sessionId ? <Text style={styles.cardHint}>{sessionId}</Text> : null}
    </View>
  );
}

interface LiveStatsCardProps {
  readonly liveStats: LiveStats | null;
  readonly styles: Styles;
}

function LiveStatsCard({ liveStats, styles }: LiveStatsCardProps): JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Live</Text>
      <View style={styles.tiles}>
        <StatTile
          label="Time"
          value={liveStats ? formatElapsed(liveStats.elapsedSec) : '—'}
          styles={styles}
        />
        <StatTile
          label="Distance"
          value={liveStats ? formatDistance(liveStats.distanceMeters) : '—'}
          styles={styles}
        />
        <StatTile
          label="Speed"
          value={formatSpeed(liveStats ? liveStats.currentSpeedMps : null)}
          styles={styles}
        />
        <StatTile
          label="Altitude"
          value={formatAltitude(liveStats ? liveStats.altitudeM : null)}
          styles={styles}
        />
      </View>
    </View>
  );
}

interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly styles: Styles;
}

function StatTile({ label, value, styles }: StatTileProps): JSX.Element {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
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
      <Text style={styles.cardLabel}>Profile</Text>
      <View style={styles.chips}>
        {PROFILES.map(candidate => {
          const isSelected = candidate === profile;
          return (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(candidate)}
              style={[styles.chip, isSelected ? styles.chipSelected : null]}
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
        <ActionButton label="Start recording" onPress={onStart} disabled={isBusy} styles={styles} />
      ) : null}
      {phase === 'recording' ? (
        <ActionButton label="Pause" onPress={onPause} styles={styles} />
      ) : null}
      {phase === 'paused' ? (
        <ActionButton label="Resume" onPress={onResume} styles={styles} />
      ) : null}
      {phase === 'idle' ? null : (
        <ActionButton label="Stop recording" onPress={onStop} styles={styles} />
      )}
    </View>
  );
}

interface LastSessionCardProps {
  readonly summary: RecordingSummary;
  readonly styles: Styles;
}

function LastSessionCard({ summary, styles }: LastSessionCardProps): JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Last session</Text>
      <Text style={styles.cardHint}>
        {summary.meta.sessionId} · {summary.meta.fixCount ?? 0} fixes
      </Text>
      <Text style={styles.cardHint} numberOfLines={2}>
        {summary.meta.logUri}
      </Text>
    </View>
  );
}

interface ActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly styles: Styles;
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  styles
}: ActionButtonProps): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      flex: 1
    },
    title: {
      color: theme.textStrong,
      fontSize: 28,
      fontWeight: '700',
      marginHorizontal: SPACING.lg
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      marginBottom: SPACING.lg,
      marginHorizontal: SPACING.lg,
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
    cardLabel: {
      color: theme.textMuted,
      fontSize: 13,
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    },
    phase: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
      marginTop: SPACING.sm
    },
    cardHint: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: SPACING.xs
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.sm
    },
    tile: {
      marginBottom: SPACING.md,
      width: '50%'
    },
    tileLabel: {
      color: theme.textMuted,
      fontSize: 12
    },
    tileValue: {
      color: theme.text,
      fontSize: 20,
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
      paddingVertical: SPACING.xs
    },
    chipSelected: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
    },
    chipLabel: {
      color: theme.text,
      fontSize: 14
    },
    chipLabelSelected: {
      color: theme.textStrong,
      fontWeight: '700'
    },
    actions: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg
    },
    button: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.pill,
      marginTop: SPACING.sm,
      paddingVertical: SPACING.md
    },
    buttonPressed: {
      backgroundColor: theme.primaryPressed
    },
    buttonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    error: {
      color: theme.danger,
      fontSize: 14,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md
    }
  });
