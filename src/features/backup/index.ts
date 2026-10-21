// Backup Feature - Public API
// WebDAV mirror of local activities and streams (manual push only).

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
  loadWebDavConfig,
  saveWebDavConfig,
  useWebDavBackup,
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
