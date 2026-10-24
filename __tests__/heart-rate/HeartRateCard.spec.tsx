import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { HeartRateCard } from '@/features/heart-rate/components/HeartRateCard';

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

const mockUseHeartRate = jest.fn();
const mockUseHeartRatePermissions = jest.fn();

jest.mock('@/features/heart-rate/hooks/useHeartRate', () => ({
  useHeartRate: () => mockUseHeartRate()
}));
jest.mock('@/features/heart-rate/hooks/useHeartRatePermissions', () => ({
  useHeartRatePermissions: () => mockUseHeartRatePermissions()
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

describe('HeartRateCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows permission prompt when not granted', () => {
    mockUseHeartRatePermissions.mockReturnValue({ granted: false, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: true, canConnect: true, platform: 'android' },
      devices: [],
      scanning: false,
      connectionState: 'disconnected',
      connectedDevice: null,
      liveHr: null,
      liveRrMs: [],
      attachedSession: null,
      startScan: jest.fn(),
      stopScan: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      forget: jest.fn(),
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText } = render(wrap(<HeartRateCard />));
    expect(getByText('Grant Bluetooth permission')).toBeTruthy();
  });

  it('shows not available on iOS stub', () => {
    mockUseHeartRatePermissions.mockReturnValue({ granted: true, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: false, canConnect: false, platform: 'ios' },
      devices: [],
      scanning: false,
      connectionState: 'disconnected',
      connectedDevice: null,
      liveHr: null,
      liveRrMs: [],
      attachedSession: null,
      startScan: jest.fn(),
      stopScan: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      forget: jest.fn(),
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText } = render(wrap(<HeartRateCard />));
    expect(getByText('Heart-rate scanning is not available on this platform.')).toBeTruthy();
  });

  it('shows connected device and live HR', () => {
    const disconnect = jest.fn();
    const forget = jest.fn();
    mockUseHeartRatePermissions.mockReturnValue({ granted: true, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: true, canConnect: true, platform: 'android' },
      devices: [],
      scanning: false,
      connectionState: 'connected',
      connectedDevice: { id: 'A', name: 'Polar H10' },
      liveHr: 72,
      liveRrMs: [830],
      attachedSession: null,
      startScan: jest.fn(),
      stopScan: jest.fn(),
      connect: jest.fn(),
      disconnect,
      forget,
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText } = render(wrap(<HeartRateCard />));
    expect(getByText('Connected: Polar H10')).toBeTruthy();
    expect(getByText('72')).toBeTruthy();
    expect(getByText('Disconnect')).toBeTruthy();
    expect(getByText('Forget device')).toBeTruthy();

    fireEvent.press(getByText('Forget device'));
    expect(forget).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Disconnect'));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('calls connect when a scanned device is tapped', () => {
    const connect = jest.fn();
    mockUseHeartRatePermissions.mockReturnValue({ granted: true, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: true, canConnect: true, platform: 'android' },
      devices: [{ id: 'A', name: 'Polar H10', rssi: -50 }],
      scanning: true,
      connectionState: 'disconnected',
      connectedDevice: null,
      liveHr: null,
      liveRrMs: [],
      attachedSession: null,
      startScan: jest.fn(),
      stopScan: jest.fn(),
      connect,
      disconnect: jest.fn(),
      forget: jest.fn(),
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText } = render(wrap(<HeartRateCard />));
    fireEvent.press(getByText('Polar H10 (-50 dBm)'));
    expect(connect).toHaveBeenCalledWith('A', 'Polar H10');
  });

  it('hides connect sensor by default when disconnected, and reveals on tapping Not connected', () => {
    mockUseHeartRatePermissions.mockReturnValue({ granted: true, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: true, canConnect: true, platform: 'android' },
      devices: [],
      scanning: false,
      connectionState: 'disconnected',
      connectedDevice: null,
      liveHr: null,
      liveRrMs: [],
      attachedSession: null,
      startScan: jest.fn(),
      stopScan: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      forget: jest.fn(),
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText, queryByText } = render(wrap(<HeartRateCard />));
    // Collapsed by default
    expect(getByText('Not connected')).toBeTruthy();
    expect(queryByText('Connect sensor')).toBeNull();

    // Tap "Not connected" to expand
    fireEvent.press(getByText('Not connected'));
    expect(getByText('Connect sensor')).toBeTruthy();

    // Tap again to collapse
    fireEvent.press(getByText('Not connected'));
    expect(queryByText('Connect sensor')).toBeNull();
  });
});