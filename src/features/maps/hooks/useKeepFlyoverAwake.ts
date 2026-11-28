import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Keeps the device display awake while a flyover screen or modal is active so
 * long playback sessions do not dim or lock the screen.
 */
export function useKeepFlyoverAwake(active: boolean): void {
  useEffect(() => {
    if (active) {
      void activateKeepAwakeAsync();
    } else {
      void deactivateKeepAwake();
    }
    return () => {
      void deactivateKeepAwake();
    };
  }, [active]);
}
