import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type { GpsTrackerCapabilities, GpsTrackerTick } from './GpsTracker.types';

interface GpsTrackerNativeModule {
  getCapabilities(): Promise<GpsTrackerCapabilities>;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  getTickCount(): Promise<number>;
}

/**
 * The native module object is itself the event emitter since SDK 52, so this is
 * the listener side of it declared as a plain interface — `EventEmitter<T>` from
 * `expo-modules-core` is the constructor's type and does not expose the instance
 * methods here.
 */
interface GpsTrackerEmitter {
  addListener(eventName: 'onTick', listener: (tick: GpsTrackerTick) => void): EventSubscription;
}

type GpsTrackerNative = GpsTrackerNativeModule & GpsTrackerEmitter;

let nativeModule: GpsTrackerNative | null = null;

/**
 * Resolved on first use, not at import time: a JS bundle running against a dev
 * client built before this module existed must fail one call, not crash the app
 * at startup (the screen turns the throw into an explanatory message).
 */
const loadNativeModule = (): GpsTrackerNative => {
  nativeModule ??= requireNativeModule<GpsTrackerNative>('GpsTracker');
  return nativeModule;
};

export const GpsTracker = {
  getCapabilities: (): Promise<GpsTrackerCapabilities> => loadNativeModule().getCapabilities(),
  start: (): Promise<boolean> => loadNativeModule().start(),
  stop: (): Promise<boolean> => loadNativeModule().stop(),
  getTickCount: (): Promise<number> => loadNativeModule().getTickCount()
};

export const gpsTrackerEvents: GpsTrackerEmitter = {
  addListener: (eventName, listener) => loadNativeModule().addListener(eventName, listener)
};
