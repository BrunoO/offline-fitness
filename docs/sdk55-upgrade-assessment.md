# Expo SDK 55 Upgrade Assessment

**Assessed:** 2026-03-28
**Current:** Expo SDK 54.0.33 / React Native 0.81.5 / React 19.1.0
**Target:** Expo SDK 55 / React Native 0.83 / React 19.2

---

## Summary

The upgrade is **straightforward on Android** with no hard blockers. The `victory-native` 36.x charts are pure JS and already run on New Architecture via `react-native-svg`'s Fabric support — a full rewrite is not required for SDK 55 compatibility (though the library is archived and carries long-term abandonment risk). Everything can be done in a day.

iOS is out of scope for now (see react-native-maps issue below).

---

## What the app already has right (no work needed)

| Requirement | SDK 55 requires | Status |
|---|---|---|
| New Architecture | Mandatory (old arch dropped) | ✅ Already enabled in `app.json` |
| Reanimated | v4 required | ✅ On 4.2.1 |
| `react-native-worklets` | Must be installed | ✅ On 0.7.2 |
| FlashList | v2+ required | ✅ Already on 2.0.2 |

The SDK 54 upgrade cycle already handled the hardest migrations.

---

## Work needed

### 1. Core package bump — low risk, ~30 min

```bash
npm install expo@~55.0.0
npx expo install --fix
```

`npx expo install --fix` aligns all `expo-*` packages automatically. Keep `react-native-maps` in `expo.install.exclude` (already done in `package.json`).

### 2. Babel config — one-liner, required

`babel.config.cjs` still uses the old Reanimated plugin. In Reanimated 4, the Babel transform moved to `react-native-worklets`:

```js
// Remove this:
'react-native-reanimated/plugin'

// Replace with:
'react-native-worklets/plugin'
```

`react-native-worklets` is already installed, so this is safe.

### 3. victory-native — **the gating item, significant rewrite** ⚠️

See dedicated section below.

### 4. react-native-maps on iOS — blocked on upstream, skip for now

