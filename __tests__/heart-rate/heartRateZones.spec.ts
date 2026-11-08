import {
  computeHeartRateZoneDistribution,
  computeHeartRateZones,
  DEFAULT_MAX_HEART_RATE,
  formatMaxHrSourceLabel,
  formatZoneDuration,
  getZoneForBpm,
  getZoneIndexForBpm,
  resolveMaxHeartRate
} from '@/features/heart-rate/services/heartRateZones';
import { makeTestActivity } from '../helpers/testActivities';

describe('heartRateZones', () => {
  describe('resolveMaxHeartRate', () => {
    it('prioritizes explicit custom maxHeartRate in UserProfile (tier 1)', () => {
      const res = resolveMaxHeartRate({
        profile: { age: 40, maxHeartRate: 194 },
        activities: [{ ...makeTestActivity({ id: '1' }), max_heartrate: 188 }],
        activityMaxHr: 192
      });
      expect(res).toEqual({ maxHr: 194, source: 'custom' });
    });

    it('uses 220 - age when custom maxHeartRate is not set (tier 2)', () => {
      const res = resolveMaxHeartRate({
        profile: { age: 35 },
        activities: [{ ...makeTestActivity({ id: '1' }), max_heartrate: 179 }]
      });
      expect(res).toEqual({ maxHr: 185, source: 'age' });
    });

    it('falls back to highest observed max_heartrate across activities (tier 3)', () => {
      const res = resolveMaxHeartRate({
        profile: {},
        activities: [
          { ...makeTestActivity({ id: '1' }), max_heartrate: 172 },
          { ...makeTestActivity({ id: '2' }), max_heartrate: 189 }
        ],
        activityMaxHr: 180
      });
      expect(res).toEqual({ maxHr: 189, source: 'observed' });
    });

    it('falls back to DEFAULT_MAX_HEART_RATE (190) when no profile or observed HR exists (tier 4)', () => {
      const res = resolveMaxHeartRate({});
      expect(res).toEqual({ maxHr: DEFAULT_MAX_HEART_RATE, source: 'default' });
    });
  });

  describe('computeHeartRateZones & getZoneForBpm', () => {
    it('computes half-open 5-zone BPM boundaries for maxHr = 200', () => {
      const zones = computeHeartRateZones(200);
      expect(zones).toEqual([
        expect.objectContaining({
          zone: 1,
          code: 'Z1',
          name: 'Recovery',
          minBpm: 100,
          maxBpm: 119
        }),
        expect.objectContaining({ zone: 2, code: 'Z2', name: 'Aerobic', minBpm: 120, maxBpm: 139 }),
        expect.objectContaining({ zone: 3, code: 'Z3', name: 'Tempo', minBpm: 140, maxBpm: 159 }),
        expect.objectContaining({
          zone: 4,
          code: 'Z4',
          name: 'Threshold',
          minBpm: 160,
          maxBpm: 179
        }),
        expect.objectContaining({
          zone: 5,
          code: 'Z5',
          name: 'Anaerobic',
          minBpm: 180,
          maxBpm: 200
        })
      ]);
    });

    it('maps valid BPMs to zones 1..5 and invalid/null BPMs to null', () => {
      expect(getZoneIndexForBpm(null, 200)).toBe(-1);
      expect(getZoneIndexForBpm(0, 200)).toBe(-1);
      expect(getZoneForBpm(null, 200)).toBeNull();

      expect(getZoneForBpm(110, 200)?.code).toBe('Z1');
      expect(getZoneForBpm(120, 200)?.code).toBe('Z2');
      expect(getZoneForBpm(140, 200)?.code).toBe('Z3');
      expect(getZoneForBpm(160, 200)?.code).toBe('Z4');
      expect(getZoneForBpm(180, 200)?.code).toBe('Z5');
      // Supra-maximal spike (> 100% maxHr) stays in Z5
      expect(getZoneForBpm(205, 200)?.code).toBe('Z5');
    });
  });

  describe('computeHeartRateZoneDistribution', () => {
    const maxHrResolution = { maxHr: 200, source: 'custom' as const };

    it('integrates time-weighted deltas accurately even under uneven RDP sample spacing', () => {
      // Straight road segment: 1 sample covering 20s in Z2 (130 bpm)
      // Curvy segment: 10 dense 1s samples covering 10s in Z4 (170 bpm)
      const time = [0, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
      const heartrate = [130, 130, 170, 170, 170, 170, 170, 170, 170, 170, 170, 170];

      const dist = computeHeartRateZoneDistribution({
        heartrate,
        time,
        maxHrResolution
      });

      expect(dist).not.toBeNull();
      expect(dist!.totalTrackedSeconds).toBe(30);
      // Z2 has 20s (66.7%), Z4 has 10s (33.3%) — despite Z4 having 10x more array elements!
      expect(dist!.zones[1].seconds).toBe(20);
      expect(dist!.zones[1].percentage).toBeCloseTo(66.67, 1);
      expect(dist!.zones[3].seconds).toBe(10);
      expect(dist!.zones[3].percentage).toBeCloseTo(33.33, 1);
      expect(dist!.dominantZone).toBe(2);
    });

    it('clamps pause gaps > 30s and ignores null sensor dropouts', () => {
      // Step 1 (0 -> 10s): 10s in Z2 (125 bpm)
      // Step 2 (10 -> 610s, 10-min coffee pause): clamped to 30s in Z3 (150 bpm)
      // Step 3 (610 -> 620s): null dropout -> 0s added
      const time = [0, 10, 610, 620];
      const heartrate: (number | null)[] = [125, 125, 150, null];

      const dist = computeHeartRateZoneDistribution({
        heartrate,
        time,
        maxHrResolution
      });

      expect(dist).not.toBeNull();
      expect(dist!.totalTrackedSeconds).toBe(40);
      expect(dist!.zones[1].seconds).toBe(10);
      expect(dist!.zones[2].seconds).toBe(30);
    });

    it('falls back to equal sample weighting when time series is absent', () => {
      const heartrate: (number | null)[] = [125, 125, null, 165, 185];
      const dist = computeHeartRateZoneDistribution({
        heartrate,
        maxHrResolution,
        fallbackDurationSeconds: 400
      });

      expect(dist).not.toBeNull();
      expect(dist!.totalTrackedSeconds).toBe(400);
      expect(dist!.zones[1].seconds).toBe(200); // 2 of 4 valid samples in Z2
      expect(dist!.zones[3].seconds).toBe(100); // 1 of 4 valid samples in Z4
      expect(dist!.zones[4].seconds).toBe(100); // 1 of 4 valid samples in Z5
    });

    it('returns null when heartrate array has no valid samples', () => {
      expect(
        computeHeartRateZoneDistribution({
          heartrate: [null, null],
          time: [0, 10],
          maxHrResolution
        })
      ).toBeNull();
    });
  });

  describe('formatting helpers', () => {
    it('formats zone durations and max HR source labels', () => {
      expect(formatZoneDuration(0)).toBe('0:00');
      expect(formatZoneDuration(65)).toBe('1:05');
      expect(formatZoneDuration(3665)).toBe('1:01:05');

      expect(formatMaxHrSourceLabel('custom')).toBe('custom profile');
      expect(formatMaxHrSourceLabel('age')).toBe('220 − age');
      expect(formatMaxHrSourceLabel('observed')).toBe('observed peak');
      expect(formatMaxHrSourceLabel('default')).toBe('default');
    });
  });
});
