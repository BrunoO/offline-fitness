import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

/** Android 13 (API 33) is where POST_NOTIFICATIONS became a runtime permission. */
const ANDROID_13_API_LEVEL = 33;

export interface RecordingPermissions {
  isLocationGranted: boolean;
  isNotificationGranted: boolean;
  /**
   * Asks for the foreground location grant (through expo-location, like the
   * maps feature) and for the notification permission.
   *
   * A refused notification is not fatal: the service runs, the notification is
   * simply hidden. A refused location grant stops the recording - there is
   * nothing to record without it.
   */
  requestPermissions: () => Promise<boolean>;
}

const requestNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || Number(Platform.Version) < ANDROID_13_API_LEVEL) {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

/**
 * The app owns the recording permissions (D5): the module declares them and
 * asks for none.
 */
export function useRecordingPermissions(): RecordingPermissions {
  const [isLocationGranted, setIsLocationGranted] = useState(false);
  const [isNotificationGranted, setIsNotificationGranted] = useState(false);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const location = await Location.requestForegroundPermissionsAsync();
    const isLocationAllowed = location.status === 'granted';
    setIsLocationGranted(isLocationAllowed);

    const isNotificationAllowed = await requestNotificationPermission();
    setIsNotificationGranted(isNotificationAllowed);

    return isLocationAllowed;
  }, []);

  return { isLocationGranted, isNotificationGranted, requestPermissions };
}