There is a confirmed open bug ([expo#43288](https://github.com/expo/expo/issues/43288), [react-native-maps#5843](https://github.com/react-native-maps/react-native-maps/issues/5843)) where SDK 55 breaks Google Maps on iOS due to a malformed `AppDelegate` config. Android is unaffected. iOS is out of scope for now — monitor the issues.

### 5. Deprecated APIs — cosmetic cleanup, low risk

- **`expo-navigation-bar`**: Methods are deprecated as no-ops (edge-to-edge is mandatory on Android 16+). The app already uses `react-native-edge-to-edge` so the impact should be minimal. Search for any direct `expo-navigation-bar` calls.
- **`expo-status-bar`**: Props `backgroundColor`, `translucent`, `networkActivityIndicatorVisible` are deprecated. Search for these in JSX.
- **`removeSubscription()`**: Deprecated across all Expo modules — use `subscription.remove()` instead. Search for `removeSubscription(` in the codebase.

### 6. Environment / tooling

- Minimum **Xcode 26** required for iOS builds (out of scope for now).
- Minimum **Node.js `^20.19.4`** required.
- `eas update` now requires an `--environment` flag — update any CI/CD scripts if used.

---

## victory-native deep dive

### The compatibility problem

`victory-native` 36.x (the "legacy" version currently installed) and `victory-native` 40+ (called "Victory Native XL", currently at **41.20.2**) share a package name but are completely different libraries.

| | Legacy 36.x (current) | Victory Native XL 40+ |
|---|---|---|
| Renderer | `react-native-svg` | `@shopify/react-native-skia` |
| Animation | None / RN built-in | `react-native-reanimated` |
| Architecture | Pure JS — compatible with both | New Arch only |
| API | `VictoryChart`, `VictoryBar`, etc. | `CartesianChart` + Skia render fns |

**Correction (re-assessed 2026-03-28):** The original assessment overstated the New Architecture incompatibility for 36.x. `victory-native` 36.x is **100% pure JavaScript** — it has no native modules, no TurboModule specs, and no Fabric component declarations. Its only native dependency is `react-native-svg`, which at v15.12.1 (already installed) ships full Fabric support (18 declared Fabric components, C++ interop layer). Because `newArchEnabled=true` is already set in `android/gradle.properties`, the charts are likely already running on New Architecture today without issues.

The one known rough edge is issue [#2744](https://github.com/FormidableLabs/victory/issues/2744): every victory SVG component passes an `accessible` prop that `react-native-svg` silently ignores. This is suppressed with `@ts-expect-error` comments in the source. It is not a runtime crash.

**The maintainer quote ("libraries and APIs are completely different") referred to the difference between 36.x and the XL 40+ rewrite — not to New Architecture compatibility of 36.x itself.**

### The real problem: maintenance, not architecture

The reason to eventually replace 36.x is abandonment risk, not a current breakage:

- The repo was **archived in August 2024**; no further 36.x releases are expected.
- If `react-native-svg` makes a breaking Fabric API change in a future SDK, 36.x will not be updated.
- **36.x should continue to work on SDK 55** as-is, given the current dependency versions.

Migrating to Victory Native XL (40+) is the path that is genuinely blocked:

### Community health (as of March 2026)

- The original `victory-native` repo was **archived in August 2024**. All activity moved to `victory-native-xl`.
- **Last release: November 2024** (v41.20.2) — over 16 months ago with no activity since.
- 94 open GitHub issues, minimal maintainer responses since mid-2025.
- The team posted a "community contributions wanted" notice — a sign of limited internal investment.
- There is a **hard version conflict** between victory-native-xl (requires `@shopify/react-native-skia` v1) and Expo SDK 53+ (requires Skia v2). Expo SDK 55 will face the same conflict. This is unresolved as of March 2026.
- Community consensus has moved away from victory-native for new projects.

### Affected files (6 files — rewrites needed only if replacing 36.x)

| File | Components used | Complexity |
|---|---|---|
| `src/features/stats/screens/RecentWeeksScreen.tsx` | `VictoryBar`, `VictoryChart`, `VictoryAxis`, `VictoryLabel`, `VictoryLegend` | Medium |
| `src/features/stats/screens/RecentMonthsScreen.tsx` | `VictoryBar`, `VictoryChart`, `VictoryAxis`, `VictoryLabel` | Medium |
| `src/features/stats/screens/RecentYearsScreen.tsx` | `VictoryBar`, `VictoryChart`, `VictoryAxis` | Low |
| `src/features/stats/components/YTDStatsComponent.tsx` | `VictoryArea` (quarter bands), `VictoryLine` (2 series), `VictoryAxis`, `VictoryLabel`, `VictoryLegend` | High |
| `src/features/activities/components/ActivityAnalysisView.tsx` | `VictoryLine`, `VictoryScatter` (per-point color), `VictoryZoomContainer` (zoom/pan), `VictoryAxis`, 3 separate chart instances | High |
| `src/features/maps/screens/MapsScreen.web.tsx` | `VictoryLine`, `VictoryChart`, `VictoryAxis` (web only) | Low |

### Migration options

**Option A: Keep victory-native 36.x (carry-forward)**
- No work required for SDK 55 compatibility — it already works on New Architecture.
- Acceptable as a short-to-medium term strategy while the app is Android-only.
- Risk: if `react-native-svg` makes a breaking Fabric API change, 36.x will not be updated. Monitor `react-native-svg` release notes after each SDK bump.
- **Recommended if chart rewrites are not a current priority.**

**Option B: Migrate to Victory Native XL (41.x)**
- Blocked by the unresolved Skia v1/v2 version conflict with Expo SDK 55.
- Adds `@shopify/react-native-skia` — ~40 MB APK size increase before compression.
- Doesn't work in Expo Go; requires a custom dev client (already the case for this app).
- Slow maintenance with no guarantee of timely fixes.
- **Not recommended** given the current Skia conflict and maintenance trajectory.

**Option C: Switch to `react-native-gifted-charts`**
- No heavy native dependencies; SVG-based via `react-native-svg` (already in the project).
- Works with Expo's managed workflow, actively maintained (~94k weekly downloads, growing fast).
- Same rewrite effort for the 6 files.
- **Has feature gaps** — see section below.

**Option D: Switch to React Native ECharts**
- Best for data-heavy or complex charts; handles 2000+ points.
- Config-based API (familiar if you know ECharts/Apache ECharts).
- Good New Architecture support.
- Covers all the advanced features that gifted-charts lacks (zoom, mixed types, time axis).
- Heavier setup than gifted-charts.

---

## react-native-gifted-charts gap analysis

Research based on gifted-charts v1.4.76 (latest). Assessed against the actual features used in the app.

| Feature | Used in app | gifted-charts | Notes |
|---|---|---|---|
| Horizontal bar chart | `RecentWeeksScreen`, `RecentMonthsScreen` | ✅ Yes | `horizontal` prop on `<BarChart />` |
| Multi-series line chart | `YTDStatsComponent` | ✅ Yes | `dataSet` prop, per-series color |
| Dashed line style | `YTDStatsComponent` (previous year), `ActivityAnalysisView` (trend lines) | ✅ Yes | `strokeDashArray` per dataset |
| Legend component | `RecentWeeksScreen`, `YTDStatsComponent` | ❌ No | Must build a custom `View` outside the chart |
| Custom Y-axis tick formatter | All screens | ✅ Yes | `formatYLabel` callback |
| Custom X-axis tick formatter | `ActivityAnalysisView` (dates → locale string), `ActivityAnalysisView` (seconds → h:mm) | ⚠️ Partial | No `formatXLabel` callback; labels must be pre-formatted strings |
| Rotated axis labels | `ActivityAnalysisView` (dates at -45°) | ⚠️ Partial | `rotateLabel` prop exists but angle is fixed at 60° — not configurable |
| Date/time x-axis | `ActivityAnalysisView`, `YTDStatsComponent` | ❌ No | Strings only; no temporal scale or auto tick generation |
| Area chart as vertical background band | `YTDStatsComponent` (Q1–Q4 colour stripes behind lines) | ❌ No | Area fills downward to x-axis only; no vertical band between two x-values. Needs an absolutely-positioned `View` hack. |
| Scatter chart with per-point custom colour | `ActivityAnalysisView` (current = red, track-similar = green, others = cyan) | ⚠️ Partial | Via `<BubbleChart scatterChart>` with per-item `bubbleColor`; not a true scatter component |
| Zoom / pan on x-axis | `ActivityAnalysisView` (`VictoryZoomContainer`) | ❌ No | Horizontal scroll supported; pinch-to-zoom absent entirely |
| Mixed types on one plot (line + scatter + area) | `ActivityAnalysisView` (lines + scatter), `YTDStatsComponent` (lines + area bands) | ⚠️ Partial | Line + Area works; Line + independent Scatter does not share axes natively |

### Hard blockers for a straight gifted-charts migration

Three features used in the app have **no equivalent** in gifted-charts:

1. **Quarter background bands** (`YTDStatsComponent`) — uses `VictoryArea` to paint coloured vertical stripes (Q1–Q4) behind two line series. gifted-charts has no x-range band concept. Workaround: render four absolutely-positioned `View` elements behind the chart, carefully sized to match chart padding/scale — fragile and layout-dependent.

2. **Zoom/pan** (`ActivityAnalysisView` → `SpeedTrendChart`) — `VictoryZoomContainer zoomDimension="x"` lets the user pinch or drag to zoom the x-axis of the speed trend scatter chart. gifted-charts offers horizontal scroll only. A true zoom interaction would require wrapping with `react-native-gesture-handler` and `react-native-reanimated` manually — significant custom code.

3. **Native date/time axis** (`ActivityAnalysisView`) — the speed trend chart plots activities by date on the x-axis with locale-formatted tick labels. gifted-charts requires pre-formatted string labels, losing any axis-aware tick spacing.

### Verdict

gifted-charts is a clean fit for the **simpler bar and line charts** (RecentWeeksScreen, RecentMonthsScreen, RecentYearsScreen, MapsScreen.web). For those four files the migration is straightforward.

The two complex files — `YTDStatsComponent` and especially `ActivityAnalysisView` — would need either:
- Significant workarounds and custom code to approximate the missing features, or
- Partial redesign of the charts (e.g. drop zoom/pan, replace quarter bands with a simpler legend-based approach)

**React Native ECharts** is the stronger candidate if feature parity is required for those two files.

### Recommended strategy

A pragmatic split:
- Use **gifted-charts** for the 4 simple files (bar charts, simple line charts).
- Use **React Native ECharts** for `YTDStatsComponent` and `ActivityAnalysisView` where zoom, mixed types, and date axes matter.
- Or: simplify `YTDStatsComponent` (drop quarter bands → use a simple 2-line chart) and drop zoom from `ActivityAnalysisView`, then gifted-charts covers everything.

---

## Effort summary

| Item | Effort | Risk |
|---|---|---|
| `npm install expo@~55` + `--fix` | ~30 min | Low |
| Babel plugin rename | 5 min | Low |
| Deprecated API cleanup | ~1–2h | Low |
| Prebuild + smoke test on Android | ~2h | Medium |
| Charts — carry forward `victory-native` 36.x | 0 (no work needed) | Low (abandonment risk) |
| Charts — 4 simple files (gifted-charts, if replacing) | ~2–3 days | Medium |
| Charts — `YTDStatsComponent` (if replacing) | ~2 days | High |
| Charts — `ActivityAnalysisView` (if replacing) | ~3 days | High |
| react-native-maps iOS | Blocked upstream | — (skip) |

The core upgrade (items 1–2) is complete. Deprecated API cleanup was a no-op — nothing found in the codebase. Charts carry forward untouched.
