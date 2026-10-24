import { useEffect, useState } from 'react';
import type { RecordingMeta } from '@/features/recording';
import { heartRateService, type HeartRateState } from '../services/heartRate';

export function useHeartRate(): HeartRateState & {
  startScan: () => void;
  stopScan: () => void;
  connect: (id: string, name: string) => void;
  disconnect: () => void;
  forget: () => void;
  attachRecording: (meta: RecordingMeta) => void;
  detachRecording: () => void;
} {
  const [state, setState] = useState<HeartRateState>(heartRateService.getState());
  useEffect(() => heartRateService.subscribe(setState), []);

  return {
    ...state,
    startScan: () => void heartRateService.startScan(),
    stopScan: () => void heartRateService.stopScan(),
    connect: (id, name) => void heartRateService.connect(id, name),
    disconnect: () => void heartRateService.disconnect(),
    forget: () => void heartRateService.forget(),
    attachRecording: meta => heartRateService.attachRecording(meta),
    detachRecording: () => heartRateService.detachRecording()
  };
}
