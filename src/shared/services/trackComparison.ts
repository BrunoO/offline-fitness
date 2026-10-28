import { getActivityStreams } from '@/features/activities/services/fetchAndStoreStreams';
import { haversineDistance } from '@/features/maps/services/flyoverInterpolator';
import { Activity, LatLng } from '../types/types';
import { simpleLogger } from './SimpleLogger';

/**
 * Compares two activity tracks and returns a similarity score.
 * @param track1 The first track, an array of LatLng points.
 * @param track2 The second track, an array of LatLng points.
 * @returns A similarity score between 0 and 1.
 */
export function compareTracks(track1: LatLng[], track2: LatLng[]): number {
  if (!track1 || !track2 || track1.length === 0 || track2.length === 0) {
    return 0;
  }

  const n = track1.length;
  const m = track2.length;

  // Scoring function
  const a = 10; // smoothing parameter
  const score = (p1: LatLng, p2: LatLng) => {
    const distance = haversineDistance(p1, p2);
    return a / (a + distance); // score between 0 and 1
  };

  const gapPenalty = -0.5;

  const dp = new Array(n + 1).fill(null).map(() => new Array(m + 1).fill(0));

  // Initialization of the DP table
  for (let i = 0; i <= n; i++) {
    dp[i][0] = i * gapPenalty;
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j * gapPenalty;
  }

  // Fill the DP table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = dp[i - 1][j - 1] + score(track1[i - 1], track2[j - 1]);
      const del = dp[i - 1][j] + gapPenalty;
      const insert = dp[i][j - 1] + gapPenalty;
      dp[i][j] = Math.max(match, del, insert);
    }
  }

  // Normalization: the true maximum for a global alignment is not Math.min(n, m),
  // because the |n - m| extra points in the longer track each cost gapPenalty.
  // True max = Math.min(n, m) * 1.0  +  |n - m| * gapPenalty
  const rawScore = dp[n][m];
  const maxPossibleScore = Math.min(n, m) + Math.abs(n - m) * gapPenalty;

  if (maxPossibleScore <= 0) {
    return 0;
  }

  const normalizedScore = rawScore / maxPossibleScore;
  return Math.max(0, Math.min(1, normalizedScore)); // clamp between 0 and 1
}

export async function findSimilarActivitiesByTrack(
  activity: Activity,
  similarActivities: Activity[]
): Promise<{ activity: Activity; similarity: number }[]> {
  if (similarActivities.length === 0) {
    return [];
  }
  simpleLogger.log(
    `Finding similar activities by track for activity ${activity.id} among ${similarActivities.length} candidates...`
  );
  const streams = await getActivityStreams([activity, ...similarActivities]);

  simpleLogger.log(
    `Found ${streams.length} streams out of ${similarActivities.length + 1} activities`,
    {
      activityId: activity.id,
      similarCount: similarActivities.length,
      streamsFound: streams.length,
      missingStreams: similarActivities.length + 1 - streams.length
    }
  );

  const activityStream = streams.find(s => s.activity.id === activity.id);

  if (!activityStream?.streamSet.coordinates) {
    simpleLogger.warn(`No stream found for current activity ${activity.id}`, {
      activityId: activity.id,
      hasStream: !!activityStream,
      hasCoordinates: !!activityStream?.streamSet.coordinates,
      coordinatesLength: activityStream?.streamSet.coordinates?.length || 0
    });
    return [];
  }

  const similarActivitiesWithTracks = similarActivities.map(otherActivity => {
    const otherActivityStream = streams.find(s => s.activity.id === otherActivity.id);
    if (!otherActivityStream?.streamSet.coordinates) {
      simpleLogger.warn(`No stream found for similar activity ${otherActivity.id}`, {
        activityId: otherActivity.id,
        hasStream: !!otherActivityStream,
        hasCoordinates: !!otherActivityStream?.streamSet.coordinates
      });
      return { activity: otherActivity, similarity: 0 };
    }

    const similarity = compareTracks(
      activityStream.streamSet.coordinates,
      otherActivityStream.streamSet.coordinates
    );
    return { activity: otherActivity, similarity };
  });

  simpleLogger.log(`Completed similarity calculation for activity ${activity.id}`, {
    activityId: activity.id,
    totalSimilar: similarActivitiesWithTracks.length,
    withStreams: similarActivitiesWithTracks.filter(a => a.similarity > 0).length,
    withoutStreams: similarActivitiesWithTracks.filter(a => a.similarity === 0).length
  });

  return similarActivitiesWithTracks;
}
