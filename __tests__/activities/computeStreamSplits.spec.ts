import { computeStreamSplits } from '@/features/activities/services/computeStreamSplits';
import { ActivityStream, LatLng } from '@/shared';

// ~111,195 m per degree of latitude
const DEG_PER_METER = 1 / 111194.92664455873;

function buildSyntheticStream(
  stepMeters: number,
  steps: number,
  stepSec: number | ((idx: number) => number),
  options?: {
    altitudeFn?: (idx: number) => number;
    heartrateFn?: (idx: number) => number | null;
  }
): ActivityStream {
  const coordinates: LatLng[] = [];
  const time: number[] = [];
  const altitude: number[] = [];
  const heartrate: (number | null)[] = [];

  let currentSec = 0;
  for (let i = 0; i <= steps; i++) {
    coordinates.push({
      latitude: i * stepMeters * DEG_PER_METER,
      longitude: 0
    });
    if (i > 0) {
      currentSec += typeof stepSec === 'function' ? stepSec(i) : stepSec;
    }
    time.push(currentSec);
    if (options?.altitudeFn) {
      altitude.push(options.altitudeFn(i));
    }
    if (options?.heartrateFn) {
      heartrate.push(options.heartrateFn(i));
    }
  }

  return {
    coordinates,
    time,
    altitude: options?.altitudeFn ? altitude : [],
    heartrate: options?.heartrateFn ? heartrate : undefined
  };
}

describe('computeStreamSplits', () => {
  it('returns empty array for missing or invalid streams', () => {
    expect(computeStreamSplits(undefined)).toEqual([]);
    expect(computeStreamSplits(null)).toEqual([]);
    expect(computeStreamSplits({ coordinates: [], time: [], altitude: [] })).toEqual([]);
    expect(
      computeStreamSplits({
        coordinates: [{ latitude: 0, longitude: 0 }],
        time: [0],
        altitude: [0]
      })
    ).toEqual([]);
    expect(
      computeStreamSplits({
        coordinates: [
          { latitude: 0, longitude: 0 },
          { latitude: 0.01, longitude: 0 }
        ],
        time: [0],
        altitude: []
      })
    ).toEqual([]);
  });

  it('computes 1 km splits and flags the fastest full split', () => {
    // 25 steps of 100.5m = ~2,512.5m (2 full splits + ~512.5m partial tail)
    // Split 1 (steps 1..10): 30s per 100m -> ~300s (5:00/km)
    // Split 2 (steps 11..20): 24s per 100m -> ~240s (4:00/km, fastest!)
    // Partial tail (steps 21..25): 18s per 100m (faster pace, but partial so not flagged isFastest)
    const stream = buildSyntheticStream(
      100.5,
      25,
      idx => {
        if (idx <= 10) return 30;
        if (idx <= 20) return 24;
        return 18;
      },
      {
        altitudeFn: idx => 100 + idx * 2, // +2m per step -> +20m per 10-step split
        heartrateFn: idx => (idx % 2 === 0 ? 150 : null) // 150 bpm ignoring nulls
      }
    );

    const splits = computeStreamSplits(stream);
    expect(splits).toHaveLength(3);

    expect(splits[0].splitNumber).toBe(1);
    expect(splits[0].isPartial).toBe(false);
    expect(splits[0].isFastest).toBe(false);
    expect(splits[0].durationSec).toBe(300);
    expect(splits[0].elevationDeltaM).toBe(20);
    expect(splits[0].avgHeartRateBpm).toBe(150);

    expect(splits[1].splitNumber).toBe(2);
    expect(splits[1].isPartial).toBe(false);
    expect(splits[1].isFastest).toBe(true);
    expect(splits[1].durationSec).toBe(240);
    expect(splits[1].elevationDeltaM).toBe(20);
    expect(splits[1].avgHeartRateBpm).toBe(150);

    expect(splits[2].splitNumber).toBe(3);
    expect(splits[2].isPartial).toBe(true);
    expect(splits[2].isFastest).toBe(false);
    expect(splits[2].distanceMeters).toBeGreaterThan(500);
  });

  it('omits trailing partial split when leftover distance is under 100 m', () => {
    // 10 steps of 105m = 1,050m -> 1 full split at step 10 (1,050m), 0m leftover
    const stream = buildSyntheticStream(105, 10, 30);
    const splits = computeStreamSplits(stream);
    expect(splits).toHaveLength(1);
    expect(splits[0].isPartial).toBe(false);
    expect(splits[0].isFastest).toBe(true);
  });
});
