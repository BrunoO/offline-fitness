import { computeYearlyPerformanceStats, formatPace, isPaceSport } from '@/features/stats/services/performanceStats';
import { makeTestActivity } from '../helpers/testActivities';

describe('performanceStats', () => {
  describe('isPaceSport', () => {
    it('identifies running and walking sports as pace sports', () => {
      expect(isPaceSport('Run')).toBe(true);
      expect(isPaceSport('TrailRun')).toBe(true);
      expect(isPaceSport('Walk')).toBe(true);
      expect(isPaceSport('Hike')).toBe(true);
      expect(isPaceSport('VirtualRun')).toBe(true);
    });

    it('identifies cycling, swimming and others as non-pace (speed) sports', () => {
      expect(isPaceSport('Ride')).toBe(false);
      expect(isPaceSport('VirtualRide')).toBe(false);
      expect(isPaceSport('EBikeRide')).toBe(false);
      expect(isPaceSport('Swim')).toBe(false);
    });
  });

  describe('formatPace', () => {
    it('formats pace correctly', () => {
      expect(formatPace(5.5)).toBe('5:30');
      expect(formatPace(4.0)).toBe('4:00');
      expect(formatPace(4.99)).toBe('4:59');
      expect(formatPace(4.999)).toBe('5:00');
    });

    it('handles non-finite or zero values gracefully', () => {
      expect(formatPace(0)).toBe('-');
      expect(formatPace(-5)).toBe('-');
      expect(formatPace(NaN)).toBe('-');
      expect(formatPace(Infinity)).toBe('-');
    });
  });

  describe('computeYearlyPerformanceStats', () => {
    const activities = [
      makeTestActivity({
        id: '1',
        type: 'Run',
        start_date_utc: '2023-05-10T08:00:00Z',
        distance: 10000, // 10 km
        moving_time: 3000, // 50 min
        elapsed_time: 3600, // 60 min
        total_elevation_gain: 100 // 100 m
      }),
      makeTestActivity({
        id: '2',
        type: 'Run',
        start_date_utc: '2023-06-10T08:00:00Z',
        distance: 10000, // 10 km
        moving_time: 3000, // 50 min
        elapsed_time: 3600, // 60 min
        total_elevation_gain: 100 // 100 m
      }),
      makeTestActivity({
        id: '3',
        type: 'Run',
        start_date_utc: '2024-05-10T08:00:00Z',
        distance: 20000, // 20 km
        moving_time: 5400, // 90 min = 4:30 min/km
        elapsed_time: 6000,
        total_elevation_gain: 300 // 300 m
      }),
      makeTestActivity({
        id: '4',
        type: 'Ride',
        start_date_utc: '2023-05-10T08:00:00Z',
        distance: 40000,
        moving_time: 3600,
        elapsed_time: 3600
      })
    ];

    it('aggregates stats by year for the specified sport using moving time', () => {
      const stats = computeYearlyPerformanceStats(activities, 'Run', false);
      expect(stats).toHaveLength(2);

      const y2023 = stats[0];
      expect(y2023.year).toBe(2023);
      expect(y2023.activityCount).toBe(2);
      expect(y2023.totalDistanceMeters).toBe(20000);
      expect(y2023.totalTimeSeconds).toBe(6000); // 100 min
      expect(y2023.avgDistanceKm).toBe(10);
      expect(y2023.avgDurationSeconds).toBe(3000);
      // Speed: 20km / (6000s / 3600s/h) = 12 km/h
      expect(y2023.avgSpeedKmh).toBeCloseTo(12);
      // Pace: 100min / 20km = 5.0 min/km
      expect(y2023.avgPaceMinPerKm).toBeCloseTo(5.0);
      // Elevation per 10km: 200m / 20km * 10 = 100m
      expect(y2023.elevationPer10Km).toBeCloseTo(100);

      const y2024 = stats[1];
      expect(y2024.year).toBe(2024);
      expect(y2024.activityCount).toBe(1);
      expect(y2024.avgDistanceKm).toBe(20);
      // Pace: 90min / 20km = 4.5 min/km (faster)
      expect(y2024.avgPaceMinPerKm).toBeCloseTo(4.5);
      // Elevation per 10km: 300m / 20km * 10 = 150m
      expect(y2024.elevationPer10Km).toBeCloseTo(150);
    });

    it('uses elapsed time when useElapsedTime is true', () => {
      const stats = computeYearlyPerformanceStats(activities, 'Run', true);
      const y2023 = stats[0];
      expect(y2023.totalTimeSeconds).toBe(7200); // 2 * 3600
      // Speed: 20km / 2h = 10 km/h
      expect(y2023.avgSpeedKmh).toBeCloseTo(10);
      // Pace: 120min / 20km = 6.0 min/km
      expect(y2023.avgPaceMinPerKm).toBeCloseTo(6.0);
    });

    it('ignores zero-distance activities', () => {
      const zeroDist = [
        makeTestActivity({
          id: '5',
          type: 'Run',
          start_date_utc: '2023-01-01T08:00:00Z',
          distance: 0,
          moving_time: 1800
        })
      ];
      const stats = computeYearlyPerformanceStats(zeroDist, 'Run', false);
      expect(stats).toHaveLength(0);
    });
  });
});
