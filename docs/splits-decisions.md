# Splits Feature — Design Decisions

## 1. TTS placement: module-level singleton (simpler option)

**Decision:** Text-to-speech runs as a module-level singleton in the Expo module
(`modules/gps-tracker`), not in the foreground recording service.

**Why:** Simpler to implement and test; the service stays focused on capture.
The native primitive exposed to JS is `speak(text)` (plus `vibrate()` for
haptics).

**Caveat:** A JS bundle reload mid-announcement cuts the speech off, because the
TTS engine lives in the module/JS layer rather than the persistent service.
For the MVP this is acceptable — reloads mid-recording are rare. If
announcements get cut off too often in the field, move TTS into the foreground
service (more robust, more code).

## 2. Audio focus ducking

**Decision:** Ducking is handled entirely inside native `speak()` (audio focus
request on speak, release on done/error). No audio-focus API is exposed to JS.

**Why:** Keeps the JS side simpler and avoids timing bugs between focus and
speech. GpsLib did it this way. The user never sees or configures it.

## 3. Splits are always computed in the replay

**Decision:** Split detection runs in the canonical TS replay
(`replaySession.ts`) regardless of whether live announcements are enabled.
Live toggles (`audioSplitsEnabled`, `hapticSplitsEnabled`) only decide whether
`speak()`/`vibrate()` are called during recording.

**Why:** The replay is the source of truth for what happened during the
recording. Live toggles must not change the stored data, so saved splits stay
consistent and reproducible.

## 4. Announcement wording: kilometers and meters only

**Decision:** No miles anywhere in the app. The spoken unit follows the
configured split interval:

- interval >= 1000 m → "Kilometer N completed"
- interval < 1000 m → "X meters completed" (X = interval in meters)

**Why:** The app is metric-only. Mile wording from GpsLib is dropped.

## Summary table

| # | Question | Decision |
|---|---|---|
| 1 | TTS in service or module? | Module (simpler); document caveat. |
| 2 | Audio focus ducking native or JS? | Native, inside `speak()`. |
| 3 | Compute splits in replay when disabled live? | Yes — replay is canonical. |
| 4 | Mile or km wording? | Kilometers and meters only. |
