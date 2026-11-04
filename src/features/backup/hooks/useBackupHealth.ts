import { useCallback, useEffect, useState } from 'react';
import { STALE_BACKUP_MS } from '@/constants';
import { relative_time_label } from '@/shared';

export type BackupHealthStatus = 'healthy' | 'stale' | 'none';

export interface BackupHealth {
  status: BackupHealthStatus;
  label: string;
  stale: boolean;
}

/**
 * Hook to compute the freshness and health status of WebDAV backups.
 * Centralises the 14-day stale check (`STALE_BACKUP_MS`) for reuse
 * across the Home screen and the top-right header avatar badge.
 */
export function useBackupHealth(lastBackupSync: string | null): BackupHealth {
  const computeHealth = useCallback((syncedAt: string | null): BackupHealth => {
    const ago = relative_time_label(syncedAt);
    if (!syncedAt || ago === null) {
      return { status: 'none', label: 'No backup yet', stale: false };
    }
    const isStale = Date.now() - Date.parse(syncedAt) > STALE_BACKUP_MS;
    return {
      status: isStale ? 'stale' : 'healthy',
      label: `Synced ${ago}`,
      stale: isStale
    };
  }, []);

  const [health, setHealth] = useState<BackupHealth>(() => computeHealth(lastBackupSync));

  useEffect(() => {
    setHealth(computeHealth(lastBackupSync));
    const interval = setInterval(() => {
      setHealth(computeHealth(lastBackupSync));
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [lastBackupSync, computeHealth]);

  return health;
}
