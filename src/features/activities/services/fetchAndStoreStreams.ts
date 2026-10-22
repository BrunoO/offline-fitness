import { APP_CONFIG } from '@/constants';
import {
  Activity,
  ActivityWithStream,
  LatLng,
  ActivityStream,
  calculateBoundingBox,
  getAllActivitiesKeys,
  loadAllActivities,
  readStreamFile,
  simpleLogger,
  storeActivity
} from '@/shared';
import { Directory, File, Paths } from 'expo-file-system';
import simplify from 'simplify-js';
import { StreamSet } from '../types/stravaActivityStream.model';

/**
 * The stream cache folder, constructed lazily. Building a `Directory` at module
 * level runs during import, so a bad document directory would take down every
 * consumer of this barrel rather than just the cache. The getter degrades to
 * `null` when the folder cannot be created, and every consumer below treats
 * that as "no cache" instead of throwing.
 */
let cachedStreamsFolder: Directory | null | undefined;
function streamsFolder(): Directory | null {
  if (cachedStreamsFolder === undefined) {
    try {
      cachedStreamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
    } catch (error) {
      simpleLogger.error('Stream cache unavailable on this platform:', error);
      cachedStreamsFolder = null;
    }
  }
  return cachedStreamsFolder;
}
// Guards local file operations (delete vs. bounding-box backfill) against each other.
const processingActivities = new Set<string>();

/**
 * Deletes all stream files for a given activity ID.
 *
 * @param {string} activityId - The ID of the activity to delete stream files for.
 * @throws {Error} Throws an error if the deletion fails.
 */
export function deleteStreamFiles(activityId: string): void {
  if (processingActivities.has(activityId)) {
    simpleLogger.log(`Activity ${activityId} is being processed, skipping delete`);
    return;
  }
  processingActivities.add(activityId);
  try {
    const folder = streamsFolder();
    if (folder?.exists) {
      const files = folder.list();
      const filesToDelete = files.filter(file => file.name.startsWith(`${activityId}.`));

      // File.delete() is synchronous; a failing delete throws into the catch
      // below and rethrows, preserving the old reject-then-rethrow contract.
      for (const file of filesToDelete) {
        file.delete();
      }

      simpleLogger.log(`Deleted ${filesToDelete.length} stream files for activity ${activityId}`);
    }
  } catch (error) {
    simpleLogger.error('Error deleting stream files:', error);
    throw error;
  } finally {
    processingActivities.delete(activityId);
  }
}

/**
 * The set of activity ids that have no stream and never will — the successor
 * to the importer's ".nostreamflag" files, which no longer exist (the phone
 * stopped importing archives; the desktop tool uploads no flags, matching
 * what the app's push has always skipped). The meaning is derived instead:
 * the importer wrote a flag exactly when the record's `start_latlng` was
 * still empty after all track handling, so "no fix on the record *and* no
 * cached stream file" reproduces the same set on legacy installs while also
 * working for collections filled by the desktop tool + Restore. The file
 * check keeps it honest for records whose position fields never got
 * backfilled even though a stream is cached.
 */
export const getNoStreamIds = (activities: readonly Activity[]): Promise<Set<string>> =>
  Promise.resolve(computeNoStreamIds(activities));

/** Synchronous core; the Promise signature above is kept for its async callers. */
function computeNoStreamIds(activities: readonly Activity[]): Set<string> {
  const streamIds = new Set<string>();
  try {
    const folder = streamsFolder();
    if (folder?.exists) {
      for (const file of folder.list()) {
        if (file.name.endsWith('.json')) {
          streamIds.add(file.name.slice(0, -'.json'.length));
        }
      }
    }
  } catch (error) {
    simpleLogger.error('Error listing the streams cache:', error);
    return new Set();
  }
  const noStream = new Set<string>();
  for (const activity of activities) {
    const hasFix = Array.isArray(activity.start_latlng) && activity.start_latlng.length >= 2;
    const id = String(activity.id);
    if (!hasFix && !streamIds.has(id)) {
      noStream.add(id);
    }
  }
  return noStream;
}

/**
 * Compresses a given stream set using Ramer-Douglas-Peucker simplification.
 *
 * @param {StreamSet} streamSet - The stream set to be compressed.
 * @returns {ActivityStream} - The compressed stream set with simplified coordinates.
 */
