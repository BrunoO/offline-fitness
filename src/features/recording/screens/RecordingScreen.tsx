import { ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecording } from '../hooks/useRecording';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
const RADIUS = { card: 12, pill: 24 } as const;

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const describeAvailability = (canRecord: boolean, hasBarometer: boolean): string => {
  if (!canRecord) {
    return 'Recording is Android-only in this build.';
  }
  return hasBarometer ? 'Recording available · barometer detected' : 'Recording available';
};

/**
 * Phase 0 screen: proof that the local Expo module is wired end to end.
 *
 * Deliberately plain — the real screen (profiles, save sheet, stats, splits)
 * replaces it in Phase 4, keeping this file's theme and JSX conventions.
 */
export function RecordingScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { capabilities, isRecording, tick, error, start, stop } = useRecording();

  const availabilityText = capabilities
    ? describeAvailability(capabilities.canRecord, capabilities.hasBarometer)
    : 'Checking the recording module…';

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.lg }]}>
      <Text style={styles.title}>Record</Text>
      <Text style={styles.subtitle}>{availabilityText}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Live from the service</Text>
        <Text style={styles.elapsed}>{tick ? formatElapsed(tick.elapsedMs) : '—'}</Text>
        <Text style={styles.cardHint}>
          {tick ? `${tick.count} ticks received` : 'No ticks yet'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        onPress={() => {
          void (isRecording ? stop() : start());
        }}
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Text style={styles.buttonLabel}>{isRecording ? 'Stop recording' : 'Start recording'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface,
      paddingHorizontal: SPACING.lg
    },
    title: {
      color: theme.textStrong,
      fontSize: 28,
      fontWeight: '700'
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      marginBottom: SPACING.lg,
      marginTop: SPACING.xs
    },
    card: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      padding: SPACING.lg
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 13,
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    },
    elapsed: {
      color: theme.text,
      fontSize: 44,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      marginTop: SPACING.sm
    },
    cardHint: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: SPACING.xs
    },
    button: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.pill,
      marginTop: SPACING.lg,
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
      marginTop: SPACING.md
    }
  });
