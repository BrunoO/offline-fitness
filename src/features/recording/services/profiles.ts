import type { CaptureOptions, Profile } from './gpsTracker';

/**
 * The four MVP profiles and the capture parameters each one uses.
 *
 * The numbers are the ones the legacy `ActivityProfile` carried - the
 * behaviour did not change, the class did: profiles are app data now, and
 * the service only receives the four values the capture loop needs.
 */
export const PROFILES: Profile[] = ['walking', 'hiking', 'cycling', 'swimming'];

export const PROFILE_CAPTURE_OPTIONS: Record<Profile, CaptureOptions> = {
  walking: {
    intervalMs: 2000,
    minDistanceM: 2.5,
    accuracyCeilingM: 15,
    useBarometer: true
  },
  hiking: {
    intervalMs: 4000,
    minDistanceM: 4,
    accuracyCeilingM: 20,
    useBarometer: true
  },
  cycling: {
    intervalMs: 1000,
    minDistanceM: 3,
    accuracyCeilingM: 15,
    useBarometer: true
  },
  swimming: {
    intervalMs: 1000,
    minDistanceM: 0.5,
    accuracyCeilingM: 25,
    useBarometer: false
  }
};

export const PROFILE_LABELS: Record<Profile, string> = {
  walking: 'Walking',
  hiking: 'Hiking',
  cycling: 'Cycling',
  swimming: 'Swimming'
};
