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

// Main export function
export const exportData = async (
  setProgress: (progress: number) => void,
  activitiesToExport?: Activity[]
): Promise<string | null> => {
  try {
    setProgress(0);
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

      const zip = new JSZip();
      const csvData = activitiesToCSV(chunkActivities);
      zip.file('activities.csv', csvData);

      for (let i = 0; i < chunkActivities.length; i++) {
        const activity = chunkActivities[i];
        if (activity.start_latlng) {
          const file = new File(streamsFolder, `${activity.id}.json`);

          if (file.exists) {
            try {
              const stream = await readStreamFile<StreamSet>(file);
              const gpxData = streamToGPX(activity, stream);
              zip.file(`activity_${activity.id}.gpx`, gpxData);
            } catch (streamError) {
              simpleLogger.log(
                `Failed to process stream for activity ${activity.id}: ${streamError}`
              );
            }
          }
        }

        // Update progress for this chunk
        const chunkProgress = (i + 1) / chunkActivities.length;
        const overallProgress = (chunkIndex + chunkProgress) / numChunks;
        setProgress(overallProgress);
      }

      const chunkFileName =
        numChunks > 1
          ? `strava_export_part_${chunkIndex + 1}_of_${numChunks}.zip`
          : 'strava_export.zip';

      simpleLogger.log(`Chunk ${chunkIndex + 1}: Creating file ${chunkFileName}`);

      const zipFile = new File(Paths.document, chunkFileName);

      const content = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      zipFile.write(content);

      exportedFiles.push(zipFile);
      simpleLogger.log(`Created file: ${chunkFileName} at ${zipFile.uri}`);
    }

    simpleLogger.log(`Total files created: ${exportedFiles.length}`);
    simpleLogger.log(`Files: ${exportedFiles.map(f => f.uri).join(', ')}`);

    // Share each file sequentially so users can save all of them
    for (let i = 0; i < exportedFiles.length; i++) {
      const file = exportedFiles[i];
      simpleLogger.log(`Sharing file ${i + 1}/${exportedFiles.length}: ${file.uri}`);
      await Sharing.shareAsync(file.uri);

      // Add a small delay between shares to prevent overwhelming the system
      if (i < exportedFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setProgress(1);
    return exportedFiles.length > 0 ? exportedFiles[0].uri : null;
  } catch (error) {
    simpleLogger.log(`Error exporting data: ${error}`);
    setProgress(0);
    return null;
  }
};
