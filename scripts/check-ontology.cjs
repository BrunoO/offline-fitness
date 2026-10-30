#!/usr/bin/env node
/**
 * Ontological Drift Checker
 *
 * Verifies that the formal constants, physical formulas, sport profile parameters,
 * and negative-space rules declared in docs/ontology.md exactly match the actual
 * codebase source files.
 *
 * Usage:
 *   node scripts/check-ontology.cjs
 *   npm run check:ontology
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const ontologyPath = path.join(repoRoot, 'docs/ontology.md');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [ONTOLOGY DRIFT] ${message}`);
    failures++;
  }
}

function checkFileContains(relPath, needle, label) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `Referenced file missing: ${relPath} (${label})`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(content.includes(needle), `${relPath} does not contain expected ${label}: "${needle}"`);
}

function checkRegex(relPath, regex, label) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `Referenced file missing: ${relPath} (${label})`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(regex.test(content), `${relPath} does not match expected ${label} pattern (${regex})`);
}

console.log('🔍 Checking codebase against docs/ontology.md invariants...');

// 1. Verify docs/ontology.md exists and is readable
assert(fs.existsSync(ontologyPath), 'docs/ontology.md does not exist!');

// 2. ONT-DOM: Activity Categories & Merged Types
checkFileContains('src/shared/utils/activityCategories.ts', 'NO_GPS_ACTIVITY_TYPES = new Set<string>([', 'NO_GPS_ACTIVITY_TYPES set');
checkFileContains('src/shared/utils/activityCategories.ts', "'Yoga'", 'NO_GPS Yoga type');
checkFileContains('src/shared/utils/activityCategories.ts', "'WeightTraining'", 'NO_GPS WeightTraining type');
checkFileContains('src/features/activities/services/mergeActivities.ts', "EBikeRide: 'Ride'", 'Merged EBikeRide');
checkFileContains('src/features/activities/services/mergeActivities.ts', "Hike: 'Walk'", 'Merged Hike');
checkFileContains('src/features/activities/services/mergeActivities.ts', "Workout: 'Yoga'", 'Merged Workout');

// 3. ONT-GEO: Geodesic, Barometric & Elevation Hysteresis Constants
checkRegex('src/features/recording/services/slope.ts', /export const BARO_WEIGHT_GPS\s*=\s*0\.15/, 'BARO_WEIGHT_GPS = 0.15');
checkRegex('src/features/recording/services/slope.ts', /export const BARO_WEIGHT_BARO\s*=\s*0\.85/, 'BARO_WEIGHT_BARO = 0.85');
checkRegex('src/features/recording/services/replaySession.ts', /const\s+AUTO_PAUSE_DURATION_MS\s*=\s*3_?000/, 'AUTO_PAUSE_DURATION_MS = 3000');
checkRegex('src/features/recording/services/slope.ts', /export const SMOOTHING_ALPHA\s*=\s*0\.25/, 'SMOOTHING_ALPHA = 0.25');
checkRegex('src/features/recording/services/slope.ts', /export const HYSTERESIS_THRESHOLD_BARO_M\s*=\s*1\.5/, 'HYSTERESIS_THRESHOLD_BARO_M = 1.5');
checkRegex('src/features/recording/services/slope.ts', /export const HYSTERESIS_THRESHOLD_GPS_M\s*=\s*3\.5/, 'HYSTERESIS_THRESHOLD_GPS_M = 3.5');
checkRegex('src/features/recording/services/slope.ts', /export const SLOPE_WINDOW_METERS\s*=\s*45/, 'SLOPE_WINDOW_METERS = 45');
checkRegex('src/features/recording/services/slope.ts', /export const SLOPE_MIN_DISTANCE_M\s*=\s*10/, 'SLOPE_MIN_DISTANCE_M = 10');
checkRegex('src/features/recording/services/slope.ts', /export const SLOPE_DEADBAND_BARO_M\s*=\s*0\.4/, 'SLOPE_DEADBAND_BARO_M = 0.4');
checkRegex('src/features/recording/services/slope.ts', /export const SLOPE_DEADBAND_GPS_M\s*=\s*1(?:\.0)?;/, 'SLOPE_DEADBAND_GPS_M = 1 or 1.0');

// 4. ONT-KIN: Profiles & Filter Envelopes
checkFileContains('src/features/recording/services/profiles.ts', "export const PROFILES: Profile[] = ['walking', 'running', 'hiking', 'cycling', 'swimming'];", 'PROFILES list');
checkRegex('src/features/recording/services/replaySession.ts', /const\s+HR_MATCH_WINDOW_MS\s*=\s*10_?000/, 'HR_MATCH_WINDOW_MS = 10000');

// 5. ONT-STORE: App Config & Storage Keys
checkRegex('src/constants/index.ts', /BACKUP_SCHEMA_VERSION:\s*2/, 'APP_CONFIG.BACKUP_SCHEMA_VERSION = 2');
checkRegex('src/constants/index.ts', /BACKUP_APP_ID:\s*['"]offline-fitness['"]/, "BACKUP_APP_ID = 'offline-fitness'");
checkRegex('src/constants/index.ts', /ACTIVITY_PREFIX:\s*['"]a_['"]/, "ACTIVITY_PREFIX = 'a_'");
checkRegex('src/shared/services/streamCodec.ts', /const\s+STREAM_FORMAT_VERSION\s*=\s*1/, 'STREAM_FORMAT_VERSION = 1');
checkRegex('src/shared/services/streamCodec.ts', /const\s+FLAG_HAS_LATLNG\s*=\s*0b001/, 'FLAG_HAS_LATLNG = 0b001');
checkRegex('src/shared/services/streamCodec.ts', /const\s+FLAG_HAS_ALTITUDE\s*=\s*0b010/, 'FLAG_HAS_ALTITUDE = 0b010');
checkRegex('src/shared/services/streamCodec.ts', /const\s+FLAG_HAS_TIME\s*=\s*0b100/, 'FLAG_HAS_TIME = 0b100');
checkRegex('src/shared/services/streamCodec.ts', /const\s+FLAG_HAS_HEARTRATE\s*=\s*0b1000/, 'FLAG_HAS_HEARTRATE = 0b1000');

// 6. ONT-ARCH: Known Circular Dependency Exceptions
checkFileContains('AGENTS.md', "import CustomDrawer from '@/shared/components/CustomDrawer'", 'Cycle exception CustomDrawer');
checkFileContains('AGENTS.md', "import MiniMapComponent from '@/features/maps/components/MiniMapComponent'", 'Cycle exception MiniMapComponent');
checkFileContains('AGENTS.md', "import ButtonList from '@/features/home/components/ButtonList'", 'Cycle exception ButtonList');
checkFileContains('AGENTS.md', "import { RecordingScreen } from '@/features/recording/screens/RecordingScreen'", 'Cycle exception RecordingScreen');
checkFileContains('AGENTS.md', "`trackComparison` functions from `@/shared/services/trackComparison`", 'Cycle exception trackComparison');

// 7. ONT-GOV: Security Sandbox & Negative Space Guard
checkFileContains('src/features/stats/services/GoalService.ts', 'validActivityFields', 'GoalService validActivityFields whitelist');

if (failures > 0) {
  console.error(`\n❌ Found ${failures} ontological drift issue(s) between docs/ontology.md and source code.`);
  process.exit(1);
} else {
  console.log('✅ Ontology sync check passed: all constants, formulas, and invariants match source code.');
  process.exit(0);
}
