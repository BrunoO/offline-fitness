// Constants - Public API
// This file exports all app-wide constants

// App Configuration
export const APP_CONFIG = {
  // Namespace for this app's backup collections inside the user's WebDAV
  // account. Must stay stable across releases: a rename would orphan the
  // backups written under the old name.
  BACKUP_APP_ID: 'offline-fitness',
  BACKUP_ACTIVITIES_FOLDER: 'activities',
  BACKUP_STREAMS_FOLDER: 'streams',
  BACKUP_SYNC_STATE_FILE: 'sync-state.json',
  // Marker file recording which app id and profile own a collection, so two
  // athletes sharing one account cannot mix each other's data.
  BACKUP_COLLECTION_FILE: 'collection.json',
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
  WEBDAV_PROFILE: 'webdav_profile',
  BACKUP_LAST_SYNC: 'backup_last_sync',
  WEBDAV_TOMBSTONES: 'webdav_tombstones',
  ACTIVITY_PREFIX: 'a_'
} as const;
