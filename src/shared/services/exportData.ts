import { APP_CONFIG } from '@/constants';
import { StreamSet } from '@/features/activities';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { Activity } from '../types/types';
import { simpleLogger } from './SimpleLogger';
import { getAllActivitiesKeys, loadAllActivities } from './storage';
import { readStreamFile } from './streamCodec';

// Function to convert activities to CSV
const activitiesToCSV = (activities: Activity[]): string => {
  return Papa.unparse(activities);
};

// Function to generate GPX from a stream
const streamToGPX = (activity: Activity, stream: StreamSet): string => {
  const points =
    (stream.latlng?.data as unknown as [number, number][])
      ?.map((latlng: [number, number], index) => {
        const time = new Date(
          new Date(activity.start_date_utc).getTime() + (stream.time?.data?.[index] || 0) * 1000
        ).toISOString();
        const ele = stream.altitude ? `<ele>${stream.altitude.data[index]}</ele>` : '';
        return `<trkpt lat="${latlng[0]}" lon="${latlng[1]}">${ele}<time>${time}</time></trkpt>`;
      })
      .join('\n') || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OfflineFitness" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${activity.name}</name>
    <time>${activity.start_date_utc}</time>
  </metadata>
  <trk>
    <name>${activity.name}</name>
    <trkseg>
      ${points}
    </trkseg>
  </trk>
</gpx>`;
};

const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
const documentsFolder = new Directory(Paths.document);

/** Chunk names written by previous export runs, current and legacy. */
const EXPORT_CHUNK_PATTERN = /^strava_export(_part_\d+_of_\d+)?\.zip$/;

/**
 * Removes export zips a previous run left behind (a share cancelled or the app
 * killed mid-loop keeps every chunk it had already written).
 */
function removeStaleExportChunks(): void {
  try {
    documentsFolder.list().forEach(entry => {
      if (entry instanceof File && EXPORT_CHUNK_PATTERN.test(entry.name)) {
        try {
          entry.delete();
          simpleLogger.log(`Removed stale export chunk ${entry.name}`);
        } catch (deleteError) {
          simpleLogger.log(`Could not remove stale chunk ${entry.name}: ${deleteError}`);
        }
      }
    });
  } catch (listError) {
    // Nothing to clean and no reason to abort the export over it.
    simpleLogger.log(`Stale export chunk sweep skipped: ${listError}`);
  }
}

/**
 * Adds the activity's cached stream as GPX to the chunk's zip. A failure on a
 * single activity must never abort the export.
 */
async function addStreamToZip(zip: JSZip, activity: Activity): Promise<void> {
  if (!activity.start_latlng) return;
  const file = new File(streamsFolder, `${activity.id}.json`);
  if (!file.exists) return;

  try {
    const stream = await readStreamFile<StreamSet>(file);
    zip.file(`activity_${activity.id}.gpx`, streamToGPX(activity, stream));
  } catch (streamError) {
    simpleLogger.log(`Failed to process stream for activity ${activity.id}: ${streamError}`);
  }
}

/** Chunk file name; multi-part only when the export spans several chunks. */
function chunkFileName(chunkIndex: number, numChunks: number): string {
  return numChunks > 1
    ? `strava_export_part_${chunkIndex + 1}_of_${numChunks}.zip`
    : 'strava_export.zip';
}

/** Builds one export chunk (CSV + stream GPX) and writes it to the documents folder. */
async function buildChunkFile(
  chunkActivities: Activity[],
  chunkIndex: number,
  numChunks: number,
  setProgress: (progress: number) => void
): Promise<File> {
  const zip = new JSZip();
  const csvData = activitiesToCSV(chunkActivities);
  zip.file('activities.csv', csvData);

  for (let i = 0; i < chunkActivities.length; i++) {
    await addStreamToZip(zip, chunkActivities[i]); // NOSONAR - sequential zip population controls RAM and drives progress

    // Update progress for this chunk
    const overallProgress = (chunkIndex + (i + 1) / chunkActivities.length) / numChunks;
    setProgress(overallProgress);
  }

  const fileName = chunkFileName(chunkIndex, numChunks);
  simpleLogger.log(`Chunk ${chunkIndex + 1}: Creating file ${fileName}`);

  const zipFile = new File(Paths.document, fileName);
  const content = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  zipFile.write(content);

  simpleLogger.log(`Created file: ${fileName} at ${zipFile.uri}`);
  return zipFile;
}

/** Shares each file sequentially so users can save all of them. */
async function shareExportFiles(exportedFiles: File[]): Promise<void> {
  for (let i = 0; i < exportedFiles.length; i++) {
    const file = exportedFiles[i];
    simpleLogger.log(`Sharing file ${i + 1}/${exportedFiles.length}: ${file.uri}`);
    await Sharing.shareAsync(file.uri); // NOSONAR - native share sheets require sequential user interaction

    // Once the share sheet returns, the recipient has its own copy. Without
    // this the chunks pile up in app storage — a full export is close to a
    // gigabyte — and Android's backup agent copies them around. A failed
    // delete must never fail the export.
    try {
      file.delete();
    } catch (deleteError) {
      simpleLogger.log(`Could not delete ${file.name} after sharing: ${deleteError}`);
    }

    // Add a small delay between shares to prevent overwhelming the system
    if (i < exportedFiles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // NOSONAR - intentional cooldown between native share sheets
    }
  }
}

// Main export function
export const exportData = async (
  setProgress: (progress: number) => void,
  activitiesToExport?: Activity[]
): Promise<void> => {
  try {
    setProgress(0);
    removeStaleExportChunks();
    let activities: Activity[];
    if (activitiesToExport) {
      activities = activitiesToExport;
    } else {
      const keys = await getAllActivitiesKeys();
      activities = await loadAllActivities(keys);
    }

    const CHUNK_SIZE = 500;
    const totalActivities = activities.length;
    const numChunks = Math.ceil(totalActivities / CHUNK_SIZE);

    simpleLogger.log(
      `Exporting ${totalActivities} activities in ${numChunks} files of ${CHUNK_SIZE} activities each`
    );
    simpleLogger.log(
      `Chunk calculation: ${totalActivities} / ${CHUNK_SIZE} = ${totalActivities / CHUNK_SIZE}, ceil = ${numChunks}`
    );

    const exportedFiles: File[] = [];

    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const startIndex = chunkIndex * CHUNK_SIZE;
      const endIndex = Math.min(startIndex + CHUNK_SIZE, totalActivities);
      const chunkActivities = activities.slice(startIndex, endIndex);

      simpleLogger.log(
        `Processing chunk ${chunkIndex + 1}/${numChunks}: activities ${startIndex + 1}-${endIndex} (${chunkActivities.length} activities)`
      );

      // prettier-ignore
      exportedFiles.push(await buildChunkFile(chunkActivities, chunkIndex, numChunks, setProgress)); // NOSONAR - chunking avoids OOM
    }

    simpleLogger.log(`Total files created: ${exportedFiles.length}`);
    simpleLogger.log(`Files: ${exportedFiles.map(f => f.uri).join(', ')}`);

    await shareExportFiles(exportedFiles);

    setProgress(1);
  } catch (error) {
    simpleLogger.log(`Error exporting data: ${error}`);
    setProgress(0);
  }
};
