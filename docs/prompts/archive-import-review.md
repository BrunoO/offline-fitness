# Archive Import Review Prompt

**Purpose:** Evaluate the Strava archive import pipeline for correctness, reliability, and best practices in this React Native/Expo application.

---

## Prompt

```
You are a Senior Data Pipeline Engineer specializing in file-format parsing and offline data ingestion in mobile applications. Review the Strava archive import for this application: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Ingestion**: a ZIP archive exported by Strava ("Download or delete your account"), containing `activities.csv` plus one GPS file per activity (`.gpx`, sometimes `.gpx.gz`, `.fit`, `.tcx`)
- **Authentication**: none — the app has no Strava API access and no account tokens
- **Data Types**: activity summaries (CSV) and GPS tracks (GPX)
- **Storage**: AsyncStorage for activities, FileSystem for stream cache
- **Pipeline**: `src/features/strava-import/` — `zipReader.ts` → `csvParser.ts` → `gpxParser.ts` → `activityMapper.ts` → `importStravaExport.ts`
- **Local model**: the same `Activity` records and `latlng`/`altitude`/`time` stream JSON the former API sync produced

---

## Scan Categories

### 1. Archive Reading (zipReader.ts)

- Central-directory parsing correctness (endianness, ZIP64, entry counts)
- Seek offsets computed from the file header vs the central directory
- Deflate/stored/gzip handling, including truncated or corrupt entries
- Entry-name normalization (path separators, case, duplicates)
- Guarding against a malformed archive causing an out-of-bounds read or an infinite loop
- Size limits on a single entry (a real export is ~1 GB uncompressed)
- No whole-archive read into memory

---

### 2. CSV Parsing (csvParser.ts)

- Header resolution when Strava's columns are localized (the account language decides the names)
- Duplicate columns (`Distance` and `Elapsed Time` appear twice — the canonical metres/seconds occurrence must win)
- Number parsing with locale decimal separators (`,` vs `.`) and thousands separators
- Date parsing with locale month names, and the UTC vs local-time distinction
- Quoted fields, embedded commas/newlines, BOM, CRLF
- Rows that are missing the id or the date column

---

### 3. Track Parsing (gpxParser.ts)

- Coordinate/altitude/time extraction and the `time` stream being seconds-from-start
- Missing `<ele>`, missing `<time>`, empty `<trkseg>`, multiple segments
- Numeric precision (the API stored ~0.1 m precision — is the round-trip equivalent?)
- Point count and memory for a long ride (hundreds of thousands of points)
- Malformed XML that must not throw the whole import

---

### 4. Mapping & Normalization (activityMapper.ts, activityCategories.ts)

- UTC → device-timezone conversion of `local_date`/`local_time`/`start_week`/`utc_offset`
- Daylight-saving boundaries around the activity date
- Type mapping (localized CSV types, the English GPX `<type>` fallback, the `Workout`→`Yoga` quirk)
- Distance unit repair (km vs m) and swim elevation handling
- Unchanged behavior vs the former API mapping for the same activity

---

### 5. Import Orchestration (importStravaExport.ts)

**Idempotency**
- Re-importing the same archive must not duplicate activities
- Existing stream files must never be overwritten
- Activity updates are upserted by id

**Resumability**
- A cancelled import keeps what was already written
- A later import continues instead of starting over
- Partial state (activities saved, tracks missing) is recoverable

**Progress & UX**
- Progress callbacks reflect the real phase (activities vs tracks)
- Cancel is honoured promptly
- The summary counts match what actually happened

**Failure handling**
- A single unreadable track must not abort the whole import
- Errors are collected and surfaced, not swallowed
- The temporary archive copy is cleaned up

---

### 6. Resource Usage

- Peak memory during the import (one track at a time, never the whole archive)
- Disk usage of the stream cache (same order as the former API sync)
- Yielding to the UI thread so the app stays responsive
- No leaks of file handles or directory objects

---

## Output Format

For each finding:
1. **Location**: File/function handling the concern
2. **Issue Type**: Category from above
3. **Current Behavior**: What happens now?
4. **Expected Behavior**: What should happen?
5. **Impact**: Data loss / wrong data / crash / performance
6. **Severity**: Critical / High / Medium / Low
7. **Fix**: Specific code changes needed

---

## Summary Requirements

End with:
- **Import Correctness Score**: 1-10 with justification
- **Data Fidelity**: Does an imported activity match what the Strava API used to return?
- **Idempotency & Resumability Assessment**: Can the user re-import safely?
- **Critical Fixes**: Must fix before shipping
- **Recommendations**: Improvements for robustness and performance
```

---

## Usage Context

- After import-related bug reports
- When Strava changes the export format
- Before major releases
- When adding a new track format (e.g. FIT/TCX support)
