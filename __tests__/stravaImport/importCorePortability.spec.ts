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
 * - The app-only adapters (`importStravaExport.ts`, `expoByteSource.ts`) are
 *   deliberately NOT in the core: they own the expo/native half of the seam.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Runtime dependencies of the portable import core, closed under imports. */
const CORE_FILES = new Set([
  'src/features/strava-import/services/csvParser.ts',
  'src/features/strava-import/services/gpxParser.ts',
  'src/features/strava-import/services/textDecode.ts',
  'src/features/strava-import/services/activityMapper.ts',
  'src/features/strava-import/services/zipReader.ts',
  'src/features/strava-import/types/import.types.ts',
  'src/shared/services/streamCodec.ts',
  'src/shared/utils/utils.ts',
  'src/shared/utils/activityDates.ts',
  'src/shared/types/types.ts'
]);

/** npm packages whose code runs identically in Node and Hermes. */
const PURE_PACKAGES = new Set(['papaparse', 'pako']);

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
  const candidates = (base: string) =>
    ['', '.ts', '.tsx']
      .map(extension => path.normalize(base + extension))
      .find(candidate => fs.existsSync(path.join(REPO_ROOT, candidate)));

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
          // Sub-path imports (`pako/dist/...`) count by their package root.
          const packageName = statement.specifier.startsWith('@')
            ? statement.specifier.split('/').slice(0, 2).join('/')
            : statement.specifier.split('/')[0];
          return PURE_PACKAGES.has(packageName) ? null : `package '${statement.specifier}'`;
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

  it('has no barrel imports (the RN-dragging `@/shared`, `@/constants`, `@/features`, `@/theme`)', () => {
    const barrels = ['@/shared', '@/constants', '@/theme', '@/features'];
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

  it('moves the expo-backed byte source out of the ZIP reader', () => {
    const reader = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/strava-import/services/zipReader.ts'),
      'utf8'
    );
    expect(reader).not.toContain('expo-file-system');
    expect(reader).toContain('createMemoryByteSource');
    const seam = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/strava-import/services/expoByteSource.ts'),
      'utf8'
    );
    expect(seam).toContain('createFileByteSource');
    expect(seam).toContain('expo-file-system');
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
