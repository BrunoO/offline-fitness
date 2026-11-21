import {
  applyActivityMetadataPatch,
  buildTrimPreviewStreams,
  computeCutPointMetrics,
  computeElevationHysteresisGain,
  extractIanaTimezone,
  getStationarySpeedThreshold,
  previewTrimmedActivity,
  trimActivityStream
} from '@/features/activities/services/activityTrimmer';
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';
import type { Activity } from '@/shared';

const mockBaseActivity: Activity = {
  id: 'test-act-1',
  name: 'Morning Run',
  type: 'Run',
  distance: 5000,
  elapsed_time: 1500,
  moving_time: 1400,
  average_speed: 3.57,
  total_elevation_gain: 50,
  elev_high: 120,
  elev_low: 70,
  start_latlng: [45.18, 5.72],
  end_latlng: [45.19, 5.73],
  start_date_local: '2026-05-10T08:00:00Z',
  local_date: '2026-05-10',
  local_time: '08:00:00',
  start_date_utc: '2026-05-10T06:00:00.000Z',
  start_timestamp_utc: 1778392800000,
  timezone: '(GMT+02:00) Europe/Paris',
  utc_offset: 7200,
  start_year: 2026,
  start_month: 4,
  start_day: 10,
  start_week: 19,
  average_heartrate: 150,
  max_heartrate: 172
};

const mockGpsStream: StreamSet = {
  time: {
    data: [0, 10, 20, 30, 40],
    series_type: 'time',
    original_size: 5,
    resolution: 'high'
  },
  latlng: {
    data: [
      [45.18, 5.72],
      [45.181, 5.7205],
      [45.182, 5.721],
      [45.183, 5.7215],
      [45.184, 5.722]
    ],
    series_type: 'latlng',
    original_size: 5,
    resolution: 'high'
  },
  altitude: {
    data: [100.0, 101.0, 103.0, 101.5, 104.0],
    series_type: 'altitude',
    original_size: 5,
    resolution: 'high'
  },
  heartrate: {
    data: [140, 145, 155, 160, 150],
    series_type: 'heartrate',
    original_size: 5,
    resolution: 'high'
  }
};