export const compressStreamSet = (streamSet: StreamSet): ActivityStream => {
  let coordinatesResult: LatLng[] = [];
  if (streamSet.latlng?.data) {
    const coordinates = streamSet.latlng.data.map(latlng => ({
      latitude: latlng[0],
      longitude: latlng[1]
    }));
    coordinatesResult = simplifyTrack(coordinates);
  }

  let altitudeResult: number[] = [];
  if (streamSet.altitude?.data) {
    altitudeResult = streamSet.altitude.data;
  }
  let timeResult: number[] = [];
  if (streamSet.time?.data) {
    timeResult = streamSet.time.data;
  }
  return {
    coordinates: coordinatesResult,
    altitude: altitudeResult,
    time: timeResult
  };
};
/**
 * Simplifies a track by reducing the number of points while preserving the essential shape.
 *
 * @param {LatLng[]} coordinates - Array of latitude/longitude coordinates representing the track
 * @param {number} tolerance - Controls the level of simplification. Higher values result in more aggressive simplification. Default is 0.0001
 * @returns {LatLng[]} Simplified array of coordinates
 *
 * @remarks
 * Uses the Ramer-Douglas-Peucker algorithm via simplify-js to reduce the number of points in the track.
 * The tolerance parameter determines how aggressively points are removed - higher values mean more simplification.
 * Coordinates are converted to x/y format for the algorithm and back to lat/lng for the return value.
 * Logs the percentage reduction in number of points achieved.
 */

function simplifyTrack(coordinates: LatLng[], tolerance: number = 0.0001): LatLng[] {
  // Convert to format expected by simplify-js
  const points = coordinates.map(coord => ({
    x: coord.longitude,
    y: coord.latitude
  }));

  // Apply simplification
  const simplified = simplify(points, tolerance, true);
  // simpleLogger.log(
  //   `Simplified track from ${points.length} to ${simplified.length} points (${Math.round((1 - simplified.length / points.length) * 100)}% reduction)`
  // );

  // Convert back to LatLng format
  return simplified.map(point => ({
    latitude: point.y,
    longitude: point.x
  }));
}

/**
 * Loads the most recent stream from the file system.
 * @returns A promise that resolves to the most recent stream, or null if no streams are found.
 */
export const loadMostRecentStream = async (): Promise<ActivityStream | null> => {
  const folder = streamsFolder();
  if (!folder?.exists) {
    return null;
  }
  const files = folder.list();
  const jsonFiles = files.filter(file => file.name.endsWith('.json'));

  if (jsonFiles.length === 0) {
    return null;
  }

  const mostRecentFile = jsonFiles.reduce((latest, file) => {
    const latestTime = Number.parseInt(latest.name.split('.')[0], 10);
    const fileTime = Number.parseInt(file.name.split('.')[0], 10);
    return fileTime > latestTime ? file : latest;
  }, jsonFiles[0]);

  try {
    const stream = await readStreamFile<StreamSet>(mostRecentFile as File);
    return compressStreamSet(stream);
  } catch (error) {
    simpleLogger.error('Failed to parse most recent stream file — file may be corrupt:', error);
    return null;
  }
};

/**
 * Gets the streams for all activities.
 * @param allActivities The activities to get the streams for.
 * @returns A promise that resolves to an array of enriched activities.
 */
export const getActivityStreams = async (allActivities: Activity[]) => {
  const activityStreams: ActivityWithStream[] = [];
  const folder = streamsFolder();
  if (!folder) {
    return activityStreams;
  }

  for (const activity of allActivities) {
    const file = new File(folder, `${activity.id}.json`);

    if (file.exists) {
      try {
        const stream = await readStreamFile<StreamSet>(file); // NOSONAR - sequential disk read avoids OOM on large sets
        const compressedStream = compressStreamSet(stream);
        if (!activity.bounding_box && compressedStream.coordinates.length > 0) {
          activity.bounding_box = calculateBoundingBox(compressedStream.coordinates);
          if (activity.bounding_box) {
            await storeActivity(activity); // NOSONAR - sequential persistence avoids storage bridge congestion
          }
        }
        activityStreams.push({ activity, streamSet: compressedStream });
      } catch (error) {
        simpleLogger.error(`Error reading stream for activity ${activity.id}:`, error);
      }
    }
  }

  return activityStreams;
};

/**
 * Loads the stream for a single activity from the file system.
 * @param activity The activity to load the stream for.
 * @returns A promise that resolves to the stream, or null if not found.
 */
export const loadStreamForActivity = async (activity: Activity): Promise<ActivityStream | null> => {
  const folder = streamsFolder();
  if (!folder) {
    return null;
  }
  const file = new File(folder, `${activity.id}.json`);

  if (!file.exists) {
    return null;
  }

  try {
    const stream = await readStreamFile<StreamSet>(file);
    return compressStreamSet(stream);
  } catch (error) {
    simpleLogger.error(`Error reading stream for activity ${activity.id}:`, error);
    return null;
  }
};

