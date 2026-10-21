/**
 * Pin the process timezone before any activity mapping runs.
 *
 * `rowToActivity` derives `local_date`/`local_time`/`start_week`/`utc_offset`
 * from `Date` local methods, which read the *process* timezone. On the phone
 * that is the athlete's own zone; on a computer it is whatever the machine is
 * set to, so the desktop tool must pin it explicitly or a run from a laptop in
 * a different zone silently moves activities across day/week/year buckets.
 *
 * Node applies `process.env.TZ` to subsequent `Date` operations, but that is a
 * runtime behavior worth verifying rather than assuming: we check it through
 * `Intl` and fail with the fallback that always works (start the process with
 * `TZ=` in the environment) instead of importing into a shifted timezone.
 */
export function applyTimezone(label: string): void {
  let canonical: string;
  try {
    canonical = Intl.DateTimeFormat(undefined, { timeZone: label }).resolvedOptions().timeZone;
  } catch {
    throw new Error(
      `Unknown IANA timezone "${label}". Use a zone like "Europe/Paris", "America/New_York" or "UTC" — ` +
        'the one the phone that will read these records is set to.'
    );
  }

  process.env.TZ = label;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved !== canonical) {
    throw new Error(
      `Could not pin the timezone to "${label}" (this runtime reports "${resolved}"). ` +
        `Re-run with the timezone in the environment instead: TZ=${label} <same command>`
    );
  }
}