describe('activityTrimmer', () => {
  describe('applyActivityMetadataPatch', () => {
    it('updates name and recomputes average_speed on duration edits', () => {
      const patched = applyActivityMetadataPatch(mockBaseActivity, {
        name: 'Faster Tempo Run',
        durationSec: 1000
      });

      expect(patched.name).toBe('Faster Tempo Run');
      expect(patched.elapsed_time).toBe(1000);
      expect(patched.moving_time).toBe(1000);
      expect(patched.average_speed).toBeCloseTo(5000 / 1000, 2);
    });

    it('enforces ONT-DOM-05 when changing type to Swim', () => {
      const patched = applyActivityMetadataPatch(mockBaseActivity, {
        type: 'Swim'
      });

      expect(patched.type).toBe('Swim');
      expect(patched.moving_time).toBe(mockBaseActivity.elapsed_time);
      expect(patched.total_elevation_gain).toBe(0);
    });

    it('forces distance to 0 when reclassifying to a NO_GPS_ACTIVITY_TYPES sport', () => {
      const patched = applyActivityMetadataPatch(mockBaseActivity, {
        type: 'Yoga',
        distanceMeters: 2500
      });

      expect(patched.type).toBe('Yoga');
      expect(patched.distance).toBe(0);
      expect(patched.average_speed).toBe(0);
    });

    it('updates distance and elevation on manual streamless edits', () => {
      const patched = applyActivityMetadataPatch(mockBaseActivity, {
        distanceMeters: 6000,
        totalElevationGainM: 100
      });

      expect(patched.distance).toBe(6000);
      expect(patched.total_elevation_gain).toBe(100);
    });
  });

  describe('computeElevationHysteresisGain', () => {
    it('returns 0 for arrays with fewer than 2 points', () => {
      expect(computeElevationHysteresisGain([])).toBe(0);
      expect(computeElevationHysteresisGain([100])).toBe(0);
    });

    it('filters small sub-1.5m noise and accumulates valid climbs', () => {
      // 100 -> 101 (delta 1.0 < 1.5, anchor 100)
      // 101 -> 102.5 (delta from anchor: 2.5 >= 1.5 -> gain += 2.5, anchor 102.5)
      // 102.5 -> 101.5 (delta -1.0, ignored)
      // 101.5 -> 100.0 (delta from anchor: -2.5 <= -1.5 -> anchor 100.0)
      // 100.0 -> 103.0 (delta +3.0 >= 1.5 -> gain += 3.0, anchor 103.0)
      const alts = [100.0, 101.0, 102.5, 101.5, 100.0, 103.0];
      const gain = computeElevationHysteresisGain(alts);
      expect(gain).toBe(6); // 2.5 + 3.0 = 5.5 -> rounds to 6
    });
  });

  describe('extractIanaTimezone', () => {
    it('extracts IANA timezone string from Strava format', () => {
      expect(extractIanaTimezone('(GMT+02:00) Europe/Paris')).toBe('Europe/Paris');
      expect(extractIanaTimezone('America/New_York')).toBe('America/New_York');
      expect(extractIanaTimezone('UTC')).toBe('UTC');
    });

    it('falls back to default on invalid zone', () => {
      const fallback = extractIanaTimezone('Invalid/Zone_Name_123');
      expect(typeof fallback).toBe('string');
      expect(fallback.length).toBeGreaterThan(0);
    });
  });

  describe('getStationarySpeedThreshold', () => {
    it('returns correct profile threshold for sport types', () => {
      expect(getStationarySpeedThreshold('Ride')).toBe(0.8);
      expect(getStationarySpeedThreshold('Run')).toBe(0.5);
      expect(getStationarySpeedThreshold('Walk')).toBe(0.4);
      expect(getStationarySpeedThreshold('Hike')).toBe(0.3);
      expect(getStationarySpeedThreshold('Swim')).toBe(0.2);
      expect(getStationarySpeedThreshold('UnknownSport')).toBe(0.4);
    });
  });

  describe('computeCutPointMetrics', () => {
    it('computes telemetry values at cut-point index', () => {
      const metrics = computeCutPointMetrics(mockGpsStream, 2, mockBaseActivity);

      expect(metrics.index).toBe(2);
      expect(metrics.elapsedSec).toBe(20);
      expect(metrics.wallClockTime).toBe('08:00:20');
      expect(metrics.coordinate).toEqual({ latitude: 45.182, longitude: 5.721 });
      expect(metrics.altitudeM).toBe(103.0);
      expect(metrics.heartRateBpm).toBe(155);
      expect(metrics.speedKmh).toBeGreaterThan(0);
    });

    it('clamps out of bounds indices safely', () => {
      const low = computeCutPointMetrics(mockGpsStream, -10, mockBaseActivity);
      expect(low.index).toBe(0);

      const high = computeCutPointMetrics(mockGpsStream, 999, mockBaseActivity);
      expect(high.index).toBe(4);
    });
  });

  describe('trimActivityStream', () => {
    it('throws error when stream has fewer than 2 points', () => {
      const emptyStream: StreamSet = {
        time: { data: [0], series_type: 'time', original_size: 1, resolution: 'high' }
      };
      expect(() => trimActivityStream(mockBaseActivity, emptyStream, 0, 1)).toThrow();
    });

    it('trims tail only (startIndex = 0, endIndex = 3)', () => {
      const { updatedActivity, trimmedStream } = trimActivityStream(
        mockBaseActivity,
        mockGpsStream,
        0,
        3
      );

      // Start timestamp and local wall clock must be unchanged
      expect(updatedActivity.start_timestamp_utc).toBe(mockBaseActivity.start_timestamp_utc);
      expect(updatedActivity.local_time).toBe('08:00:00');
      expect(updatedActivity.start_latlng).toEqual([45.18, 5.72]);
      expect(updatedActivity.end_latlng).toEqual([45.183, 5.7215]);

      // Elapsed time should be time[3] - time[0] = 30s
      expect(updatedActivity.elapsed_time).toBe(30);

      // Distance should be recalculated over 4 points
      expect(updatedActivity.distance).toBeGreaterThan(0);
      expect(updatedActivity.distance).toBeLessThan(mockBaseActivity.distance);

      // Sliced stream checks
      expect(trimmedStream.time?.data).toEqual([0, 10, 20, 30]);
      expect(trimmedStream.latlng?.data).toHaveLength(4);
      expect(trimmedStream.altitude?.data).toHaveLength(4);
      expect(trimmedStream.heartrate?.data).toEqual([140, 145, 155, 160]);
    });

    it('trims start (startIndex = 2, endIndex = 4) and shifts start timestamps (ONT-TIME-01)', () => {
      const { updatedActivity, trimmedStream } = trimActivityStream(
        mockBaseActivity,
        mockGpsStream,
        2,
        4
      );

      // Time offset is 20 seconds
      expect(trimmedStream.time?.data).toEqual([0, 10, 20]);
      expect(updatedActivity.elapsed_time).toBe(20);

      // Start timestamp must advance by 20,000 ms
      expect(updatedActivity.start_timestamp_utc).toBe(
        mockBaseActivity.start_timestamp_utc + 20000
      );
      expect(updatedActivity.local_time).toBe('08:00:20');
      expect(updatedActivity.start_date_local).toBe('2026-05-10T08:00:20Z');
      expect(updatedActivity.start_latlng).toEqual([45.182, 5.721]);
      expect(updatedActivity.end_latlng).toEqual([45.184, 5.722]);

      // Heart rate avg and max over [155, 160, 150]
      expect(updatedActivity.max_heartrate).toBe(160);
      expect(updatedActivity.average_heartrate).toBe(155);
    });

    it('trims GPS-less timer stream (Yoga recording with time & heart rate)', () => {
      const timerActivity: Activity = {
        ...mockBaseActivity,
        type: 'Yoga',
        distance: 0,
        start_latlng: [],
        end_latlng: []
      };

      const timerStream: StreamSet = {
        time: {
          data: [0, 60, 120, 180],
          series_type: 'time',
          original_size: 4,
          resolution: 'high'
        },
        heartrate: {
          data: [110, 120, 130, 125],
          series_type: 'heartrate',
          original_size: 4,
          resolution: 'high'
        }
      };

      const { updatedActivity, trimmedStream } = trimActivityStream(
        timerActivity,
        timerStream,
        1,
        3
      );

      expect(trimmedStream.time?.data).toEqual([0, 60, 120]);
      expect(trimmedStream.heartrate?.data).toEqual([120, 130, 125]);
      expect(updatedActivity.elapsed_time).toBe(120);
      expect(updatedActivity.moving_time).toBe(120);
      expect(updatedActivity.distance).toBe(0);
      expect(updatedActivity.average_heartrate).toBe(125);
      expect(updatedActivity.max_heartrate).toBe(130);
    });
  });

  describe('previewTrimmedActivity', () => {
    it('returns preview metrics and negative deltas for tail trim', () => {
      const preview = previewTrimmedActivity(mockBaseActivity, mockGpsStream, 0, 3);

      expect(preview.elapsedTimeSec).toBe(30);
      expect(preview.deltaElapsedTimeSec).toBe(30 - mockBaseActivity.elapsed_time);
      expect(preview.deltaDistanceMeters).toBeLessThan(0);
    });
  });

  describe('buildTrimPreviewStreams', () => {
    it('constructs keptStream and cutStream for visualization', () => {
      const streams = buildTrimPreviewStreams(mockGpsStream, 1, 3, 'end');

      expect(streams.keptStream.coordinates).toHaveLength(3);
      expect(streams.keptStream.coordinates[0]).toEqual({ latitude: 45.181, longitude: 5.7205 });
      expect(streams.cutStream).toBeDefined();
      expect(streams.cutStream?.coordinates.length).toBeGreaterThan(0);
      expect(streams.activeCoordinate).toEqual({ latitude: 45.183, longitude: 5.7215 });
    });

    it('returns empty stream when rawStream has no coordinates', () => {
      const emptyStream: StreamSet = {
        time: { data: [0, 1], series_type: 'time', original_size: 2, resolution: 'high' }
      };
      const streams = buildTrimPreviewStreams(emptyStream, 0, 1);

      expect(streams.keptStream.coordinates).toHaveLength(0);
      expect(streams.cutStream).toBeUndefined();
      expect(streams.activeCoordinate).toBeNull();
    });
  });
});
