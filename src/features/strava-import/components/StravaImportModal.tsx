import { ResolvedTheme, useTheme } from '@/theme';
import { useActivitiesSyncContext } from '@/features/activities';
import { simpleLogger } from '@/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { ImportProgress, ImportSummary } from '../types/import.types';
import { importStravaExport, pickStravaExportFile } from '../services/importStravaExport';

/**
 * Import a Strava "Download your account" archive.
 *
 * Strava's bulk export needs no API subscription, so this is the replacement
 * path for the API connection: pick the .zip, read activities.csv plus every
 * GPX track, and write the same local records and streams the API sync writes.
 */

interface StravaImportModalProps {
  visible: boolean;
  onClose: () => void;
}

type Stage = 'idle' | 'running' | 'finished' | 'failed';

const STRAVA_EXPORT_URL = 'https://www.strava.com/athlete/delete_your_account';

/**
 * Keep-awake tag: the import runs on the JS thread, and Android throttles (and
 * eventually freezes) a backgrounded app, so a screen timeout used to stall a
 * run for minutes. The lock is taken for the duration of the import only.
 */
const KEEP_AWAKE_TAG = 'strava-import';

/**
 * A progress update per track is 2,000 React renders contending with the
 * import for the JS thread. Phase changes and the final value always pass.
 */
const PROGRESS_INTERVAL_MS = 250;

function formatNumber(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Compact duration for the timing report: `840 ms`, `12.4 s`, `3 m 05 s`. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} m ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
}

/** Human label for the current import phase. */
function phaseLabel(progress: ImportProgress | null): string {
  if (!progress) return 'Preparing…';
  switch (progress.phase) {
    case 'opening':
      return 'Reading archive…';
    case 'activities':
      return `Saving activities ${progress.processed}/${progress.total}`;
    case 'streams':
      return `Importing tracks ${progress.processed}/${progress.total}`;
    case 'done':
      return 'Finishing…';
    default:
      return 'Working…';
  }
}

