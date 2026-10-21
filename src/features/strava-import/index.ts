// Strava Import Core - Public API
// The archive-conversion library the desktop seeding tool runs
// (`npm run tool:seed` → `scripts/strava-import-tool/`). Since Phase 5 the phone
// no longer imports archives itself — ingestion is tool -> WebDAV -> Restore —
// so nothing under `src/` consumes this barrel; it documents the public surface
// of the core that the tool and the tests import.

export { parseActivitiesCsv } from './services/csvParser';
export { gpxToStream, parseGpx, toStreamSet, trackBoundingBox } from './services/gpxParser';
export { applySwimMovingTime, rowToActivity, utcToLocalParts } from './services/activityMapper';
export type {
  ByteSource,
  ExportedActivityRow,
  ParsedExport,
  StreamConversionResult,
  ZipEntryInfo
} from './types/import.types';
