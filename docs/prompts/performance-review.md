# Performance Profiling Review Prompt

**Purpose:** Identify performance bottlenecks, optimization opportunities, and scalability issues in this React Native/Expo mobile application.

---

## Prompt

```
You are a Senior Mobile Performance Engineer specializing in React Native applications. Review this mobile application for performance issues and optimization opportunities: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Function**: Mobile app displaying Strava activities with maps, charts, and statistics
- **Hot Paths**: Activity list rendering, map polyline display, stats calculations
- **Data Volume**: Potentially thousands of activities with associated GPS streams
- **Existing Optimizations**: FlashList for lists, expo-image for images

---

## Scan Categories

### 1. Rendering Performance

**Unnecessary Re-renders**
- Components re-rendering when props haven't meaningfully changed
- Missing `React.memo()` on expensive pure components
- Missing `useCallback`/`useMemo` for callbacks and computed values
- Inline object/array literals in JSX causing reference changes
- Context updates triggering full tree re-renders

**List Performance**
- FlatList used instead of FlashList for large lists
- Missing `keyExtractor` or using array index as key
- Missing `getItemLayout` for fixed-height items
- Heavy cell components without proper memoization
- Inline renderItem functions (should be stable references)

**Component Size**
- Large component trees rendered in one frame
- Missing lazy loading for heavy screens
- Complex calculations in render phase (should move to useMemo)

---

### 2. Memory Management

**Memory Leaks**
- Event listeners not cleaned up in useEffect return
- Timers (setTimeout, setInterval) not cleared on unmount
- Async operations completing after component unmount
- Closures holding references to stale data

**Image Memory**
- Unoptimized images (large dimensions, uncompressed)
- Missing image caching strategy
- SVG usage where PNG would be more efficient at scale
- Not using expo-image for caching and optimization

**Data Storage**
- Loading all data into memory at once
- Not paginating large datasets
- Caching strategy causing memory bloat
- Stream data (GPS points) not properly managed

---

### 3. JavaScript Thread Performance

**Main Thread Blocking**
- Synchronous heavy computations (should use useMemo or web workers)
- JSON parsing of large datasets on main thread
- Large array operations (map, filter, reduce) on thousands of items
- Expensive string operations in rendering

**Async Operations**
- Waterfall API calls that could be parallelized
- Not using Promise.all for independent requests
- Blocking UI while waiting for non-critical data
- Missing optimistic updates for better perceived performance

---

### 4. Native Bridge Overhead

**Bridge Crossing Issues**
- Frequent small native module calls in loops
- Passing large objects over the bridge unnecessarily
- Animated values using JS driver instead of native driver
- Gesture handlers not using react-native-gesture-handler

**Reanimated Usage**
- Standard Animated API where Reanimated is better
- worklet functions accessing JS-side state frequently
- Missing `useAnimatedStyle` for animated components
- Animations not running on UI thread

---

### 5. Bundle Size & Load Time

**Bundle Size Issues**
- Importing entire libraries (e.g., `import * as _` instead of `import { specific }`)
- Large dependencies that could be replaced with lighter alternatives
- Unused code/dependencies not tree-shaken
- Dev dependencies included in production bundle

**Startup Performance**
- Heavy initialization on app start
- Blocking splash screen with synchronous operations
- Not deferring non-critical initializations
- Large AsyncStorage reads blocking startup

---

### 6. Network & API Performance

**API Efficiency**
- Over-fetching data not needed by UI
- Multiple API calls that could be batched
- Missing request deduplication
- Not caching API responses appropriately

**Data Loading Patterns**
- Loading all data upfront instead of on-demand
- Missing pagination for large datasets
- Not using stale-while-revalidate patterns
- Background refresh blocking user interaction

---

### 7. Map & Visualization Performance

**Map Optimization**
- Too many markers/polylines rendered simultaneously
- Polylines with too many points (should simplify)
- Map re-centering on every render
- Missing clustering for dense marker sets

**Chart Performance**
- Victory Native with too many data points
- Re-rendering charts on unrelated state changes
- Missing memoization of chart configurations

---

## Output Format

For each finding:
1. **Location**: File:line or component/hook name
2. **Issue Type**: Category from above
3. **Current Cost**: Estimated performance impact (frame drops, memory, time)
4. **Improvement**: Specific optimization with expected gains
5. **Measurement**: How to measure before/after (Flipper, Profiler, etc.)
6. **Effort**: S/M/L
7. **Risk**: Could this optimization introduce bugs?

---

## Summary Requirements

End with:
- **Performance Score**: 1-10 with justification
- **Top 3 Bottlenecks**: Highest impact issues to fix first
- **Scalability Assessment**: Will this handle 10x more activities?
- **Quick Wins**: Optimizations with high impact and low risk
- **Measurement Recommendations**: Key scenarios to profile
```

---

## Usage Context

- When users report slow app performance
- Before app store releases to ensure smooth experience
- When adding features that increase data volume
- After noticing increased memory usage or crashes
