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
  BACKUP_PROFILE_FILE: 'profile.json',
  // Marker file recording which app id and profile own a collection, so two
  // athletes sharing one account cannot mix each other's data.
  BACKUP_COLLECTION_FILE: 'collection.json',
  // Layout version of a backup collection, recorded in `collection.json` and
  // verified on every push and restore. Bump it whenever the *meaning* of the
  // files in the collection changes in a way an older app cannot read: the
  // stream payload encoding, the folder layout, the file naming, the sync-state
  // shape. A mismatch is refused rather than half-restored, because the remote
  // index lists files the reading app cannot interpret.
  //   1 = stream files as UTF-8 JSON (no marker field: a marker without a
  //       `schemaVersion` is read as 1)
  //   2 = stream files as the compact binary `'OF'` payload (`streamCodec.ts`)
  // Distinct from the per-file codec version byte inside a stream file: that
  // describes one payload, this describes the whole collection.
  BACKUP_SCHEMA_VERSION: 2,
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
  MANUAL_LAST_TYPE: 'manual_last_type',
  MANUAL_CUSTOM_TYPES: 'manual_custom_types',
  RECORDING_LAST_PROFILE: 'recording_last_profile',
  DISMISSED_SWIPE_TIP: 'dismissed_swipe_tip',
  ACTIVITY_PREFIX: 'a_'
} as const;
