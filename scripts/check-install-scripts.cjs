#!/usr/bin/env node
/**
 * Install-Script Policy Guard
 *
 * npm 11 blocks dependency install scripts by default and prints a review
 * prompt for every package whose scripts it skipped:
 *
 *     npm warn install-scripts 3 packages have install scripts not yet
 *     covered by allowScripts
 *
 * The prompt is a *decision point*, not a defect. Every install script is
 * reviewed exactly once and the outcome is recorded in `package.json` under
 * `allowScripts`, so the warning disappears and the decision stays auditable
 * in git instead of living in each developer's npm state.
 *
 * This guard keeps that record honest. It fails when:
 *
 *   1. a dependency in `package-lock.json` has an install script
 *      (`hasInstallScript`) but no `allowScripts` entry - i.e. a new
 *      install script appeared and nobody reviewed it
 *   2. an `allowScripts` entry approves a package without pinning the
 *      version - a bare `true` silently allows every future version
 *
 * The current posture is that no dependency install script is trusted: the
 * three known packages are denied (`false`) because their functionality is
 * delivered by prebuilt optional dependencies, not by their scripts. CI
 * enforces the same posture independently with `npm ci --ignore-scripts`.
 *
 * Usage:
 *   node scripts/check-install-scripts.cjs
 *   npm run check:install-scripts
 *
 * Exit codes:
 *   0 - Every install script is covered by an explicit decision
 *   1 - Violations found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const LOCKFILE = path.join(ROOT, 'package-lock.json');

const violations = [];
const notes = [];

/** The package name behind a `node_modules/...` lockfile path. */
function packageNameFromPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? lockPath : lockPath.slice(index + marker.length);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const pkg = readJson(PACKAGE_JSON);
const lock = readJson(LOCKFILE);

if (!pkg) {
  console.error(`❌ package.json not found at ${PACKAGE_JSON}`);
  process.exit(1);
}
if (!lock) {
  console.error(`❌ package-lock.json not found at ${LOCKFILE}`);
  process.exit(1);
}

const allowScripts = pkg.allowScripts ?? {};

// 1. Every install script in the lockfile needs an explicit decision.
const installScriptPackages = new Set();
for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
  if (lockPath === '' || !entry?.hasInstallScript) continue;
  installScriptPackages.add(packageNameFromPath(lockPath));
}

for (const name of [...installScriptPackages].sort()) {
  if (!(name in allowScripts)) {
    violations.push(
      `${name}: has an install script but no "allowScripts" entry - review it, then ` +
        'run `npm install-scripts approve <pkg>` or `npm install-scripts deny <pkg>`'
    );
  }
}

// 2. An approval without a version pin lets every future version run scripts.
for (const [name, decision] of Object.entries(allowScripts)) {
  if (decision === true) {
    violations.push(
      `${name}: "allowScripts.${name}" is true - an unpinned approval also allows ` +
        'every future version. Pin it as "pkg@<version>" instead.'
    );
  }
}

// Entries for packages that are no longer installed are harmless leftovers,
// but they are worth surfacing: a stale entry can mask a future package that
// reuses the same name.
for (const name of Object.keys(allowScripts)) {
  if (!installScriptPackages.has(name)) {
    const stillDeclared =
      (pkg.dependencies ?? {})[name] !== undefined ||
      (pkg.devDependencies ?? {})[name] !== undefined;
    if (!stillDeclared) {
      notes.push(
        `${name}: "allowScripts.${name}" has no matching dependency - safe to remove ` +
          '(do NOT run `npm install-scripts prune`: it drops entries npm still ' +
          'warns about, e.g. fsevents, whose registry metadata lists an install ' +
          'script that the published tarball does not contain)'
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`❌ ${violations.length} install-script policy violation(s):`);
  for (const violation of violations) console.error(`   ${violation}`);
  console.error(
    '\nDependency install scripts are not trusted in this repo. Deny a script ' +
      'unless the package cannot work without it, and record every decision in ' +
      'package.json -> "allowScripts". See AGENTS.md -> "Dependency Install Scripts".'
  );
  process.exit(1);
}

if (notes.length > 0) {
  console.log('ℹ️  install-script notes:');
  for (const note of notes) console.log(`   ${note}`);
}

console.log(
  `✅ Install scripts: ${installScriptPackages.size} package(s) with install scripts, ` +
    'all covered by an explicit allowScripts decision.'
);
