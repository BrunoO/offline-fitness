#!/usr/bin/env node
/**
 * Prints the Android application id for this machine.
 *
 * The package name is per-developer and lives in `.env` (`ANDROID_PACKAGE`),
 * which `app.config.js` feeds into the Expo config at prebuild time. The Expo
 * CLI loads `.env` itself, but shell steps that run outside an expo command
 * (adb, gradle) do not — this script closes that gap for npm scripts such as
 * `android:dev:uninstall`.
 *
 * Resolution order:
 *   1. `ANDROID_PACKAGE` from `.env` (stripped of surrounding quotes)
 *   2. The neutral placeholder committed to `app.json` (`expo.android.package`)
 *
 * Usage:
 *   node scripts/android-package.cjs
 *   adb shell pm clear $(node scripts/android-package.cjs)
 *
 * Exit codes:
 *   0 - Always (an empty string is printed only if even app.json lacks a package)
 */

const fs = require('fs');
const path = require('path');

/** Reads KEY=VALUE pairs from a dotenv-style file. */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes: KEY="value" or KEY='value'
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const projectRoot = path.resolve(__dirname, '..');
const envPackage = readEnvFile(path.join(projectRoot, '.env')).ANDROID_PACKAGE || '';
const placeholder = require(path.join(projectRoot, 'app.json')).expo.android.package || '';

process.stdout.write(envPackage || placeholder);
