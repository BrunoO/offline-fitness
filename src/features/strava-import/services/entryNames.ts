/**
 * Entry-name helpers for archive paths.
 *
 * Pure module (portable import core — see `docs/desktop-import-plan.md`): the
 * desktop seeding tool resolves archive paths through these helpers, and they
 * must keep agreeing with what the phone's stream cache and backup keys hold,
 * so the rules live here rather than inline in the tool's orchestrator.
 */

/** Track formats the conversion does not read yet. */
const UNSUPPORTED_TRACK_EXTENSIONS = ['.fit', '.fit.gz', '.tcx', '.tcx.gz'];

export function baseNameOf(entryName: string): string {
  const normalized = entryName.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/');
  return (index >= 0 ? normalized.slice(index + 1) : normalized).toLowerCase();
}

export function normalizeEntryPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

export function isUnsupportedTrack(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return UNSUPPORTED_TRACK_EXTENSIONS.some(extension => lower.endsWith(extension));
}
