# Memoization in the React Compiler Era

This document has two parts:

1. **Decision guidelines** — when to keep `useMemo`/`useCallback`/`React.memo` and when to let the React Compiler decide.
2. **Memoization audit** — remaining manual memoizations in this codebase, candidates for future cleanup.

React Compiler is enabled in this project (`app.json` → `experiments.reactCompiler`, enforced via the `react-compiler/react-compiler` ESLint rule). It automatically memoizes components, hooks, derived values, and JSX, and can memoize conditionally (e.g. after early returns) where `useMemo`/`useCallback` cannot. Its memoization is more granular than hand-written hooks. The default posture is therefore: **write plain code, let the compiler decide, and add manual memoization only when there is a reason the compiler cannot see.**

> Every `useMemo`/`useCallback`/`React.memo` that stays in the codebase should have a readable reason. If it doesn't, the compiler probably handles it and the hook is noise.

See also `AGENTS.md` (React Native / Expo → Memoization) and the official React docs: [useMemo](https://react.dev/reference/react/useMemo), [useCallback](https://react.dev/reference/react/useCallback), [React Compiler introduction](https://react.dev/learn/react-compiler/introduction).

---

## Decision guidelines

### Let the compiler handle it (do NOT add hooks)

- Derived/filtered/sorted/mapped values from props or state (`products.filter(...)`, `invoices.reduce(...)`).
- Inline event handlers passed to children (`const onClick = () => ...`).
- Lightweight object/array props (`{ color, showLegend: true }`).
- Sorted/filtered arrays used only for rendering.
- Formatted values, computed totals.
- Components that render cheaply.
- The `onClick={() => handleClick(item)}` arrow-function trap that breaks manual memoization — the compiler handles it correctly.

### Keep `useMemo` when…

1. **Genuinely expensive calculation** (profiled, hundreds of ms) — but only if the compiler doesn't already make it fast enough. Profile first (Chrome CPU throttling, production build, React Profiler). Official threshold: ~1ms+ total logged time.
2. **Value is a dependency of another Hook / Effect** where you need stable identity to prevent over-firing (e.g. an `options` object passed to a `useEffect` that connects to a chat room). Prefer moving the object *inside* the effect to remove the dependency entirely.
3. **Memoizing a dependency of another `useMemo`** where the inner value must stay referentially stable.
4. **Cross-component sharing of an expensive result** — the compiler's memoization is per-component; if the same heavy computation runs in many components with the same input, consider memoizing outside React.

⚠️ Caveat: `useMemo` is a *performance optimization, not a semantic guarantee* — React may discard the cache (e.g. on suspend during mount). If correctness depends on it, use `useState`/`useRef` instead, or restructure.

### Keep `useCallback` when…

1. **Function identity is part of an integration contract** with a non-React system: Chart.js/canvas, DOM event listeners, third-party SDKs that register callbacks by reference, imperative subscriptions. (LogRocket's chart click-handler case: removing `useCallback` exposed a stale-data timing bug because the effect re-registration depended on stable identity.)
2. **Custom hooks depend on a stable callback** reference.
3. **A memoized child (`React.memo`) receives the function as a prop** and you've profiled that the child re-render cost matters — though note the compiler often makes this redundant.
4. **Used as an effect dependency** where you want precise control over when the effect re-fires.

### Keep `React.memo` when…

1. **Rendering is genuinely expensive** and props remain stable.
2. **Profiling confirms the benefit** (comparison cost < render cost).
3. Skip when props change constantly, rendering is cheap, or comparison cost exceeds render cost.

### Compiler escape hatches / things to watch

- **`"use no memo"`** directive: opt a component/hook out of compiler optimization. Needed for libraries with interior mutability that can't be safely memoized — React Hook Form's `watch()`, TanStack Table/Virtual, MobX, some chart/canvas libs. Treat these as TODOs and re-audit periodically; the count should trend down.
- **Libraries the linter flags** as incompatible (`react-hooks/incompatible-library`) — audit before migrating.
- **Effect timing bugs** that manual memoization was *hiding* (stale data in click handlers) — run E2E tests, not just unit tests, after removing hooks.
- **Don't rely on the DevTools "Memo ✨" badge** as a correctness signal — it means the compiler *processed* the component, not that optimization succeeded. Use the Profiler.
- **Don't add a custom `babel.config.js`** in Next.js/Expo unless necessary — it can break framework features.
- **Pin the compiler version** (`--save-exact`) if test coverage is thin; memoization changes across versions can surface Rules-of-React violations.

### Always prefer structural fixes over memoization

The React docs' recommended principles (still valid with the compiler):

1. Let wrapper components accept JSX as `children` so state updates don't force child re-renders.
2. Keep state local; don't lift it higher than necessary.
3. Keep rendering logic pure (fix bugs instead of memoizing around them).
4. Avoid unnecessary Effects that update state.
5. Move objects/functions *inside* Effects instead of memoizing them as dependencies.

### Workflow

1. Write clear, predictable code (no preemptive hooks).
2. Enable React Compiler + `eslint-plugin-react-hooks` `recommended` (promote `unsupported-syntax`, `incompatible-library`, `set-state-in-effect` to errors).
3. Profile real bottlenecks (production build, CPU throttling, React Profiler).
4. Add `useMemo`/`useCallback`/`React.memo` only where evidence supports it, with a comment explaining why.
5. For existing code: leave existing memoization in place initially (removing it can change compilation output) or test carefully before removing.

---

## Memoization audit — candidates for future cleanup

This list tracks remaining uses of `useMemo`, `useCallback`, and `React.memo` that we may consider removing or refactoring in a future pass. Many are tied to list performance or third‑party libraries (FlashList, Reanimated, Maps) and should be evaluated carefully against the decision guidelines above.

### Activities
- `src/features/activities/screens/DetailsScreen.tsx`
  - useCallback: `onDeleteActivity`, `keyExtractor`, `handleActivityPress`, `renderItem`, `clearSearch`
  - useMemo: `sortedActivities`, `filteredActivities`
- `src/features/activities/components/ActivityAnalysisView.tsx`
  - useMemo: `trackSimilarCount` (and any additional memoizations within the file)
- `src/features/activities/components/ActivityListItem.tsx`
  - React.memo: `MemoizedActivityListItem`

### Activities Hooks
- `src/features/activities/hooks/useProcessedActivities.ts`
  - useMemo: `myActivitiesToUse`, `allActivitiesToUse`

### Home
- `src/features/home/components/ActivityCalendarPeriod.tsx`
  - useMemo: `currentWeekNumber`, `weekActivitiesMap`, `markedDates`
  - useCallback: `handleWeekNumberPress`, `isWeeklyGoalAchieved`, `handleDayPress`

### Maps
- `src/features/maps/screens/MapsScreen.android.tsx`
  - useMemo: `currentlyFilteredActivities`
  - useCallback: `refitMapToVisibleActivities`
- `src/features/maps/components/MiniMapComponent.android.tsx`
  - useCallback: `fitToTrack`, `onMapReady`, `onMapLoaded`, `onLayout`, and another inline callback
- `src/features/maps/components/MiniMapComponent.web.tsx`
  - useCallback: `onMapReady`

### Auth
- `src/features/auth/services/AuthService.ts`
  - useCallback: `retrieveToken`, `get_access_token`, `disconnect`

### Notes
- Many of the above are tied to:
  - List rendering performance (e.g., FlashList `renderItem`, `keyExtractor`).
  - Reanimated/Gesture Handler callbacks that benefit from stable identities.
  - Map components that may expect stable callbacks.
- Prefer profiling before removal. Reintroduce memoization selectively if regressions appear.
- When removing a hook, add a comment at the site if the decision was non-obvious (e.g. kept first-match instead of replaceAll), and run E2E tests — unit tests won't catch integration timing regressions.
path: /Users/brunoorsier/dev/offline-fitness/docs/memoization-audit.md