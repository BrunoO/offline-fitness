import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  HeartRateCapabilities,
  HeartRateDevice,
  HeartRateConnectionStateEvent,
  HeartRateSampleEvent,
  HeartRateScanStateEvent,
  HeartRateBatteryLevelEvent
} from './HeartRate.types';

interface HeartRateNativeModule {
  getCapabilities(): Promise<HeartRateCapabilities>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connectToDevice(id: string): Promise<void>;
  disconnectFromDevice(id: string): Promise<void>;
  startHrStreaming(id: string): Promise<void>;
  stopHrStreaming(id: string): Promise<void>;
  getConnectedDeviceId(): Promise<string | null>;
  addListener(eventName: 'onDeviceFound', listener: (d: HeartRateDevice) => void): EventSubscription;
  addListener(eventName: 'onScanStateChanged', listener: (e: HeartRateScanStateEvent) => void): EventSubscription;
  addListener(eventName: 'onConnectionStateChanged', listener: (e: HeartRateConnectionStateEvent) => void): EventSubscription;
  addListener(eventName: 'onHeartRate', listener: (e: HeartRateSampleEvent) => void): EventSubscription;
  addListener(eventName: 'onBatteryLevel', listener: (e: HeartRateBatteryLevelEvent) => void): EventSubscription;
}

let nativeModule: HeartRateNativeModule | null = null;
const loadNativeModule = (): HeartRateNativeModule => {
  nativeModule ??= requireNativeModule<HeartRateNativeModule>('HeartRate');
  return nativeModule;
};

export const HeartRate = {
  getCapabilities: () => loadNativeModule().getCapabilities(),
  startScan: () => loadNativeModule().startScan(),
  stopScan: () => loadNativeModule().stopScan(),
  connectToDevice: (id: string) => loadNativeModule().connectToDevice(id),
  disconnectFromDevice: (id: string) => loadNativeModule().disconnectFromDevice(id),
  startHrStreaming: (id: string) => loadNativeModule().startHrStreaming(id),
  stopHrStreaming: (id: string) => loadNativeModule().stopHrStreaming(id),
  getConnectedDeviceId: () => loadNativeModule().getConnectedDeviceId()
};

export const heartRateEvents = {
  addDeviceFoundListener: (listener: (d: HeartRateDevice) => void): EventSubscription =>
    loadNativeModule().addListener('onDeviceFound', listener),
  addScanStateListener: (listener: (e: HeartRateScanStateEvent) => void): EventSubscription =>
    loadNativeModule().addListener('onScanStateChanged', listener),
  addConnectionStateListener: (listener: (e: HeartRateConnectionStateEvent) => void): EventSubscription =>
    loadNativeModule().addListener('onConnectionStateChanged', listener),
  addHeartRateListener: (listener: (e: HeartRateSampleEvent) => void): EventSubscription =>
    loadNativeModule().addListener('onHeartRate', listener),
  addBatteryLevelListener: (listener: (e: HeartRateBatteryLevelEvent) => void): EventSubscription =>
    loadNativeModule().addListener('onBatteryLevel', listener)
};