import AsyncStorage from '@react-native-async-storage/async-storage';
import { HeartRate, heartRateEvents } from '../../../../modules/heart-rate/src';
import type {
  HeartRateCapabilities,
  HeartRateConnectionStateEvent,
  HeartRateDevice,
  HeartRateSampleEvent
} from '../../../../modules/heart-rate/src';

import { appendHeartRateSample, heartRateLogUri, type RecordingMeta } from '@/features/recording';
import { simpleLogger } from '@/shared';

export type {
  HeartRateCapabilities,
  HeartRateConnectionStateEvent,
  HeartRateDevice,
  HeartRateSampleEvent
};

const STORAGE_KEY_ID = 'heartRateDeviceId';
const STORAGE_KEY_NAME = 'heartRateDeviceName';

export interface HeartRateState {
  capabilities: HeartRateCapabilities | null;
  devices: HeartRateDevice[];
  scanning: boolean;
  connectionState: HeartRateConnectionStateEvent['state'];
  connectedDevice: { id: string; name: string } | null;
  liveHr: number | null;
  liveRrMs: number[];
  battery: number | null;
  attachedSession: RecordingMeta | null;
}

type Listener = (state: HeartRateState) => void;

class HeartRateService {
  private state: HeartRateState = {
    capabilities: null,
    devices: [],
    scanning: false,
    connectionState: 'disconnected',
    connectedDevice: null,
    liveHr: null,
    liveRrMs: [],
    battery: null,
    attachedSession: null
  };
  private listeners = new Set<Listener>();
  private readyPromise: Promise<void>;
  private sampleUnsub: { remove: () => void } | null = null;
  private connUnsub: { remove: () => void } | null = null;
  private scanUnsub: { remove: () => void } | null = null;
  private deviceUnsub: { remove: () => void } | null = null;
  private batteryUnsub: { remove: () => void } | null = null;
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.readyPromise = this.init();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  private emit() {
    const snapshot = { ...this.state, devices: [...this.state.devices] };
    this.listeners.forEach(l => l(snapshot));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state, devices: [...this.state.devices] });
    return () => this.listeners.delete(listener);
  }

  getState(): HeartRateState {
    return { ...this.state, devices: [...this.state.devices] };
  }

  private async init() {
    try {
      const caps = await HeartRate.getCapabilities();
      this.state.capabilities = caps;
      this.emit();
    } catch (cause) {
      simpleLogger.error('HeartRate capabilities unavailable', cause);
      return;
    }
    this.connUnsub = heartRateEvents.addConnectionStateListener(e => {
      this.state.connectionState = e.state;
      if (e.state === 'connected') {
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        const name = this.state.connectedDevice?.name ?? e.deviceId;
        this.state.connectedDevice = { id: e.deviceId, name };
      } else if (e.state === 'disconnected') {
        this.state.liveHr = null;
        this.state.liveRrMs = [];
        this.state.battery = null;
        if (!this.intentionalDisconnect && this.state.connectedDevice) {
          this.scheduleReconnect(this.state.connectedDevice.id);
        }
      }
      this.emit();
    });
    this.deviceUnsub = heartRateEvents.addDeviceFoundListener(d => {
      const idx = this.state.devices.findIndex(x => x.id === d.id);
      if (idx === -1) {
        this.state.devices = [...this.state.devices, d];
      } else {
        const updated = [...this.state.devices];
        updated[idx] = { ...updated[idx], rssi: d.rssi, name: d.name || updated[idx].name };
        this.state.devices = updated;
      }
      this.emit();
    });
    this.scanUnsub = heartRateEvents.addScanStateListener(e => {
      this.state.scanning = e.scanning;
      this.emit();
    });
    this.sampleUnsub = heartRateEvents.addHeartRateListener((e: HeartRateSampleEvent) => {
      // `contact === false` means the sensor itself reports no skin contact;
      // 0 bpm is what some straps send while idle. Neither is a reading, and
      // neither is a valid value to plot or persist.
      const hasReading = e.contact !== false && e.hr > 0;
      this.state.liveHr = hasReading ? e.hr : null;
      const validRr = Array.from(new Set(e.rrMs.filter(rr => rr >= 300 && rr <= 2000)));
      this.state.liveRrMs = hasReading ? validRr : [];
      this.emit();
      if (this.state.attachedSession && hasReading) {
        try {
          appendHeartRateSample(heartRateLogUri(this.state.attachedSession), {
            t: e.receivedAt,
            bpm: e.hr,
            rrMs: validRr,
            contact: e.contact ?? undefined
          });
        } catch (cause) {
          simpleLogger.error('Failed to append heart-rate sample', cause);
        }
      }
    });

    this.batteryUnsub = heartRateEvents.addBatteryLevelListener(e => {
      if (e.deviceId === this.state.connectedDevice?.id) {
        this.state.battery = e.level;
        this.emit();
      }
    });

    const savedId = await AsyncStorage.getItem(STORAGE_KEY_ID);
    const savedName = await AsyncStorage.getItem(STORAGE_KEY_NAME);
    if (savedId) {
      this.state.connectedDevice = { id: savedId, name: savedName ?? savedId };
      this.emit();
      try {
        await HeartRate.connectToDevice(savedId);
      } catch (cause) {
        simpleLogger.error('Auto-connect failed', cause);
      }
    }
  }

  async startScan() {
    this.state.devices = [];
    this.emit();
    try {
      await HeartRate.startScan();
    } catch (cause) {
      simpleLogger.error('Heart-rate scan failed', cause);
    }
  }

  async stopScan() {
    try {
      await HeartRate.stopScan();
    } catch (cause) {
      simpleLogger.error('Heart-rate stop scan failed', cause);
    }
  }

  async connect(id: string, name: string) {
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    await AsyncStorage.setItem(STORAGE_KEY_ID, id);
    await AsyncStorage.setItem(STORAGE_KEY_NAME, name);
    this.state.connectedDevice = { id, name };
    this.emit();
    try {
      await HeartRate.connectToDevice(id);
    } catch (cause) {
      simpleLogger.error('Heart-rate connect failed', cause);
      this.state.connectionState = 'error';
      this.emit();
    }
  }

  private scheduleReconnect(deviceId: string) {
    if (this.reconnectAttempts >= 3) {
      this.state.connectionState = 'disconnected';
      this.emit();
      return;
    }
    const delayMs = Math.pow(2, this.reconnectAttempts) * 1000;
    this.reconnectAttempts += 1;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalDisconnect) return;
      void HeartRate.connectToDevice(deviceId).catch(cause => {
        simpleLogger.error('Heart-rate reconnect failed', cause);
        // If connect throws synchronously and no disconnect event follows,
        // ensure we don't get stuck in a "connecting" state.
        if (
          this.state.connectedDevice?.id === deviceId &&
          this.state.connectionState !== 'connected'
        ) {
          this.state.connectionState = 'disconnected';
          this.emit();
        }
      });
    }, delayMs);
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    const id = this.state.connectedDevice?.id;
    if (id) {
      try {
        await HeartRate.disconnectFromDevice(id);
      } catch (cause) {
        simpleLogger.error('Heart-rate disconnect failed', cause);
      }
    }
    this.state.connectionState = 'disconnected';
    this.state.liveHr = null;
    this.state.liveRrMs = [];
    this.state.battery = null;
    this.emit();
  }

  attachRecording(meta: RecordingMeta) {
    this.state.attachedSession = meta;
    this.emit();
  }

  detachRecording() {
    this.state.attachedSession = null;
    this.emit();
  }

  async forget() {
    await this.disconnect();
    await AsyncStorage.removeItem(STORAGE_KEY_ID);
    await AsyncStorage.removeItem(STORAGE_KEY_NAME);
    this.state.connectedDevice = null;
    this.emit();
  }
}

export const heartRateService = new HeartRateService();
