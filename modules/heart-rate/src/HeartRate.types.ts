export interface HeartRateCapabilities {
  canScan: boolean;
  canConnect: boolean;
  platform: 'android' | 'ios';
}

export interface HeartRateDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface HeartRateConnectionStateEvent {
  deviceId: string;
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface HeartRateSampleEvent {
  deviceId: string;
  hr: number;
  rrMs: number[];
  contact: boolean | null;
  receivedAt: number;
}

export interface HeartRateBatteryLevelEvent {
  deviceId: string;
  level: number;
}

export interface HeartRateScanStateEvent {
  scanning: boolean;
}