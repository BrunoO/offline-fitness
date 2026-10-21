import * as fetchAndStoreStreams from '../src/features/activities/services/fetchAndStoreStreams';
import {
  compareTracks,
  findSimilarActivitiesByTrack
} from '../src/shared/services/trackComparison';
import { Activity } from '../src/shared/types/types';

jest.mock('../src/features/activities/services/fetchAndStoreStreams');

describe('compareTracks', () => {
  it('should return 0 if either track is empty', () => {
    const track1 = [{ latitude: 0, longitude: 0 }];
    const track2: { latitude: number; longitude: number }[] = [];
    expect(compareTracks(track1, track2)).toBe(0);
    expect(compareTracks(track2, track1)).toBe(0);
  });

  it('should return 1 for identical tracks', () => {
    const track1 = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 }
    ];
    const track2 = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 }
    ];
    expect(compareTracks(track1, track2)).toBe(1);
  });

  it('should return a value between 0 and 1 for different tracks', () => {
    const track1 = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 }
    ];
    const track2 = [
      { latitude: 0, longitude: 0 },
      { latitude: 2, longitude: 2 }
    ];
    const similarity = compareTracks(track1, track2);
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });
});

describe('findSimilarActivitiesByTrack', () => {
  const activity1: Activity = { id: '1' } as Activity;
  const activity2: Activity = { id: '2' } as Activity;
  const activity3: Activity = { id: '3' } as Activity;

  const track1 = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 1 }
  ];
  const track2 = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 1 }
  ];
  const track3 = [
    { latitude: 0, longitude: 0 },
    { latitude: 2, longitude: 2 }
  ];

  const mockGetActivityStreams = jest.spyOn(fetchAndStoreStreams, 'getActivityStreams');

  beforeEach(() => {
    mockGetActivityStreams.mockClear();
  });

  it('should return activities with similar tracks', async () => {
    mockGetActivityStreams.mockResolvedValue([
      { activity: { id: '1' }, streamSet: { coordinates: track1 } },
      { activity: { id: '2' }, streamSet: { coordinates: track2 } },
      { activity: { id: '3' }, streamSet: { coordinates: track3 } }
    ] as unknown as Awaited<ReturnType<typeof fetchAndStoreStreams.getActivityStreams>>);

    const similarActivities = [activity2, activity3];
    const result = await findSimilarActivitiesByTrack(activity1, similarActivities);
    // Both activities should be returned since they have some similarity
    expect(
      result.map((a: { activity: Activity; similarity: number }) => a.activity.id)
    ).toEqual(['2', '3']);
  });

  it('should return activities with some similarity even for different tracks', async () => {
    mockGetActivityStreams.mockResolvedValue([
      { activity: { id: '1' }, streamSet: { coordinates: track1 } },
      { activity: { id: '3' }, streamSet: { coordinates: track3 } }
    ] as unknown as Awaited<ReturnType<typeof fetchAndStoreStreams.getActivityStreams>>);

    const similarActivities = [activity3];
    const result = await findSimilarActivitiesByTrack(activity1, similarActivities);
    // The algorithm returns some similarity even for different tracks
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].activity.id).toBe('3');
  });

  it('should return an empty array if the main activity has no stream', async () => {
    mockGetActivityStreams.mockResolvedValue([
      { activity: { id: '2' }, streamSet: { coordinates: track2 } },
      { activity: { id: '3' }, streamSet: { coordinates: track3 } }
    ] as unknown as Awaited<ReturnType<typeof fetchAndStoreStreams.getActivityStreams>>);

    const similarActivities = [activity2, activity3];
    const result = await findSimilarActivitiesByTrack(activity1, similarActivities);
    expect(result).toEqual([]);
  });
});
