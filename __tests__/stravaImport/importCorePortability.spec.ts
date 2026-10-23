import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 0 of `docs/desktop-import-plan.md` carves the archive-import pipeline
 * into a portable core: code that a desktop tool must be able to run outside
 * React Native. The point is fragile — one import of the `@/shared` barrel or
 * `expo-file-system` anywhere in the graph silently re-couples it. This spec
 * is the guard: it reads the core files as text and checks their *value*
 * imports against a closed list.
 *
 * Rules enforced:
 * - Every core file's value imports resolve to another core file, or to a
 *   package on the pure-package list (`papaparse`, `pako` — both plain JS).
 * - `import type` statements are exempt: they are erased at build time, which
 *   is exactly why `types.ts` must spell its navigation import that way.
 * - Phase 5 deleted the app-side archive importer (modal, orchestrator, expo
 *   byte source); a scan below fails the day any reference to that machinery
 *   creeps back into `src/`. Ingestion is `npm run tool:seed` -> WebDAV ->
 *   Restore, and the core's only runtime consumers are the tool and tests.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Runtime dependencies of the portable import core, closed under imports. */
const CORE_FILES = new Set([
  'src/features/strava-import/services/csvParser.ts',
  'src/features/strava-import/services/gpxParser.ts',
  'src/features/strava-import/services/textDecode.ts',
  'src/features/strava-import/services/activityMapper.ts',
  'src/features/strava-import/services/entryNames.ts',
  'src/features/strava-import/services/zipReader.ts',
  'src/features/strava-import/types/import.types.ts',
  'src/shared/services/streamCodec.ts',
  'src/shared/services/SimpleLogger.ts',
  'src/shared/utils/utils.ts',
  'src/shared/utils/activityDates.ts',
  'src/shared/types/types.ts',
  'src/features/backup/services/webdavTransport.ts',
  // Literal configuration only — the tool reads the app id, folder names and
  // schema version from here rather than duplicating them, so this module is
  // part of the portable graph too.
  'src/constants/index.ts',
  // The desktop tool itself: it runs on Node, so the same rule that keeps the
  // core platform-free keeps the tool's modules free of anything the core
  // cannot load. A violation here breaks the tool at run time, not compile
  // time, which is exactly what the guard exists to prevent.
  'scripts/strava-import-tool/state.ts',
  'scripts/strava-import-tool/timezone.ts',
  'scripts/strava-import-tool/nodeSource.ts',
  'scripts/strava-import-tool/zoneLookup.ts',
  'scripts/strava-import-tool/client.ts',
  'scripts/strava-import-tool/args.ts',
  'scripts/strava-import-tool/seed.ts',
  'scripts/strava-import-tool/cli.ts'
]);

/**
 * npm packages whose code runs identically in Node and Hermes. `node:`-prefixed
 * builtins are allowed separately: only the desktop tool uses them, and Node
 * compatibility is the whole point of the seam.
 */
const PURE_PACKAGES = new Set(['papaparse', 'pako']);

/**
 * Desktop-only packages: allowed under `scripts/` and refused anywhere under
 * `src/`, because the phone must never resolve them. `geo-tz` ships ~71 MB of
 * boundary data; importing it from app code would try to bundle that into the
 * APK, and the whole reason zones are derived on the desktop is that the
 * phone has no business loading them.
 */
const DESKTOP_PACKAGES = new Set(['geo-tz']);

interface ImportStatement {
  typeOnly: boolean;
  specifier: string;
}

function extractImports(source: string): ImportStatement[] {
  const statements: ImportStatement[] = [];
  const withFrom = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = withFrom.exec(source)) !== null) {
    statements.push({ typeOnly: /^\s*type\b/.test(match[1]), specifier: match[2] });
  }
  const bare = /^import\s+['"]([^'"]+)['"]/gm;
  while ((match = bare.exec(source)) !== null) {
    statements.push({ typeOnly: false, specifier: match[1] });
  }
  return statements;
}

/** Resolve an import specifier to a repo-relative file path, or null for packages. */
function resolveToLocal(fromFile: string, specifier: string): string | null {
  const asFile = (candidate: string): string | undefined => {
    const absolute = path.join(REPO_ROOT, candidate);
    try {
      return fs.statSync(absolute).isFile() ? candidate : undefined;
    } catch {
      return undefined;
    }
  };
  const candidates = (base: string) =>
    [
      `${base}.ts`,
      `${base}.tsx`,
      path.posix.join(base, 'index.ts'),
      path.posix.join(base, 'index.tsx'),
      base
    ]
      .map(asFile)
      .find(Boolean);

  if (specifier.startsWith('.')) {
    return candidates(path.join(path.dirname(fromFile), specifier)) ?? specifier;
  }
  if (specifier.startsWith('@/')) {
    return candidates(path.join('src', specifier.slice(2))) ?? specifier;
  }
  return null;
}

