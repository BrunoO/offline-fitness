#!/usr/bin/env node
/**
 * Mobile-Only Guard
 *
 * The app targets Android and iOS only; the react-native-web attempt was
 * removed in favour of a smaller, testable surface (see
 * `docs/drop-web-support-plan.md`). This check keeps the web target from
 * growing back by inspecting the repository's shape:
 *
 *   1. no `*.web.{ts,tsx,js,jsx}` file under `src/` or `__tests__/`
 *   2. no `Platform.OS === 'web'`, `isWeb`, or `web:` key inside a
 *      `Platform.select` in `src/`
 *   3. no web-only dependency (`react-dom`, `react-native-web`,
 *      `@teovilla/react-native-web-maps`, `@expo/metro-runtime`) and no
 *      `web` script in `package.json`
 *   4. `app.json` has no `web` key and lists exactly `ios` and `android`
 *
 * Usage:
 *   node scripts/check-mobile-only.cjs
 *   npm run check:mobile-only
 *
 * Exit codes:
 *   0 - No violations found
 *   1 - Violations found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['src', '__tests__'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Dependencies that exist only to render or bundle the web target. */
const WEB_ONLY_PACKAGES = [
  'react-dom',
  'react-native-web',
  '@teovilla/react-native-web-maps',
  '@expo/metro-runtime'
];

/** Patterns that only make sense on a web platform. */
const WEB_CODE_PATTERNS = [
  { re: /Platform\.OS\s*===?\s*['"]web['"]/, label: "Platform.OS === 'web'" },
  { re: /\bisWeb\b/, label: 'isWeb' },
  { re: /^\s*web\s*:\s/, label: 'web: key (Platform.select)' }
];

const violations = [];

function walk(dir) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  const found = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(rel));
    } else {
      found.push(rel);
    }
  }
  return found;
}

function checkWebFiles() {
  for (const dir of SCANNED_DIRS) {
    for (const rel of walk(dir)) {
      if (/\.web\.[cm]?[jt]sx?$/.test(rel)) {
        violations.push(`${rel}: web-only platform file (delete it; Android/iOS only)`);
      }
    }
  }
}

function checkWebCode() {
  for (const rel of walk('src')) {
    if (!SOURCE_EXTENSIONS.includes(path.extname(rel))) continue;
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const { re, label } of WEB_CODE_PATTERNS) {
        if (re.test(line)) {
          violations.push(`${rel}:${index + 1}: ${label} — no web platform to branch on`);
        }
      }
    });
  }
}

function checkPackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {})
  ]);
  for (const name of WEB_ONLY_PACKAGES) {
    if (declared.has(name)) {
      violations.push(`package.json: web-only dependency "${name}" is back`);
    }
  }
  for (const script of Object.keys(pkg.scripts ?? {})) {
    if (script === 'web' || /\bexpo\b.*--web\b/.test(pkg.scripts[script])) {
      violations.push(`package.json: script "${script}" runs a web target`);
    }
  }
}

function checkAppJson() {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo ?? {};
  if ('web' in app) {
    violations.push('app.json: "web" section is back (the app is mobile only)');
  }
  const platforms = app.platforms;
  const expected = ['ios', 'android'];
  const matches =
    Array.isArray(platforms) &&
    platforms.length === expected.length &&
    expected.every(name => platforms.includes(name));
  if (!matches) {
    violations.push(
      `app.json: expo.platforms must be exactly ["ios", "android"], found ${JSON.stringify(platforms)}`
    );
  }
}

checkWebFiles();
checkWebCode();
checkPackageJson();
checkAppJson();

if (violations.length > 0) {
  console.error(`❌ ${violations.length} web-target violation(s):`);
  for (const violation of violations) console.error(`   ${violation}`);
  console.error(
    '\nThe app targets Android and iOS only. See docs/drop-web-support-plan.md.'
  );
  process.exit(1);
}

console.log('✅ Mobile-only: no web platform files, branches, packages or config found.');