/**
 * Loads the raw (unsimplified) stream for a single activity from the file system.
 * Returns the original latlng/altitude/time series, before the simplification
 * the map views apply.
 * @param activity The activity to load the stream for.
 * @returns A promise that resolves to the raw stream set, or null if not found.
 */
export const loadRawStreamForActivity = async (activity: Activity): Promise<StreamSet | null> => {
  const folder = streamsFolder();
  if (!folder) {
    return null;
  }
  const file = new File(folder, `${activity.id}.json`);

  if (!file.exists) {
    return null;
  }

  try {
    return await readStreamFile<StreamSet>(file);
  } catch (error) {
    simpleLogger.error(`Error reading stream for activity ${activity.id}:`, error);
    return null;
  }
};

/**
 * Counts the cached stream files and the activities that will never have one
 * (derived from the records — see `getNoStreamIds`). Home's "Streams x / y"
 * row divides by `totalActivitiesStored - missingStreams`.
 */
export const countStreamsStatus = async (
  activities: readonly Activity[]
): Promise<{ downloadedStreams: number; missingStreams: number }> => {
  try {
    const missingStreams = (await getNoStreamIds(activities)).size;
    const folder = streamsFolder();
    if (!folder?.exists) {
      return { downloadedStreams: 0, missingStreams };
    }
    const files = folder.list();
    const downloadedStreams = files.filter(file => file.name.endsWith('.json')).length;
    return { downloadedStreams, missingStreams };
  } catch (error) {
    simpleLogger.error('Error counting streams status:', error);
    throw error;
  }
};

/**
 * Computes and stores the bounding box for one activity from its cached
 * stream. Returns whether a record was written.
 */
async function backfillBoundingBox(activity: Activity): Promise<boolean> {
  processingActivities.add(activity.id);
  const folder = streamsFolder();
  if (!folder) {
    processingActivities.delete(activity.id);
    return false;
  }
  const file = new File(folder, `${activity.id}.json`);
  try {
    if (!file.exists) {
      return false;
    }
    const stream = await readStreamFile<StreamSet>(file);
    const compressedStream = compressStreamSet(stream);
    if (compressedStream.coordinates.length === 0) {
      return false;
    }
    activity.bounding_box = calculateBoundingBox(compressedStream.coordinates);
    if (!activity.bounding_box) {
      return false;
    }
    await storeActivity(activity);
    return true;
  } catch (error) {
    simpleLogger.error(`Error processing stream for activity ${activity.id}:`, error);
    return false;
  } finally {
    processingActivities.delete(activity.id);
  }
}

/**
 * Calculates and stores the bounding boxes for all activities that are missing them.
 */
export const calculateAndStoreMissingBoundingBoxes = async () => {
  simpleLogger.log('Checking for missing bounding boxes...');
  const allKeys = await getAllActivitiesKeys();
  const allActivities = await loadAllActivities(allKeys);

  let updatedCount = 0;

  for (const activity of allActivities) {
    if (processingActivities.has(activity.id)) {
      simpleLogger.log(`Activity ${activity.id} is being processed, skipping`);
      continue;
    }
    if (!activity.bounding_box) {
      // prettier-ignore
      if (await backfillBoundingBox(activity)) { // NOSONAR - backfill runs sequentially to avoid storage race
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    simpleLogger.log(`Updated ${updatedCount} activities with bounding boxes.`);
  } else {
    simpleLogger.log('No activities needed bounding box updates.');
  }
};

/**
 * Corrects stored Swim activities by forcing total_elevation_gain to 0.
 */
export const correctSwimElevationGain = async () => {
  simpleLogger.log('Checking Swim activities elevation gain...');
  const allKeys = await getAllActivitiesKeys();
  const allActivities = await loadAllActivities(allKeys);

  let updatedCount = 0;

  for (const activity of allActivities) {
    if (activity.type === 'Swim' && activity.total_elevation_gain !== 0) {
      activity.total_elevation_gain = 0;
      await storeActivity(activity); // NOSONAR - sequential update avoids storage bridge congestion
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    simpleLogger.log(`Corrected elevation gain for ${updatedCount} Swim activities.`);
  } else {
    simpleLogger.log('No Swim activities needed elevation correction.');
  }
};

/* const moveFilesToSubfolder = async () => {
  const streamsFolderUri = FileSystem.documentDirectory + APP_CONFIG.STREAMS_FOLDER;
  const folderInfo = await FileSystem.getInfoAsync(streamsFolderUri);

  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(streamsFolderUri);
  }

  const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  for (const file of jsonFiles) {
    const oldPath = FileSystem.documentDirectory + file;
    const newPath = streamsFolderUri + file;
    await FileSystem.moveAsync({
      from: oldPath,
      to: newPath,
    });
  }
}; */
