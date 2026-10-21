// Backup Feature - Public API
// WebDAV mirror of local activities and streams (manual push and restore).

// Services
export {
  WebDavTransportError,
  ensureDavFolder,
  getDavFile,
  putDavFile,
  testDavConnection,
  type WebDavConfig
} from './services/webdavTransport';
export {
  clearWebDavConfig,
  collectionUrlFor,
  loadWebDavConfig,
  saveWebDavConfig,
  useWebDavBackup,
  validateProfile,
  type WebDavBackupHook
} from './services/webdavAuth';
export {
  pullBackupNow,
  pushBackupNow,
  type RestoreSummary,
  type SyncProgress,
  type SyncSummary
} from './services/backupSync';

// Components
export { BackupSection } from './components/BackupSection';
