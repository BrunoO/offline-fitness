import React from 'react';
import { Alert } from 'react-native';
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

  it('shows connected device and live HR, and manages sensor via overflow menu', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
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
    const { getByText, getByLabelText, queryByText } = render(wrap(<HeartRateCard />));
    expect(getByText('Connected: Polar H10')).toBeTruthy();
    expect(getByText('72')).toBeTruthy();
    // Disconnect and Forget are no longer rendered as raw stacked text in the card body
    expect(queryByText('Disconnect')).toBeNull();
    expect(queryByText('Forget device')).toBeNull();

    // Tap manage overflow button
    fireEvent.press(getByLabelText('Manage Polar H10'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Polar H10',
      'Manage sensor connection',
      expect.any(Array)
    );

    const alertButtons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      style?: string;
      onPress?: () => void;
    }>;
    expect(alertButtons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Disconnect' }),
        expect.objectContaining({ text: 'Forget device', style: 'destructive' }),
        expect.objectContaining({ text: 'Cancel', style: 'cancel' })
      ])
    );

    // Trigger disconnect and forget callbacks
    alertButtons.find(b => b.text === 'Disconnect')?.onPress?.();
    expect(disconnect).toHaveBeenCalledTimes(1);

    alertButtons.find(b => b.text === 'Forget device')?.onPress?.();
    expect(forget).toHaveBeenCalledTimes(1);
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

  it('displays "Connect sensor" button pill directly in the header when disconnected, and reveals connection details on tap', () => {
    const startScan = jest.fn();
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
      startScan,
      stopScan: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      forget: jest.fn(),
      attachRecording: jest.fn(),
      detachRecording: jest.fn()
    });
    const { getByText, queryByText, getByLabelText } = render(wrap(<HeartRateCard />));

    // "Connect sensor" is directly visible as an action pill in header when disconnected
    expect(getByText('Connect sensor')).toBeTruthy();
    expect(queryByText('Or enter device id:')).toBeNull();

    // Tap "Connect sensor" to initiate scan and reveal sensor connection details
    fireEvent.press(getByText('Connect sensor'));
    expect(startScan).toHaveBeenCalledTimes(1);
    expect(getByText('Or enter device id:')).toBeTruthy();

    // Tap collapse button to collapse details
    fireEvent.press(getByLabelText('Collapse sensor connection'));
    expect(queryByText('Or enter device id:')).toBeNull();
  });

  it('displays "Scanning…" when actively scanning for sensors', () => {
    mockUseHeartRatePermissions.mockReturnValue({ granted: true, requestPermissions: jest.fn() });
    mockUseHeartRate.mockReturnValue({
      capabilities: { canScan: true, canConnect: true, platform: 'android' },
      devices: [],
      scanning: true,
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
    expect(getByText('Scanning…')).toBeTruthy();
  });
});