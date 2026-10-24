# Elevation gain estimation — exploration notes

Low priority. Background context for a possible future feature: computing a
"true" elevation gain from a noisy altitude stream instead of trusting Strava's
`total_elevation_gain`.

## The motivating case

Activity `329982934` ("Sortie à vélo Alpe d'huez", 21 June 2015, 100.96 km):

| Source | Value |
|---|---|
| Strava CSV `Dénivelé positif` (smoothed cumulative ascent) | 2,789.6 m |
| Raw sum of positive GPX altitude deltas | 3,966.2 m |
| `max(altitude) − min(altitude)` | 1,505.9 m ≈ 1,500 m (user's estimate of true gain) |
| Running maximum (cumulative of new highs) | 1,480.2 m |

The ~1,290 m gap between Strava and the user's estimate comes from real terrain
undulations along the climb that Strava counts as ascent. These are low-frequency
bumps (tens of metres over minutes), not high-frequency sample noise, which is why
naive smoothing does not cleanly separate them.

## Why simple smoothing fails

- EMA / moving average / median: either leaves the bumps (gain stays 2,100–3,500 m)
  or, with any threshold, collapses to near-zero. No single window + threshold lands
  at ~1,500 m *and* preserves small activities.
- Noise estimation via residual: the residual std is only 3–12 m (high-frequency GPS
  noise), so a noise-based threshold does not filter the 50–100 m terrain bumps. The
  overcount is terrain variation, not sensor noise.
- A fixed prominence threshold (e.g. 100 m) gives 1,480 m here but zeros out small
  activities. A single threshold cannot serve both scales.

## Candidate algorithms

| Algorithm | Alpe d'Huez result | Multi-climb? | Failure mode |
|---|---|---|---|
| Net elevation (max − min) | 1,506 m | No (undercounts rolling routes) | A ride with two 800 m climbs separated by a valley → 800, not 1,600 |
| Running maximum (cumulative of new highs) | 1,480 m | Partial (only counts climbs that set a new global high) | A later climb below the global max is ignored |
| Prominence-based extrema (min prominence 50–100 m) | 1,480–1,753 m | Yes (sums each significant climb) | Fixed threshold kills small activities; needs adaptive scaling |
| Douglas-Peucker simplification (ε ~75 m) | ~1,540 m | Yes | Tolerance is geometric, not physically meaningful; hard to tune |
| Hysteresis / dead-band (sustained rise of H) | 1,480–1,526 m | Yes | H is a tuning knob; too high undercounts, too low overcounts |
| Strava-style smoothed cumulative (current, from CSV) | 2,790 m | Yes | Overcounts terrain undulations (the problem being hit) |
| Total Variation Denoising | untested | Yes (preserves climb edges) | Complex; λ tuning; not implemented/tested here |
| Savitzky-Golay + threshold | untested | Yes | Window/degree tuning; untested on this data |

## Key insight

The "true gain" wanted (~1,500 m) is essentially the net climb of the dominant ascent,
ignoring minor undulations. No single scalar threshold serves both flat activities
(gain < 50 m) and big climbs (gain > 1,000 m). The tension is real and unavoidable
with one global parameter.

## Viable approaches (not implemented)

1. **Piecewise by activity size** (pragmatic): if the activity's range (max − min) is
   small (< ~200 m), keep Strava's value (or raw, which is close for small activities);
   if large, apply prominence filtering with threshold ≈ 5–10% of range, clamped to a
   floor (e.g. 5 m) so small climbs survive. Preserves small activities exactly and
   filters big ones. Alpe d'Huez lands at ~1,640–1,750 m (close to 1,500).

2. **Running-maximum with a floor fallback**: use running-max gain when it is within,
   say, 20% of max-min (single-dominant-climb case, like Alpe d'Huez → 1,480 m);
   otherwise fall back to Strava's value. Handles the common case without hurting
   multi-climb rides.

3. **User-driven override (already available)**: the edit modal lets you set
   `total_elevation_gain` per activity. Given the subjectivity ("what counts as a
   climb"), a manual override with a suggested value may be the most honest solution.
   A "suggest from track" button could offer a few candidate values (max-min,
   running-max, prominence@50 m, Strava) and let the user pick.

4. **Store multiple estimates**: keep `total_elevation_gain` (Strava's, for
   comparability) plus an `elevation_gain_smoothed` field computed by a chosen
   algorithm, and let stats use either. More storage, but preserves both views.

## Recommendation

Given the ambiguity, option 3 (manual override with suggestions) is the safest and most
honest — it does not pretend an algorithm knows the user's intent, and the edit modal
already supports it. If automation is wanted, option 1 (piecewise) is the most
defensible single algorithm: it keeps Strava's numbers for small activities (where they
are fine) and applies prominence filtering only to large ones.

## Status

Low priority. No code written. The edit modal already allows per-activity override of
`total_elevation_gain`. Revisit if users complain systematically about elevation gain.
