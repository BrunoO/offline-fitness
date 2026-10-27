---
name: codebase-ontology
description: Queries, validates, and maintains the Offline Fitness domain, geophysical, spatial, kinematic, storage, and governance ontology in docs/ontology.md alongside codebase-memory-mcp. Use when implementing features that touch physical formulas, coordinates, dates, streams, recording, or sync invariants, when deprecating or retiring features, or when auditing the codebase for ontological drift.
license: MIT
metadata:
  author: Offline Fitness
  tags: ontology, architecture, invariants, knowledge-graph, domain-model
---

# Codebase Ontology Maintenance & Verification

## Overview

The formal world model of this repository lives in [docs/ontology.md](../../../docs/ontology.md), complemented by the syntactic symbol graph in `codebase-memory-mcp` and architectural import rules in [docs/architecture.md](../../../docs/architecture.md).

While `codebase-memory-mcp` indexes syntactic nodes (`File`, `Function`, `Class`, `Interface`) and edges (`CALLS`, `IMPORTS`), [docs/ontology.md](../../../docs/ontology.md) defines the semantic invariants (`ONT-*`), physical equations, coordinate systems, state machines, cross-boundary contracts, and retired concepts (**Negative Space**). Because `codebase-memory-mcp` parses Markdown headings into `Section` nodes and backticked identifiers into `MENTIONS` and `REFERENCES_FILE` edges, keeping [docs/ontology.md](../../../docs/ontology.md) accurate directly updates the queryable knowledge graph.

## When to Apply

Use this workflow when:
- Modifying geophysical, spatial, kinematic, biometric, temporal, codec, or sync logic governed by `ONT-*` invariants.
- Introducing a new domain entity, physical formula, filter threshold, storage key, binary codec flag, or cross-boundary contract.
- Deprecating or removing a feature, permission, package, or code path (moving it to **Negative Space**).
- Auditing [docs/ontology.md](../../../docs/ontology.md) against the source tree to detect drift between documented constants/formulas and actual code.

## Workflow 1: Pre-Change Invariant Check

Before modifying domain or infrastructure code:

1. **Locate Governing Invariants:**
   Identify the target section in [docs/ontology.md](../../../docs/ontology.md) using the lookup table in [AGENTS.md](../../../AGENTS.md):
   - `ONT-DOM-*` (§1): Activity origins (`<numericId>`, `recorded-*`, `manual-*`), `NO_GPS_ACTIVITY_TYPES`, `getNoStreamIds`, `mergeActivities`, swim canonicalization.
   - `ONT-TIME-*` (§2): `start_date_local` mislabeled-`Z` prohibition, `local_date` bucketing vs. `start_timestamp_utc` sorting, `localDateToDayNumber`, ISO-8601 Thursday-rule weeks.
   - `ONT-GEO-*` (§3): WGS 84 ellipsoid ($h$) vs. geoid ($N$) vs. MSL ($H = h - N$), NMEA GGA backfill, barometer formula & `0.85/0.15` fusion, EMA ($\alpha = 0.25$), `1.5m`/`3.5m` hysteresis deadbands, pause anchor reset, sliding-window slope.
   - `ONT-SPATIAL-*` (§4): Coordinate representations (`[lat, lon]`, `Int32Array`, `LatLng`, `{x, y}`), Haversine, circular mean bearings, bounding boxes, Needleman-Wunsch DP track similarity, `geo-tz` lookup.
   - `ONT-KIN-*` (§5): 5 sport profiles, pre/post auto-pause filter ordering, non-overlapping pause subtraction, BLE HR `±10s` alignment (`null` vs. `0`), metric-only splits, finalize-only crash recovery.
   - `ONT-STORE-*` (§6): `AsyncStorage` `a_<id>` keys, `'OF'` v1 binary codec, 30-day fix logs, WebDAV `collection.json` (`schemaVersion: 2`), 30-day tombstones ("local wins"), 500-item chunked ZIP export.
   - `ONT-ARCH-*` & `ONT-UI-*` (§7): Barrel vs. relative imports, 6 cycle exceptions, Portable Import Core boundary, split `ActivitiesContext`, root sheet mounting, lazy `Directory` init, `runWithCleanup`, `useTheme()` WCAG 2.1 AA contrast.
   - `ONT-GOV-*` (§8): `GoalService` `expr-eval` isolation, streak recency windows, Negative Space, verification gates.

2. **Trace Connected Symbols in the Graph:**
   Query `codebase-memory-mcp` (`search_graph` and `trace_path`) for the symbols named in that section to inspect all upstream callers and downstream consumers before editing.

## Workflow 2: Updating the Ontology (`docs/ontology.md`)

Whenever a code change adds, alters, or retires an invariant, update [docs/ontology.md](../../../docs/ontology.md) in the same session:

1. **Assign or Update an `ONT-<DOMAIN>-<NN>` Identifier:**
   - Use the domain prefix matching the section (`ONT-DOM`, `ONT-TIME`, `ONT-GEO`, `ONT-SPATIAL`, `ONT-KIN`, `ONT-STORE`, `ONT-ARCH`, `ONT-UI`, `ONT-GOV`).
   - State the **Semantic Rule / Formula**, the **Physical or Architectural Rationale**, and the **Code Anchor**.

