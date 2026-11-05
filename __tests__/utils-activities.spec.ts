import { Activity } from '../src/shared/types/types';
import { findSimilarActivities, getDefaultIoUThreshold } from '../src/shared/utils/utils';

describe('findSimilarActivities', () => {
  const activity1: Activity = {
    id: '1',
    name: 'Morning Run',
    type: 'Run',
    start_date_local: '2023-01-01T08:00:00Z',
    local_date: '2023-01-01',
    local_time: '08:00:00',
    start_timestamp_utc: Date.parse('2023-01-01T08:00:00Z'),
    timezone: '(GMT+00:00) UTC',
    start_latlng: [0, 0],
    end_latlng: [0, 0],
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 50,
    average_speed: 2.77,
    elev_high: 50,
    elev_low: 0,
    start_day: 1,
    start_month: 0,
    start_week: 1,
    start_year: 2023,
    bounding_box: [
      [0, 0],
      [1, 1]
    ],
    utc_offset: 0,
    start_date_utc: '2023-01-01T08:00:00Z'
  };

  const activity2: Activity = { ...activity1, id: '2' }; // Same type and bbox, IoU = 1

  const activity3: Activity = { ...activity1, id: '3', type: 'Walk' }; // Different type

  const activity4: Activity = {
    ...activity1,
    id: '4',
    bounding_box: [
      [2, 2],
      [3, 3]
    ]
  }; // Different bbox, IoU = 0

  const activity5: Activity = { ...activity1, id: '5', bounding_box: undefined }; // No bbox

  const activity6: Activity = {
    ...activity1,
    id: '6',
    bounding_box: [
      [0, 0],
      [1, 1.1]
    ]
  }; // High IoU ~0.9

  const activity7: Activity = {
    ...activity1,
    id: '7',
    bounding_box: [
      [0.5, 0.5],
      [1.5, 1.5]
    ]
  }; // Low IoU ~0.14

  const allActivities: Activity[] = [
    activity1,
    activity2,
    activity3,
    activity4,
    activity5,
    activity6,
    activity7
  ];

  it('should return activities with high IoU', () => {
    const similar = findSimilarActivities(activity1, allActivities);
    expect(similar.map(a => a.id).sort()).toEqual(['2', '6']);
  });

  it('should not return activities with low IoU with default threshold', () => {
    const similar = findSimilarActivities(activity1, allActivities);
    expect(similar.some(a => a.id === '7')).toBe(false);
  });

  it('should return activities with IoU above a custom threshold', () => {
    const similar = findSimilarActivities(activity1, allActivities, 0.1);
    expect(similar.map(a => a.id).sort()).toEqual(['2', '6', '7']);
  });

  it('should not include the activity itself in the results', () => {
    const similar = findSimilarActivities(activity1, allActivities);
    expect(similar.some(a => a.id === activity1.id)).toBe(false);
  });

  it('should return an empty array if no similar activities are found', () => {
    const singleActivityList = [activity1, activity3, activity4, activity5];
    const similar = findSimilarActivities(activity1, singleActivityList);
    expect(similar).toEqual([]);
  });

  it('should return an empty array if the input activity has no bounding box', () => {
    const similar = findSimilarActivities(activity5, allActivities);
    expect(similar).toEqual([]);
  });

  it('should ignore other activities that have no bounding box', () => {
    const activity8 = { ...activity1, id: '8' };
    const activitiesWithMissingBbox = [activity1, activity5, activity8];
    const similar = findSimilarActivities(activity1, activitiesWithMissingBbox);
    expect(similar).toEqual([activity8]);
  });

  it('should return an empty array if the list of all activities is empty', () => {
    const similar = findSimilarActivities(activity1, []);
    expect(similar).toEqual([]);
  });

  it('should use sport-adapted default threshold for swims', () => {
    // Swim with moderate overlap (~0.3 IoU) should match under swim default (0.25)
    const swim1: Activity = {
      ...activity1,
      id: 's1',
      type: 'Swim',
      distance: 1500,
      bounding_box: [
        [43.0, 6.0],
        [43.002, 6.002]
      ]
    };
    const swim2: Activity = {
      ...swim1,
      id: 's2',
      bounding_box: [
        [43.0008, 6.0008],
        [43.0028, 6.0028]
      ]
    };
    // Intersection: [43.0008, 6.0008] to [43.002, 6.002] = 0.0012 * 0.0012 = 0.00000144
    // Each box: 0.002 * 0.002 = 0.000004
    // Union: 0.000008 - 0.00000144 = 0.00000656
    // IoU: ~0.22
    // With a slightly closer box:
    const swim3: Activity = {
      ...swim1,
      id: 's3',
      bounding_box: [
        [43.0005, 6.0005],
        [43.0025, 6.0025]
      ]
    };
    // Intersection: 0.0015 * 0.0015 = 0.00000225, Union: 0.00000575, IoU ~0.39
    const similar = findSimilarActivities(swim1, [swim1, swim2, swim3]);
    expect(similar.map(s => s.id)).toEqual(['s3']);
  });
});

describe('getDefaultIoUThreshold', () => {
  it('returns 0.7 if activity is null/undefined', () => {
    expect(getDefaultIoUThreshold(null)).toBe(0.7);
    expect(getDefaultIoUThreshold(undefined)).toBe(0.7);
  });

  it('returns 0.25 for Swim', () => {
    expect(getDefaultIoUThreshold({ type: 'Swim', distance: 1500 } as Activity)).toBe(0.25);
    expect(getDefaultIoUThreshold({ type: 'Swim', distance: 10000 } as Activity)).toBe(0.25);
  });

  it('returns 0.45 for short activities (< 3000m)', () => {
    expect(getDefaultIoUThreshold({ type: 'Run', distance: 2500 } as Activity)).toBe(0.45);
    expect(getDefaultIoUThreshold({ type: 'Ride', distance: 1200 } as Activity)).toBe(0.45);
  });

  it('returns 0.50 for Walk and Hike', () => {
    expect(getDefaultIoUThreshold({ type: 'Walk', distance: 5000 } as Activity)).toBe(0.5);
    expect(getDefaultIoUThreshold({ type: 'Hike', distance: 12000 } as Activity)).toBe(0.5);
  });

  it('returns 0.60 for Run and TrailRun', () => {
    expect(getDefaultIoUThreshold({ type: 'Run', distance: 10000 } as Activity)).toBe(0.6);
    expect(getDefaultIoUThreshold({ type: 'TrailRun', distance: 25000 } as Activity)).toBe(0.6);
  });

  it('returns 0.70 for Ride and longer activities', () => {
    expect(getDefaultIoUThreshold({ type: 'Ride', distance: 45000 } as Activity)).toBe(0.7);
    expect(getDefaultIoUThreshold({ type: 'NordicSki', distance: 15000 } as Activity)).toBe(0.7);
  });
});
