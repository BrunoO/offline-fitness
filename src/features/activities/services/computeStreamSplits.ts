import { haversineDistance } from '@/features/maps/services/flyoverInterpolator';
import { ActivityStream, calculatePaceMinPerKm, calculateSpeedKmh } from '@/shared';

export interface StreamSplit {
  readonly splitNumber: number;
  readonly distanceMeters: number;
  readonly durationSec: number;
  readonly paceMinPerKm: number;
  readonly speedKmh: number;
  readonly elevationDeltaM: number | null;
  readonly avgHeartRateBpm: number | null;
  readonly isPartial: boolean;
  readonly isFastest: boolean;
}

const MIN_PARTIAL_SPLIT_METERS = 100;

interface SplitDraft {
  readonly splitNumber: number;
  readonly distanceMeters: number;
  readonly durationSec: number;
  readonly paceMinPerKm: number;
  readonly speedKmh: number;
  readonly elevationDeltaM: number | null;
  readonly avgHeartRateBpm: number | null;
  readonly isPartial: boolean;
}

function buildSplitDraft(
  splitNumber: number,
  acc: SplitAccumulator,
  endAlt: number | null,
  isPartial: boolean
): SplitDraft {
  const startAlt = acc.splitStartAlt;
  const elevationDeltaM =
    startAlt !== null && endAlt !== null && Number.isFinite(startAlt) && Number.isFinite(endAlt)
      ? Math.round(endAlt - startAlt)
      : null;
  const avgHeartRateBpm = acc.hrCount > 0 ? Math.round(acc.hrSum / acc.hrCount) : null;
  return {
    splitNumber,
    distanceMeters: acc.splitDist,
    durationSec: acc.splitTime,
    paceMinPerKm: calculatePaceMinPerKm(acc.splitDist, acc.splitTime),
    speedKmh: calculateSpeedKmh(acc.splitDist, acc.splitTime),
    elevationDeltaM,
    avgHeartRateBpm,
    isPartial
  };
}

function findFastestFullSplitNumber(drafts: readonly SplitDraft[]): number | null {
  let fastestSplitNumber: number | null = null;
  let bestPace = Number.POSITIVE_INFINITY;
  for (const draft of drafts) {
    if (!draft.isPartial && draft.paceMinPerKm > 0 && draft.paceMinPerKm < bestPace) {
      bestPace = draft.paceMinPerKm;
      fastestSplitNumber = draft.splitNumber;
    }
  }
  return fastestSplitNumber;
}

function getMatchingArray<T>(arr: T[] | undefined, expectedLength: number): T[] | undefined {
  return arr?.length === expectedLength ? arr : undefined;
}

function getValidHeartRate(heartrate: (number | null)[] | undefined, index: number): number | null {
  if (!heartrate) return null;
  const val = heartrate[index];
  return typeof val === 'number' && val > 0 ? val : null;
}

function hasValidCoordinatesAndTime(
  stream: ActivityStream | undefined | null
): stream is ActivityStream & {
  coordinates: NonNullable<ActivityStream['coordinates']>;
  time: NonNullable<ActivityStream['time']>;
} {
  if (!stream?.coordinates || !stream.time) return false;
  return stream.coordinates.length >= 2 && stream.coordinates.length === stream.time.length;
}

interface SplitAccumulator {
  splitDist: number;
  splitTime: number;
  splitStartAlt: number | null;
  hrSum: number;
  hrCount: number;
}

function createInitialAccumulator(
  altitude: number[] | undefined,
  heartrate: (number | null)[] | undefined
): SplitAccumulator {
  const initialHr = getValidHeartRate(heartrate, 0);
  return {
    splitDist: 0,
    splitTime: 0,
    splitStartAlt: altitude?.[0] ?? null,
    hrSum: initialHr ?? 0,
    hrCount: initialHr !== null ? 1 : 0
  };
}

/**
 * Computes 1 km splits (plus an optional partial tail split >= 100 m) from a cached
 * or recorded ActivityStream.
 */
export function computeStreamSplits(
  stream: ActivityStream | undefined | null,
  intervalMeters: number = 1000
): StreamSplit[] {
  if (!hasValidCoordinatesAndTime(stream) || intervalMeters <= 0) {
    return [];
  }

  const coords = stream.coordinates;
  const time = stream.time;
  const altitude = getMatchingArray(stream.altitude, coords.length);
  const heartrate = getMatchingArray(stream.heartrate, coords.length);

  const drafts: SplitDraft[] = [];
  const acc = createInitialAccumulator(altitude, heartrate);

  for (let i = 1; i < coords.length; i++) {
    acc.splitDist += haversineDistance(coords[i - 1], coords[i]);
    acc.splitTime += Math.max(0, time[i] - time[i - 1]);

    const hrVal = getValidHeartRate(heartrate, i);
    if (hrVal !== null) {
      acc.hrSum += hrVal;
      acc.hrCount += 1;
    }

    if (acc.splitDist >= intervalMeters && acc.splitTime > 0) {
      const endAlt = altitude?.[i] ?? null;
      drafts.push(buildSplitDraft(drafts.length + 1, acc, endAlt, false));
      acc.splitDist = 0;
      acc.splitTime = 0;
      acc.splitStartAlt = endAlt;
      acc.hrSum = 0;
      acc.hrCount = 0;
    }
  }

  if (acc.splitDist >= MIN_PARTIAL_SPLIT_METERS && acc.splitTime > 0) {
    const endAlt = altitude?.[coords.length - 1] ?? null;
    drafts.push(buildSplitDraft(drafts.length + 1, acc, endAlt, true));
  }

  const fastestSplitNumber = findFastestFullSplitNumber(drafts);
  return drafts.map(draft => ({
    ...draft,
    isFastest: draft.splitNumber === fastestSplitNumber
  }));
}