export function StravaImportModal({ visible, onClose }: StravaImportModalProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { reloadActivitiesFromLocalStorage } = useActivitiesSyncContext();
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const lastPhaseRef = useRef<ImportProgress['phase'] | null>(null);

  /** Throttled progress sink: 2,000 setState calls would fight the import. */
  const handleProgress = useCallback((next: ImportProgress) => {
    const now = Date.now();
    if (
      next.phase === lastPhaseRef.current &&
      now - lastProgressAtRef.current < PROGRESS_INTERVAL_MS
    ) {
      return;
    }
    lastPhaseRef.current = next.phase;
    lastProgressAtRef.current = now;
    setProgress(next);
  }, []);

  const reset = useCallback(() => {
    setStage('idle');
    setProgress(null);
    setSummary(null);
    setError(null);
    cancelledRef.current = false;
    lastPhaseRef.current = null;
    lastProgressAtRef.current = 0;
  }, []);

  const close = useCallback(() => {
    if (stage === 'running') {
      cancelledRef.current = true;
      return;
    }
    reset();
    onClose();
  }, [onClose, reset, stage]);

  const startImport = useCallback(async () => {
    setError(null);
    setSummary(null);
    cancelledRef.current = false;
    lastPhaseRef.current = null;
    lastProgressAtRef.current = 0;
    setStage('running');
    setProgress({ phase: 'opening', processed: 0, total: 0 });
    const startedAt = Date.now();

    // Keep the screen on for the duration: Android throttles the JS thread once
    // the app is no longer foreground, which is what turned a few minutes of
    // work into something that appeared to stall for a minute per track.
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);

    try {
      const picked = await pickStravaExportFile();
      if (!picked) {
        setStage('idle');
        setProgress(null);
        return;
      }

      simpleLogger.log('Strava export import started', { file: picked.name, size: picked.size });

      const result = await importStravaExport(picked, {
        onProgress: handleProgress,
        shouldCancel: () => cancelledRef.current
      });

      setSummary(result);
      setStage('finished');

      // Make the freshly imported activities visible without a network call.
      await reloadActivitiesFromLocalStorage();

      simpleLogger.log('Strava export import completed', {
        durationMs: Date.now() - startedAt,
        ...result
      });
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : String(importError);
      simpleLogger.error('Strava export import failed', { message });
      setError(message);
      setStage('failed');
    } finally {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    }
  }, [handleProgress, reloadActivitiesFromLocalStorage]);

  const progressRatio =
    progress && progress.total > 0 ? Math.min(1, progress.processed / progress.total) : 0;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      statusBarTranslucent={true}
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Import a Strava archive</Text>

            {stage === 'idle' ? (
              <>
                <Text style={styles.body}>
                  Strava can email you a ZIP archive of everything you have recorded, without a
                  subscription. In Strava, open Settings → My Account → “Download or delete your
                  account”, request the archive, unzip nothing — this screen reads the .zip
                  directly.
                </Text>
                <Pressable onPress={() => Linking.openURL(STRAVA_EXPORT_URL).catch(() => {})}>
                  <Text style={styles.link}>Open Strava account settings</Text>
                </Pressable>
                <Text style={styles.note}>
                  Imported activities replace existing ones with the same id, and tracks that are
                  already stored are left untouched, so importing twice is safe.
                </Text>
              </>
            ) : null}

            {stage === 'running' ? (
              <>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={styles.body}>{phaseLabel(progress)}</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${progressRatio * 100}%` }]} />
                </View>
                <Text style={styles.note}>
                  The screen stays awake while this runs. A full archive takes a few minutes;
                  imported activities are saved as they are read, so stopping early keeps what is
                  already done and the next attempt resumes without copying the archive again.
                </Text>
              </>
            ) : null}

            {stage === 'finished' && summary ? (
              <>
                <Text style={styles.body}>
                  {summary.cancelled
                    ? 'Import stopped. Everything read so far has been saved.'
                    : 'Import finished.'}
                </Text>
                <View style={styles.statsBlock}>
                  <Text style={styles.statLine}>
                    {formatNumber(summary.activitiesImported, 'activity', 'activities')} saved
                  </Text>
                  <Text style={styles.statLine}>
                    {formatNumber(summary.streamsImported, 'track', 'tracks')} imported
                  </Text>
                  {summary.streamsAlreadyPresent > 0 ? (
                    <Text style={styles.statLine}>
                      {formatNumber(summary.streamsAlreadyPresent, 'track', 'tracks')} already
                      present
                    </Text>
                  ) : null}
                  {summary.streamsWithoutTrack > 0 ? (
                    <Text style={styles.statLine}>
                      {formatNumber(summary.streamsWithoutTrack, 'activity', 'activities')} without
                      GPS data
                    </Text>
                  ) : null}
                  {summary.activitiesWithoutFile > 0 ? (
                    <Text style={styles.statLine}>
                      {formatNumber(
                        summary.activitiesWithoutFile,
                        'manual entry',
                        'manual entries'
                      )}
                    </Text>
                  ) : null}
                  {summary.unsupportedFiles > 0 ? (
                    <Text style={styles.statLine}>
                      {formatNumber(summary.unsupportedFiles, 'file', 'files')} in an unsupported
                      format (.fit/.tcx)
                    </Text>
                  ) : null}
                  {summary.failedFiles > 0 ? (
                    <Text style={[styles.statLine, styles.warningText]}>
                      {formatNumber(summary.failedFiles, 'file', 'files')} could not be read
                    </Text>
                  ) : null}
                  <Text style={styles.note}>
                    Activity dates were converted using {summary.timezone}.
                  </Text>
                  <Text style={styles.note}>
                    Took {formatDuration(summary.timings.total)} · archive{' '}
                    {formatDuration(summary.timings.copyArchive)} · tracks read{' '}
                    {formatDuration(summary.timings.readTracks)} · parse{' '}
                    {formatDuration(summary.timings.parseTracks)} · stream writes{' '}
                    {formatDuration(summary.timings.writeStreams)} · activity writes{' '}
                    {formatDuration(summary.timings.writeTrackFields)}
                  </Text>
                </View>
              </>
            ) : null}

            {stage === 'failed' ? (
              <>
                <Text style={[styles.body, styles.warningText]}>{error}</Text>
                <Text style={styles.note}>
                  Make sure you selected the .zip Strava emailed you, not an unzipped folder or a
                  single activity file.
                </Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {stage === 'idle' ? (
              <>
                <Pressable style={[styles.button, styles.secondaryButton]} onPress={close}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.primaryButton]} onPress={startImport}>
                  <Text style={styles.primaryButtonText}>Choose .zip</Text>
                </Pressable>
              </>
            ) : null}
            {stage === 'running' ? (
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={close}>
                <Text style={styles.secondaryButtonText}>Stop after current activity</Text>
              </Pressable>
            ) : null}
            {stage === 'finished' ? (
              <>
                <Pressable style={[styles.button, styles.secondaryButton]} onPress={reset}>
                  <Text style={styles.secondaryButtonText}>Import another</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.primaryButton]} onPress={close}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
              </>
            ) : null}
            {stage === 'failed' ? (
              <>
                <Pressable style={[styles.button, styles.secondaryButton]} onPress={close}>
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.primaryButton]} onPress={startImport}>
                  <Text style={styles.primaryButtonText}>Try again</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '85%',
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 20,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4
        },
        android: { elevation: 5 },
        web: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }
      })
    },
    scrollContent: {
      paddingBottom: 12
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: 12,
      textAlign: 'center'
    },
    body: {
      fontSize: 14,
      color: theme.text,
      lineHeight: 20,
      marginBottom: 10,
      textAlign: 'center'
    },
    note: {
      fontSize: 12,
      color: theme.textMuted,
      lineHeight: 17,
      marginTop: 8,
      textAlign: 'center'
    },
    link: {
      fontSize: 14,
      color: theme.info,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 4
    },
    statsBlock: {
      backgroundColor: theme.surfaceMuted,
      borderRadius: 8,
      padding: 12,
      marginTop: 4
    },
    statLine: {
      fontSize: 14,
      color: theme.text,
      marginBottom: 4
    },
    warningText: {
      color: theme.danger
    },
    progressBarContainer: {
      width: '100%',
      height: 8,
      backgroundColor: theme.border,
      borderRadius: 4,
      overflow: 'hidden',
      marginTop: 12
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.success,
      borderRadius: 4
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 8
    },
    button: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 42,
      justifyContent: 'center'
    },
    primaryButton: {
      backgroundColor: theme.primary
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      textAlign: 'center'
    },
    secondaryButton: {
      backgroundColor: theme.surfaceSunken,
      borderWidth: 1,
      borderColor: theme.border
    },
    secondaryButtonText: {
      color: theme.textMuted,
      fontWeight: '500',
      textAlign: 'center'
    }
  });
