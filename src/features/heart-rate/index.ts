export { HeartRateCard } from './components/HeartRateCard';
export { HeartRateZonesCard, type HeartRateZonesCardProps } from './components/HeartRateZonesCard';
export { useHeartRate } from './hooks/useHeartRate';
export { useHeartRatePermissions } from './hooks/useHeartRatePermissions';
export { heartRateService } from './services/heartRate';
export type { HeartRateDevice, HeartRateState } from './services/heartRate';
export {
  computeHeartRateZoneDistribution,
  computeHeartRateZones,
  DEFAULT_MAX_HEART_RATE,
  formatMaxHrSourceLabel,
  formatZoneDuration,
  getZoneForBpm,
  getZoneIndexForBpm,
  HEART_RATE_ZONE_DEFINITIONS,
  MAX_HR_SAMPLE_GAP_SECONDS,
  MIN_OBSERVED_MAX_HR_BPM,
  resolveMaxHeartRate,
  type HeartRateProfileInput,
  type HeartRateZoneBoundary,
  type HeartRateZoneBucket,
  type HeartRateZoneCode,
  type HeartRateZoneDefinition,
  type HeartRateZoneDistribution,
  type HeartRateZoneNumber,
  type MaxHeartRateResolution,
  type MaxHeartRateSource
} from './services/heartRateZones';
