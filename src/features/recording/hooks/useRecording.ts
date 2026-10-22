import { simpleLogger } from '@/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { GpsTracker, gpsTrackerEvents } from '../services/gpsTracker';
import type { GpsTrackerCapabilities, GpsTrackerTick } from '../services/gpsTracker';

/** Android 13 (API 33) is where POST_NOTIFICATIONS became a runtime permission. */
const ANDROID_13_API_LEVEL = 33;

interface UseRecordingResult {
  capabilities: GpsTrackerCapabilities | null;
  isRecording: boolean;
  tick: GpsTrackerTick | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const MODULE_UNAVAILABLE = 'The recording module is not available in this build.';

/**
 * The foreground service's notification is the only visible sign that recording
 * is on, and Android 13+ hides it until POST_NOTIFICATIONS is granted. The
 * module only declares the permission — asking is the app's job (D5), exactly
 * like location. A refusal does not block recording; it just hides the notice.
 */
const requestNotificationPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android' || Number(Platform.Version) < ANDROID_13_API_LEVEL) {
    return;
  }
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
};

/**
 * Phase 0 probe for the recording service.
 *
 * It answers the three questions the phase exists to settle: can the module be
 * reached from JS, does the app own the permission (D5 — the module asks for
 * none), and do events cross the bridge while the service runs. The real state
 * machine, replay and save flow arrive in Phases 2–3.
 */
export function useRecording(): UseRecordingResult {
  const [capabilities, setCapabilities] = useState<GpsTrackerCapabilities | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [tick, setTick] = useState<GpsTrackerTick | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCapabilities = async () => {
      try {
        const nextCapabilities = await GpsTracker.getCapabilities();
        if (isMounted) {
          setCapabilities(nextCapabilities);
        }
      } catch (cause: unknown) {
        simpleLogger.error('Recording capabilities unavailable', cause);
        if (isMounted) {
          setError(MODULE_UNAVAILABLE);
        }
      }
    };

    void loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    try {
      subscription = gpsTrackerEvents.addListener('onTick', nextTick => setTick(nextTick));
    } catch (cause: unknown) {
      // Already reported as "module unavailable" by the capabilities effect.
      simpleLogger.error('Recording events unavailable', cause);
    }

    return () => subscription?.remove();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      // Android 14+ requires the while-in-use location grant before a
      // location-typed foreground service may start, so the app asks first.
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission is required to record.');
        return;
      }
      await requestNotificationPermission();
      await GpsTracker.start();
      setIsRecording(true);
    } catch (cause: unknown) {
      simpleLogger.error('Could not start recording', cause);
      setError('Could not start the recording service.');
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      await GpsTracker.stop();
      setIsRecording(false);
    } catch (cause: unknown) {
      simpleLogger.error('Could not stop recording', cause);
      setError('Could not stop the recording service.');
    }
  }, []);

  return { capabilities, isRecording, tick, error, start, stop };
}
