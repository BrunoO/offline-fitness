/**
 * Entry-name helpers for archive paths.
 *
 * Pure module (portable import core — see `docs/desktop-import-plan.md`): the
 * phone importer and the desktop seeding tool must agree on exactly which ZIP
 * entries count as tracks and how their names resolve, so the rules live here
 * rather than in either orchestrator.
 */

/** Track formats present in exports that this importer does not parse yet. */
const UNSUPPORTED_TRACK_EXTENSIONS = ['.fit', '.fit.gz', '.tcx', '.tcx.gz'];

export function baseNameOf(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return (index >= 0 ? normalized.slice(index + 1) : normalized).toLowerCase();
}

export function normalizeEntryPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

export function isUnsupportedTrack(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return UNSUPPORTED_TRACK_EXTENSIONS.some(extension => lower.endsWith(extension));
}
