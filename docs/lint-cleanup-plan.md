# Plan: Resolve Pre-Existing Lint & Dead-Code Warnings

Status: draft (created 2026-11-02). Scope is the 19 lint warnings + 3 unused exports
currently reported by `npx expo lint` and `npm run check:knip`. Goal: reach **0 warnings**
and **0 unused exports** without weakening runtime safety or changing behavior.

## Current state

Lint warnings (19), all `warning` severity:

| Rule | Count | Files |
| --- | --- | --- |
| `no-await-in-loop` | 15 | `fetchAndStoreStreams.ts` (3), `backupSync.ts` (6), `webdavTransport.ts` (1), `zipReader.ts` (1), `exportData.ts` (4) |
| `complexity` (>15) | 3 | `DetailsScreen.tsx` (23), `manualActivity.ts` `buildManualActivity` (20), `BackupSection.tsx` (17) |
| `no-nested-ternary` | 1 | `DetailsScreen.tsx` (line 542) |

Knip unused exports (3):
- `MIN_PACE_SPEED_BY_PROFILE`, `MIN_DISTANCE_FOR_AVG_SPEED_M` in `src/features/recording/screens/RecordingScreen.tsx`
- `STATIONARY_HOLD_MS` in `src/features/recording/services/slope.ts`

No errors. Sonar gate currently passes (0 open).

## Guiding principles (from AGENTS.md)

- Prefer prevention over the gate; lint warnings are the first line.
- Bulk edits must be occurrence-counted, dry-run first, and followed by the affected
  test suite before claiming green.
- Never disable a rule without a written justification at the site.
- Behavior-preserving intent goes in the commit message; equivalence-affecting
  judgment calls go in a code comment.

## Work packages

### WP1 — Unused exports (low risk, ~0.5 day)
1. For each of the 3 exports, determine whether it is referenced internally.
   - If internal-only: drop `export` (keep the const).
   - If truly dead: delete the declaration and its tests/usages.
2. Verify with `npm run check:knip` (expect 0 unused exports) and `npm test`.

### WP2 — Nested ternary in DetailsScreen (low risk, ~0.5 day)
- `src/features/activities/screens/DetailsScreen.tsx:542` — replace the nested ternary
  with an extracted helper (e.g. `resolveFilteredEmptyMessage` or a `switch`/lookup).
- Add a unit test for the helper if it is exported; otherwise rely on existing
  `DetailsScreen.spec.tsx` empty-state assertions.

### WP3 — Complexity: DetailsScreen (medium risk, ~1 day)
- Current complexity 23 (limit 15). Already extracted `computeSummaryTotals`,
  `computeTypeBreakdowns`, `getEmptyActivitiesMessage`, `FilteredViewBanner`.
- Further extract:
  - The search/type/hide-no-stream filtering pipeline into a `useFilteredActivities` hook.
  - The `FilteredViewBanner` rendering block is already a component; keep it.
- Target: `DetailsScreen` ≤ 15. Re-run `DetailsScreen.spec.tsx`.

### WP4 — Complexity: `buildManualActivity` and `BackupSection` (medium risk, ~1 day)
- `manualActivity.ts:151`: split into per-field builders + a validator; keep the
  public signature stable.
- `BackupSection.tsx:35`: extract subsections (status, actions, progress) into
  child components.
- Re-run `manualActivity`/backup tests.

### WP5 — `no-await-in-loop` (highest risk, ~2-3 days)
Audit each site. Two acceptable outcomes per site:

- **Refactor to concurrency** when iterations are independent:
  - Use `Promise.all` over a chunked batch (chunk size ≤ 20 to cap memory) for
    stream/file operations.
  - Keep ordering where the downstream consumer depends on it.
- **Keep sequential with scoped disable** when the loop is inherently sequential
  (ZIP streaming, chunked export, WebDAV ordered upload, crash-recovery writes):
  - Add `// eslint-disable-next-line no-await-in-loop` immediately above the await,
    with a one-line comment explaining why (e.g. "sequential: chunked export
    ordering matters for resume").
  - Document the disable in this plan's "Accepted disables" table.

Sites and notes:
- `fetchAndStoreStreams.ts` (3): stream download/cache writes — likely sequential
  for memory; evaluate chunked `Promise.all`.
- `backupSync.ts` (6): sync orchestration — ordered; prefer scoped disables with
  rationale, plus a top-level comment.
- `webdavTransport.ts` (1): single transport loop — evaluate.
- `zipReader.ts` (1): ZIP entry streaming — keep sequential (memory); disable.
- `exportData.ts` (4): chunked JSONL/ZIP export — ordered; disable or batch.

Deliverable: zero `no-await-in-loop` warnings, with every remaining sequential
loop explicitly justified in code.

## Execution order

1. WP1 (unused exports) — quick win, validates tooling.
2. WP2 (nested ternary) — small, unblocks WP3.
3. WP3 (DetailsScreen complexity) — largest single-file refactor.
4. WP4 (manualActivity + BackupSection).
5. WP5 (await-in-loop) — last, highest risk; one file per commit.

## Verification (per AGENTS.md Definition of Done)

After each work package:
- `npx tsc --noEmit`
- `npx expo lint --fix` then `npx expo lint` (0 warnings target)
- `npm run check:knip` (0 unused exports)
- `npm test -- --watchAll=false`
- `scripts/sonar_gate.sh --scan` (0 open issues)

Final: run the full manual-testing checklist (ingestion, home, details, stats,
calendar, offline, dark mode) on both platforms.

## Risks & mitigations

- **Behavior drift in WP5**: chunking changes memory/timing. Mitigation: keep
  chunk size conservative (≤ 20), run the stream/backup/export test suites
  immediately after each file, and review diffs line-by-line.
- **Regression in complexity refactors**: extract pure helpers first, move JSX
  second; keep tests green between steps.
- **Sonar regressions**: re-scan after each WP; any new issue is fixed in the
  same session.

## Accepted disables (to be filled during WP5)

| File | Line | Reason |
| --- | --- | --- |
| TBD | TBD | TBD |
