/* eslint-disable @typescript-eslint/no-require-imports */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
  }
}));

const mockListeners: Record<string, Array<(payload: any) => void>> = {};

jest.mock('../../modules/heart-rate/src', () => {
  const mockNative = {
    getCapabilities: jest.fn().mockResolvedValue({ canScan: true, canConnect: true, platform: 'android' }),
    startScan: jest.fn().mockResolvedValue(undefined),
    stopScan: jest.fn().mockResolvedValue(undefined),
    connectToDevice: jest.fn().mockResolvedValue(undefined),
    disconnectFromDevice: jest.fn().mockResolvedValue(undefined),
    startHrStreaming: jest.fn().mockResolvedValue(undefined),
    stopHrStreaming: jest.fn().mockResolvedValue(undefined),
    getConnectedDeviceId: jest.fn().mockResolvedValue(null)
  };
  (global as any).__mockNative = mockNative;
  return {
    __esModule: true,
    HeartRate: mockNative,
    heartRateEvents: {
      addDeviceFoundListener: jest.fn((cb: any) => { (mockListeners.onDeviceFound ??= []).push(cb); return { remove: () => {} }; }),
      addScanStateListener: jest.fn((cb: any) => { (mockListeners.onScanStateChanged ??= []).push(cb); return { remove: () => {} }; }),
      addConnectionStateListener: jest.fn((cb: any) => { (mockListeners.onConnectionStateChanged ??= []).push(cb); return { remove: () => {} }; }),
      addHeartRateListener: jest.fn((cb: any) => { (mockListeners.onHeartRate ??= []).push(cb); return { remove: () => {} }; }),
      addBatteryLevelListener: jest.fn((cb: any) => { (mockListeners.onBatteryLevel ??= []).push(cb); return { remove: () => {} }; })
    }
  };
});

import { heartRateService } from '@/features/heart-rate/services/heartRate';

const mockNative = (global as any).__mockNative;

function emit(event: string, payload: any) {
  (mockListeners[event] ?? []).forEach(cb => cb(payload));
}

describe('heartRateService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage as any).getItem = jest.fn().mockResolvedValue(null);
    (AsyncStorage as any).setItem = jest.fn().mockResolvedValue(undefined);
    (AsyncStorage as any).removeItem = jest.fn().mockResolvedValue(undefined);
    await heartRateService.ready();
  });

  it('starts with disconnected state', () => {
    const state = heartRateService.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.liveHr).toBeNull();
  });

  it('startScan clears devices and sets scanning via event', async () => {
    await heartRateService.startScan();
    expect(mockNative.startScan).toHaveBeenCalled();
    emit('onScanStateChanged', { scanning: true });
    expect(heartRateService.getState().scanning).toBe(true);
  });

  it('dedups discovered devices', () => {
    emit('onDeviceFound', { id: 'A', name: 'Polar H10', rssi: -40 });
    emit('onDeviceFound', { id: 'A', name: 'Polar H10', rssi: -40 });
    emit('onDeviceFound', { id: 'B', name: 'Polar H9', rssi: -60 });
    expect(heartRateService.getState().devices).toHaveLength(2);
  });

  it('connect persists and calls native connect', async () => {
    await heartRateService.connect('A', 'Polar H10');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('heartRateDeviceId', 'A');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('heartRateDeviceName', 'Polar H10');
    expect(mockNative.connectToDevice).toHaveBeenCalledWith('A');
    expect(heartRateService.getState().connectedDevice).toEqual({ id: 'A', name: 'Polar H10' });
  });

  it('updates live HR on sample event', () => {
    emit('onHeartRate', { deviceId: 'A', hr: 72, rrMs: [830], contact: true, receivedAt: 1000 });
    const state = heartRateService.getState();
    expect(state.liveHr).toBe(72);
    expect(state.liveRrMs).toEqual([830]);
  });

  it('disconnect clears live state without wiping persisted device from storage', async () => {
    await heartRateService.connect('A', 'Polar H10');
    jest.clearAllMocks();

    await heartRateService.disconnect();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(mockNative.disconnectFromDevice).toHaveBeenCalledWith('A');
    expect(heartRateService.getState().connectionState).toBe('disconnected');
    expect(heartRateService.getState().liveHr).toBeNull();
  });

  it('forget clears state and removes device from storage', async () => {
    await heartRateService.connect('A', 'Polar H10');
    jest.clearAllMocks();

    await heartRateService.forget();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('heartRateDeviceId');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('heartRateDeviceName');
    expect(heartRateService.getState().connectedDevice).toBeNull();
    expect(heartRateService.getState().liveHr).toBeNull();
  });
});