describe('portable import core (desktop tool, Phase 0)', () => {
  it.each([...CORE_FILES])('%s exists', relative => {
    expect(fs.existsSync(path.join(REPO_ROOT, relative))).toBe(true);
  });

  it.each([...CORE_FILES])('%s imports only core files and pure packages', relative => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    const offenders = extractImports(source)
      .filter(statement => !statement.typeOnly)
      .map(statement => {
        const resolved = resolveToLocal(relative, statement.specifier);
        if (resolved === null) {
          if (statement.specifier.startsWith('node:')) return null; // Node builtin (tool adapters only)
          // Sub-path imports (`pako/dist/...`) count by their package root.
          const packageName = statement.specifier.startsWith('@')
            ? statement.specifier.split('/').slice(0, 2).join('/')
            : statement.specifier.split('/')[0];
          if (PURE_PACKAGES.has(packageName)) return null;
          if (DESKTOP_PACKAGES.has(packageName) && relative.startsWith('scripts/')) return null;
          return `package '${statement.specifier}'`;
        }
        return CORE_FILES.has(resolved) ? null : `'${statement.specifier}' (→ ${resolved})`;
      })
      .filter((offender): offender is string => offender !== null);

    expect(offenders).toEqual([]);
  });

  it('references the platform only through type-only imports, which are erased at build time', () => {
    // `types.ts` keeps its navigation types as `import type` precisely so the
    // core loads with no RN code. A *value* import of react-native/expo/react
    // anywhere in the core breaks the portability promise even when the
    // bindings are only used as types, so value syntax is refused outright.
    const platformModule = /^(?:react-native|expo|expo-|react$|@react-navigation)/;
    for (const relative of CORE_FILES) {
      const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
      for (const { typeOnly, specifier } of extractImports(source)) {
        if (platformModule.test(specifier)) {
          expect({ file: relative, specifier, typeOnly }).toEqual({
            file: relative,
            specifier,
            typeOnly: true
          });
        }
      }
    }
  });

  it('has no barrel imports (the RN-dragging `@/shared`, `@/features`, `@/theme`)', () => {
    // `@/constants` is deliberately NOT on this list: unlike the shared and
    // feature barrels it re-exports nothing but literal data, and the desktop
    // tool must read `APP_CONFIG` from it rather than duplicate the folder
    // names and schema version (the two things that must never drift).
    const barrels = ['@/shared', '@/features', '@/theme'];
    for (const relative of CORE_FILES) {
      const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
      for (const { specifier } of extractImports(source)) {
        const isBarrel = barrels.some(
          barrel => specifier === barrel || specifier.startsWith(`${barrel}/index`)
        );
        expect({ file: relative, specifier, isBarrel }).toEqual({
          file: relative,
          specifier,
          isBarrel: false
        });
      }
    }
  });

  it('has no app-side archive import path any more (Phase 5)', () => {
    // Ingestion is desktop tool -> WebDAV -> Restore. What Phase 5 removed was
    // ~1,500 lines of UI + orchestration, a 1 GB cache-copy path, keep-awake
    // and the picker — re-adding any of it by accident must fail a test, not
    // ship. The names are the ones that module used across the codebase.
    const banned =
      /StravaImportModal|importStravaExport|expoByteSource|expo-keep-awake|pickFileAsync/;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        // The recording feature legitimately uses keep-awake (expo-keep-awake)
        // while a session is live; that is not the Strava archive importer.
        if (entry.isDirectory() && entry.name === 'recording') return;
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && banned.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    walk(path.join(REPO_ROOT, 'src'));
    expect(offenders).toEqual([]);
  });

  it('keeps the byte-source seam behind the ByteSource interface', () => {
    // The core promise: `zipReader` talks to storage only through the seam, so
    // a Node tool can back it with `fs` without touching the reader.
    const reader = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/strava-import/services/zipReader.ts'),
      'utf8'
    );
    expect(reader).toContain('ByteSource');
    expect(reader).toMatch(/export (async )?function readZipEntr(y|ies)\(/);
  });
});
