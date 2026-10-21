// Constants - Public API
// This file exports all app-wide constants

// Colors
export * from './colors';

// App Configuration
export const APP_CONFIG = {
  BACKUP_ACTIVITIES_FOLDER: 'activities',
  BACKUP_STREAMS_FOLDER: 'streams',
  BACKUP_SYNC_STATE_FILE: 'sync-state.json',
  STREAMS_FOLDER: 'streams/',
  NUM_DIRECTION_ARROWS: 5,
  TRACK_COLORS: {
    PRIMARY: 'red',
    OVERLAY: 'blue',
    FILL_PRIMARY: 'rgba(255,0,0,0.5)'
  }
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  WEBDAV_CONNECTED: 'webdav_connected',
  WEBDAV_BASE_URL: 'webdav_base_url',
  WEBDAV_USERNAME: 'webdav_username',
  BACKUP_LAST_SYNC: 'backup_last_sync',
  WEBDAV_TOMBSTONES: 'webdav_tombstones',
  ACTIVITY_PREFIX: 'a_'
} as const;
