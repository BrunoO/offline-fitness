import { readFileSync } from 'node:fs';
import { APP_CONFIG } from '@/constants';
import { WebDavConfig, testDavConnection } from '@/features/backup/services/webdavTransport';
import { USAGE, buildConfig, parseArgs, resolvePasswordSource } from './args';
import { createLiveDavClient } from './client';
import { SeedSummary, inspectCollection, seedCollection } from './seed';
import { createGeoZoneLookup } from './zoneLookup';

/**
 * `strava-import` — the desktop ingestion tool from `docs/desktop-import-plan.md`.
 *
 * Run through the repo's `tsx`: `npm run tool:seed -- import --archive …`.
 * Everything hard is reused from the app (the portable import core); this file
 * is wiring, stdin, and human output.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} m ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
}

function readStdinPassword(): string {
  const raw = readFileSync(0, 'utf8');
  const password = raw.replace(/\r?\n$/, '');
  if (password.length === 0) {
    throw new Error('--password-stdin was given but stdin was empty.');
  }
  return password;
}

function reportStatus(config: WebDavConfig): Promise<void> {
  return (async () => {
    const client = createLiveDavClient(config);
    const { marker, state } = await inspectCollection(client);
    console.log(`Collection: ${config.baseUrl}`);
    if (!marker) {
      console.log('  no readable collection.json — nothing (this app) has pushed here yet.');
    } else {
      console.log(`  owner:    ${marker.appId} / ${marker.profile}`);
      console.log(
        `  layout:   version ${marker.schemaVersion} (this tool and the app write version ${APP_CONFIG.BACKUP_SCHEMA_VERSION})`
      );
      if (marker.schemaVersion !== APP_CONFIG.BACKUP_SCHEMA_VERSION) {
        console.log(
          '  WARNING: the folder was written in a layout neither side reads cleanly.\n' +
            '           The phone refuses it; erase it on the server and run `import` to recreate it.'
        );
      }
    }
    const activities = Object.keys(state.activityMd5 ?? {}).length;
    const streams = Object.keys(state.streamMd5 ?? {}).length;
    const tombstones = Object.keys(state.deletedAt ?? {}).length;
    console.log(
      `  index:    ${activities} activities, ${streams} streams, ${tombstones} tombstones`
    );
    console.log(`  synced:   ${state.syncedAt ?? 'never'}`);
  })();
}

function reportSeed(summary: SeedSummary, dryRun: boolean): void {
  const zoneCounts = Object.entries(summary.zones).sort(([, a], [, b]) => b - a);
  const zoneReport =
    zoneCounts.length <= 1
      ? `Zones:      all ${zoneCounts[0]?.[1] ?? 0} in ${zoneCounts[0]?.[0] ?? '—'}`
      : `Zones:      ${zoneCounts.map(([zone, count]) => `${zone} ×${count}`).join(', ')}`;
  // Which files, not just how many — the fine grain that names the next
  // investigation instead of starting it.
  const uploadedIds = [...summary.uploadedActivityIds, ...summary.uploadedStreamNames];
  const idsReport =
    uploadedIds.length === 0
      ? 'IDs:        nothing uploaded'
      : `IDs:        ${uploadedIds.slice(0, 10).join(', ')}` +
        (uploadedIds.length > 10 ? ` (+${uploadedIds.length - 10} more)` : '');
  const lines = [
    `Activities: ${summary.activitiesParsed} parsed — ` +
      `${summary.activitiesUploaded} uploaded, ${summary.activitiesSkipped} already present` +
      (summary.activitiesTombstoned > 0
        ? `, ${summary.activitiesTombstoned} deleted remotely (skipped)`
        : ''),
    `Streams:    ${summary.streamsUploaded} uploaded, ${summary.streamsSkipped} already present`,
    `Skips:      ${summary.activitiesWithoutTrack} manual (no track), ` +
      `${summary.unsupportedTracks} unsupported format (.fit/.tcx), ` +
      `${summary.streamsWithoutTrack} empty tracks, ${summary.failedTracks} failed`,
    `Volume:     ${formatBytes(summary.bytesUploaded)} transferred — archive ${formatDuration(
      summary.timings.archive
    )}, transfer ${formatDuration(summary.timings.transfer)}, total ${formatDuration(
      summary.timings.total
    )}`,
    zoneReport,
    idsReport
  ];
  if (dryRun) {
    lines.unshift(
      'DRY RUN — converted and hashed locally; the counts are what a real run would upload.'
    );
  }
  console.log(`\n${lines.join('\n')}`);
  if (summary.warnings.length > 0) {
    console.log(`Warnings (${summary.warnings.length}):`);
    for (const warning of summary.warnings.slice(0, 20)) {
      console.log(`  - ${warning}`);
    }
    if (summary.warnings.length > 20) {
      console.log(`  … and ${summary.warnings.length - 20} more.`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(USAGE);
    return;
  }

  const passwordSource =
    options.command === 'status' || !options.dryRun ? resolvePasswordSource(options) : '';
  const password = passwordSource === 'stdin' ? readStdinPassword() : passwordSource;
  const config = buildConfig(options, password);
  console.log(`Collection: ${config.baseUrl}`);

  if (options.command === 'status') {
    await reportStatus(config);
    return;
  }

  console.log(`Archive:    ${options.archivePath}`);
  console.log(
    `Timezone:   ${options.timezone}  (fallback for GPS-less rows; tracks derive their own zone)`
  );
  if (!options.dryRun) {
    // Fail fast on a wrong URL/credential rather than mid-upload.
    await testDavConnection({ ...config, baseUrl: config.rootUrl });
  }

  let lastRender = 0;
  const summary = await seedCollection({
    archivePath: options.archivePath as string,
    timezone: options.timezone as string,
    config,
    client: createLiveDavClient(config),
    // Records with a GPS start are bucketed in the zone of that point (a
    // Porto holiday rides on Lisbon time); everything else falls back to
    // --tz. See docs/desktop-import-plan.md, Phase 4.
    lookupZone: createGeoZoneLookup(),
    concurrency: options.concurrency,
    dryRun: options.dryRun,
    onProgress: progress => {
      const now = Date.now();
      if (now - lastRender < 500 && progress.done !== progress.total) return;
      lastRender = now;
      process.stdout.write(`\rWorking:  ${progress.done}/${progress.total} activities`);
    }
  });
  process.stdout.write('\r');
  reportSeed(summary, options.dryRun);
  if (options.dryRun) {
    console.log(
      '\nNext: drop --dry-run to upload. On the phone, drawer → Settings → Restore fills the app.'
    );
  }
}

void main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : String(error);
  if (message === 'fetch failed') {
    // undici's connection-level failure: the URL never answered at all.
    message =
      'Could not reach the WebDAV server (connection failed). Check the --root URL, ' +
      'that the server is up, and that this machine can reach it.';
  }
  console.error(`\nerror: ${message}`);
  process.exitCode = 1;
});
