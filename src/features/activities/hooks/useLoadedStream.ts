import { useEffect, useState } from 'react';
import { Activity, ActivityWithStream, simpleLogger } from '@/shared';
import { getActivityStreams } from '../services/fetchAndStoreStreams';

/**
 * Loads the stream for a single activity, cancelling stale requests on
 * unmount or when `item` changes. Extracted from `ActivityAnalysisView` to
 * keep the component focused on presentation.
 */
export function useLoadedStream(item: Activity): {
  loadedStream: ActivityWithStream | undefined;
} {
  const [loadedStream, setLoadedStream] = useState<ActivityWithStream | undefined>();

  useEffect(() => {
    let isMounted = true;

    const loadStream = async () => {
      try {
        const streams = await getActivityStreams([item]);
        if (!isMounted) {
          return;
        }

        if (streams.length > 0) {
          setLoadedStream(streams[0]);
        } else {
          simpleLogger.warn('No stream found for activity in ActivityAnalysisView', {
            activityId: item.id
          });
          setLoadedStream(undefined);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        simpleLogger.error('Error loading stream for ActivityAnalysisView:', error);
        setLoadedStream(undefined);
      }
    };

    void loadStream();

    return () => {
      isMounted = false;
    };
  }, [item]);

  return { loadedStream };
}