2. **Format Code Anchors for Graph Ingestion:**
   - Wrap exact symbol names (functions, classes, interfaces, constants) and repo-relative file paths in backticks (e.g., `` `replaySession` ``, `` `src/features/recording/services/replaySession.ts` ``).
   - `codebase-memory-mcp` uses these backticked tokens to build `MENTIONS` and `REFERENCES_FILE` edges between `Section` nodes in [docs/ontology.md](../../../docs/ontology.md) and code nodes in the graph.

3. **Record Retired Concepts in Negative Space (§8.2):**
   - When removing a feature, file, permission, or dependency, add a row to **§8.2 Negative Space (Retired & Forbidden Concepts)** stating its status (`Retired` or `Forbidden`) and what superseded it.
   - Never silently delete a major concept without recording its tombstone in Negative Space; otherwise, future sessions may reintroduce it from general training priors.

4. **Bind to an Executable Gate (§8.3):**
   - Ensure every new invariant is covered by a unit test (e.g., in [__tests__/stravaImport/importCorePortability.spec.ts](../../../__tests__/stravaImport/importCorePortability.spec.ts) or [__tests__/recording/replaySession.spec.ts](../../../__tests__/recording/replaySession.spec.ts)) or a check script.

5. **Re-Index and Verify Graph Coverage:**
   - Run `index_repository(repo_path="/Users/brunoorsier/dev/offline-fitness", mode="full")` via `codebase-memory-mcp`.
   - Run `check_index_coverage(project="Users-brunoorsier-dev-offline-fitness", paths=["docs/ontology.md", "AGENTS.md"])` and confirm `no_recorded_issue` and `skipped_count: 0`.

## Workflow 3: Auditing for Ontological Drift

To audit whether [docs/ontology.md](../../../docs/ontology.md) matches the current codebase:

1. **Check Numerical Constants & Formulas:**
   Compare the constants in [docs/ontology.md](../../../docs/ontology.md) against their source definitions:
   - [src/features/recording/services/replaySession.ts](../../../src/features/recording/services/replaySession.ts) (`BARO_WEIGHT_GPS`, `BARO_WEIGHT_BARO`, `AUTO_PAUSE_THRESHOLD_MPS`, `AUTO_PAUSE_DURATION_MS`, `HR_MATCH_WINDOW_MS`)
   - [src/features/recording/services/slope.ts](../../../src/features/recording/services/slope.ts) (`SLOPE_WINDOW_METERS`, `SLOPE_WINDOW_MS`, `SLOPE_MIN_DISTANCE_M`, `SMOOTHING_ALPHA`, `HYSTERESIS_THRESHOLD_BARO_M`, `HYSTERESIS_THRESHOLD_GPS_M`)
   - [src/features/recording/services/profiles.ts](../../../src/features/recording/services/profiles.ts) (`PROFILE_CAPTURE_OPTIONS`, `PROFILE_FILTER_OPTIONS`)
   - [src/shared/services/streamCodec.ts](../../../src/shared/services/streamCodec.ts) (`CODEC_VERSION`, `FLAG_HAS_ALTITUDE`, `FLAG_HAS_HEARTRATE`, `COORD_SCALE`, `ALTITUDE_SCALE`)
   - [src/constants/index.ts](../../../src/constants/index.ts) (`APP_CONFIG.BACKUP_SCHEMA_VERSION`, `STORAGE_KEYS`)
   - [src/features/backup/services/backupSync.ts](../../../src/features/backup/services/backupSync.ts) (`TOMBSTONE_RETENTION_MS`, `SYNC_CONCURRENCY`, `ACTIVITY_BATCH_SIZE`)

2. **Check Structural & Taxonomy Lists:**
   - Verify `NO_GPS_ACTIVITY_TYPES` in [src/shared/utils/activityCategories.ts](../../../src/shared/utils/activityCategories.ts).
   - Verify `MERGED_ACTIVITY_TYPES` in [src/features/activities/services/mergeActivities.ts](../../../src/features/activities/services/mergeActivities.ts).
   - Verify the 6 circular dependency exceptions in [docs/architecture.md](../../../docs/architecture.md) and [AGENTS.md](../../../AGENTS.md).

3. **Report Audit Results:**
   Output a structured report listing each section (`§1`–`§8`) as `[PASS]` or `[DRIFT DETECTED]` with exact file/line references and apply the needed updates.

## References

- [Offline Fitness Ontology](../../../docs/ontology.md)
- [System Architecture & Import Rules](../../../docs/architecture.md)
- [Agent Guidelines](../../../AGENTS.md)
- [Altitude & Barometer Engineering Notes](../../../docs/altitude-recording-improvements.md)
- [Splits Design Decisions](../../../docs/splits-decisions.md)
- [Crash Recovery Trade-off](../../../docs/crash-recovery-tradeoff.md)
- [Memoization Audit & React Compiler Guidelines](../../../docs/memoization-audit.md)
