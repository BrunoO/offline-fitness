import { simpleLogger } from '@/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * Checks and, if needed, requests the foreground location permission, so the
 * map can show the user's position (blue dot and my-location button).
 *
 * Foreground only: Android requires a runtime request on top of the
 * `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` declarations in app.json —
 * the manifest declaration alone grants nothing. Background capture (recording
 * GPS tracks with the screen off) is a separate, explicit request and is
 * deliberately not made here.
 *
 * @returns True once the foreground location permission is granted.
 */
export function useLocationPermission(): boolean {
  const [isLocationGranted, setIsLocationGranted] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const ensurePermissionAsync = async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (current.status === 'granted') {
          if (isMounted) setIsLocationGranted(true);
          return;
        }
        const requested = await Location.requestForegroundPermissionsAsync();
        if (isMounted) setIsLocationGranted(requested.status === 'granted');
      } catch (error) {
        simpleLogger.error('Failed to request the location permission:', error);
      }
    };

    ensurePermissionAsync();

    return () => {
      isMounted = false;
    };
  }, []);

  return isLocationGranted;
}
