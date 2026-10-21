import { find } from 'geo-tz';

/**
 * GPS start point -> IANA timezone, for the desktop tool only.
 *
 * The archive stores no timezone (see the investigation in
 * `docs/desktop-import-plan.md`, Phase 4), but every track's GPX records the
 * first fix, and `geo-tz` answers "which zone contains this point" offline
 * from the IANA boundary database — the same approach Strava itself uses to
 * label an activity's local time.
 *
 * Two properties matter for backup integrity:
 * - **Determinism**: a record's md5 depends on the zone answer, so the
 *   `geo-tz` version is pinned in devDependencies; upgrading it is a data
 *   migration, not a routine bump (border changes can re-bucket travel
 *   activities and re-upload the affected records once).
 * - **Never fatal**: coordinates over water or a malformed track mean "no
 *   zone" — the seed falls back to `--tz`, the same zone a build without this
 *   lookup would have produced. An unknown ocean point must not abort a
 *   2,000-record run.
 *
 * It lives in `scripts/`, not `src/`, on purpose: the 71 MB boundary data
 * must stay out of the app bundle, and the phone side never needs it (its
 * device zone is its own source of truth).
 */

export type ZoneLookup = (lat: number, lon: number) => string | undefined;

export function createGeoZoneLookup(): ZoneLookup {
  return (lat, lon) => {
    // Guard the bounds first: `find` throws on out-of-range input, and a
    // corrupt GPX should degrade to the fallback zone, not to a stack trace.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
    try {
      const zones = find(lat, lon);
      // Contested areas (e.g. the Donbas, Jerusalem) can return two TZIDs;
      // the database's own order is deterministic for a pinned version.
      return zones.length > 0 ? zones[0] : undefined;
    } catch {
      return undefined;
    }
  };
}
