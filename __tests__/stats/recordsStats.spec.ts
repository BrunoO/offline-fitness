import {
  computeActivityExtremes,
  computeRecordSportOptions,
  computeRunningBenchmarkPRs,
  formatBenchmarkTime,
  isRunningActivityType
} from '@/features/stats/services/recordsStats';
import { makeTestActivity } from '../helpers/testActivities';

describe('recordsStats', () => {
  const sampleActivities = [
    makeTestActivity({
      id: 'run-5k-fast',
      name: 'Fast 5K Race',
      type: 'Run',
      distance: 5000,
      moving_time: 1200, // 20:00 (4:00 /km)
      elapsed_time: 1230,
      total_elevation_gain: 30,
      start_date_utc: '2024-04-10T08:00:00Z'
    }),
    makeTestActivity({
      id: 'run-10k',
      name: 'Sunday 10K',
      type: 'Run',
      distance: 10000,
      moving_time: 2700, // 45:00 (4:30 /km)
      elapsed_time: 2800,
      total_elevation_gain: 85,
      start_date_utc: '2024-05-12T08:00:00Z'
    }),
    makeTestActivity({
      id: 'run-half',
      name: 'City Half Marathon',
      type: 'Run',
      distance: 21150,
      moving_time: 5710, // ~4:30 /km -> scaled to 21097.5m = 5696s (1:34:56)
      elapsed_time: 5800,
      total_elevation_gain: 150,
      start_date_utc: '2024-09-20T08:00:00Z'
    }),
    makeTestActivity({
      id: 'ride-long',
      name: 'Century Ride',
      type: 'Ride',
      distance: 100000, // 100 km
      moving_time: 10800, // 3h -> 33.3 km/h (1:48 /km)
      elapsed_time: 12000,
      total_elevation_gain: 1200,
      start_date_utc: '2024-06-15T07:00:00Z'
    }),
    makeTestActivity({
      id: 'ride-2',
      name: 'Evening Spin',
      type: 'Ride',
      distance: 30000,
      moving_time: 3600,
      elapsed_time: 3600,
      total_elevation_gain: 250,
      start_date_utc: '2024-06-18T17:00:00Z'
    })
  ];

  describe('isRunningActivityType', () => {
    it('recognizes running variants and excludes rides/walks', () => {
      expect(isRunningActivityType('Run')).toBe(true);
      expect(isRunningActivityType('TrailRun')).toBe(true);
      expect(isRunningActivityType('VirtualRun')).toBe(true);
      expect(isRunningActivityType('Ride')).toBe(false);
      expect(isRunningActivityType('Walk')).toBe(false);
      expect(isRunningActivityType(null)).toBe(false);
    });
  });

  describe('computeRecordSportOptions', () => {
    it('places All first followed by sports ordered by count descending', () => {
      const options = computeRecordSportOptions(sampleActivities);
      expect(options).toEqual(['All', 'Run', 'Ride']);
    });

    it('returns only All when activities list is empty', () => {
      expect(computeRecordSportOptions([])).toEqual(['All']);
    });
  });

  describe('computeActivityExtremes', () => {
    it('prevents cycling speeds and distances from overwriting running records when filtered to Run', () => {
      const runOnly = sampleActivities.filter(a => a.type === 'Run');
      const runExtremes = computeActivityExtremes(runOnly, false);

      expect(runExtremes.longestDistance.id).toBe('run-half');
      expect(runExtremes.longestDistance.value).toBeCloseTo(21.15);
      expect(runExtremes.bestPace.id).toBe('run-5k-fast');
      expect(runExtremes.bestPace.value).toBeCloseTo(4.0);
      expect(runExtremes.mostElevation.id).toBe('run-half');
      expect(runExtremes.mostElevation.value).toBe(150);
    });

    it('respects useElapsedTime flag when computing duration and pace', () => {
      const single = [sampleActivities[0]];
      const movingExtremes = computeActivityExtremes(single, false);
      const elapsedExtremes = computeActivityExtremes(single, true);

      expect(movingExtremes.longestDuration.value).toBe(1200);
      expect(movingExtremes.bestPace.value).toBeCloseTo(4.0);

      expect(elapsedExtremes.longestDuration.value).toBe(1230);
      expect(elapsedExtremes.bestPace.value).toBeCloseTo(4.1);
    });
  });

  describe('computeRunningBenchmarkPRs', () => {
    it('computes fastest 5K, 10K, and Half Marathon benchmarks while ignoring cycling activities', () => {
      const benchmarks = computeRunningBenchmarkPRs(sampleActivities, false);
      expect(benchmarks.map(b => b.key)).toEqual(['5k', '10k', 'half']);

      const pr5k = benchmarks.find(b => b.key === '5k')!;
      expect(pr5k.activityId).toBe('run-5k-fast');
      expect(pr5k.estimatedTimeSeconds).toBe(1200);
      expect(pr5k.paceMinPerKm).toBeCloseTo(4.0);

      const pr10k = benchmarks.find(b => b.key === '10k')!;
      // Both run-10k (4:30/km -> 2700s) and run-half (5710 / 21.15 * 10 = 2700s) are ~2700s;
      // run-half is 5710 * (10000 / 21150) = 2700s
      expect(pr10k.estimatedTimeSeconds).toBe(2700);

      const prHalf = benchmarks.find(b => b.key === 'half')!;
      expect(prHalf.activityId).toBe('run-half');
      expect(prHalf.estimatedTimeSeconds).toBe(Math.round(5710 * (21097.5 / 21150)));
    });

    it('accepts activities within the 2% GPS distance tolerance (e.g. 4.92 km for 5K)', () => {
      const gpsShort5k = [
        makeTestActivity({
          id: 'gps-short-5k',
          name: 'Parkrun GPS Short',
          type: 'Run',
          distance: 4920,
          moving_time: 1180,
          elapsed_time: 1180
        })
      ];
      const benchmarks = computeRunningBenchmarkPRs(gpsShort5k, false);
      expect(benchmarks).toHaveLength(1);
      expect(benchmarks[0].key).toBe('5k');
      expect(benchmarks[0].estimatedTimeSeconds).toBe(Math.round(1180 * (5000 / 4920)));
    });
  });

  describe('formatBenchmarkTime', () => {
    it('formats sub-hour times as M:SS and multi-hour times as H:MM:SS', () => {
      expect(formatBenchmarkTime(1200)).toBe('20:00');
      expect(formatBenchmarkTime(2705)).toBe('45:05');
      expect(formatBenchmarkTime(5696)).toBe('1:34:56');
      expect(formatBenchmarkTime(0)).toBe('-');
      expect(formatBenchmarkTime(NaN)).toBe('-');
    });
  });
});
