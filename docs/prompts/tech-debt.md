# TypeScript/React Native Technical Debt Detection Prompt

**Purpose:** Comprehensive technical debt review tailored for this React Native/Expo/TypeScript mobile application.

---

## Prompt

```
You are an expert TypeScript and React Native refactoring engineer specializing in detecting technical debt.
Review the code of this mobile application: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Code Standards Context
- **Naming Conventions**: Follow project AGENTS.md rules:
  - Directories: `lowercase-with-dashes` (e.g., `components/auth-wizard`)
  - Components: `PascalCase` named exports
  - Hooks: `camelCase` with `use` prefix (e.g., `useActivities`)
  - Files: `camelCase` for services/utils, `PascalCase` for components
- **Standard**: TypeScript strict mode, no `any` types
- **Architecture**: Feature-based structure with barrel exports, React Context for state

---

## Scan Categories

### 1. Dead/Unused Code
- Functions, variables, imports never called or referenced
- Unused type definitions or interfaces
- Commented-out code blocks forgotten after refactoring
- Deprecated component props still defined
- Unused dependencies in `package.json`
- Orphaned files after refactoring (components no longer imported)
- Unused styles in StyleSheet definitions
- Console.log statements left in production code

### 2. TypeScript Technical Debt
- Use of `any` type instead of proper typing
- Missing return types on functions
- Type assertions (`as Type`) hiding type errors
- Overly complex generic types that could be simplified
- Interfaces with too many optional properties
- Duplicate type definitions across files
- Missing strict null checks (`strictNullChecks` violations)
- Enum usage where union types are cleaner (per AGENTS.md: avoid enums, use maps)

### 3. React/React Native Debt
- Class components that should be functional
- Missing `useCallback`/`useMemo` for expensive computations or callbacks passed to children
- Prop drilling when Context would be cleaner
- Inline function definitions in JSX causing unnecessary re-renders
- Missing `key` props or using array index as key
- Direct state mutations
- useEffect with missing or incorrect dependencies
- Nested component definitions inside parent components

### 4. Performance Debt
- Large FlatList/ScrollView without virtualization (should use FlashList per project)
- Images without proper sizing/caching (should use expo-image)
- Heavy computations in render phase
- Excessive re-renders (missing memoization)
- Large bundle imports (import entire library vs. specific modules)
- Unoptimized animations (not using react-native-reanimated correctly)
- AsyncStorage reads on every render

### 5. Naming Convention Violations
- Directories not using lowercase-with-dashes
- Components not using PascalCase
- Hooks not prefixed with `use`
- Services/utilities not using camelCase
- Inconsistent naming patterns across similar files
- Generic names (`Manager`, `Handler`, `Utils`, `Data`) that reveal nothing about purpose

### 6. Maintainability Issues
- High cyclomatic complexity (components > 200 lines)
- "God components" with many responsibilities (should be split)
- Missing or stale JSDoc/TSDoc comments on public interfaces
- Circular dependencies between modules (per architecture.md rules)
- Importing from barrel exports within same module (violates architecture.md)
- Hardcoded values that should be constants
- Magic numbers or strings without explanation
- Deeply nested conditionals (> 3 levels)

### 7. Expo/Mobile-Specific Debt
- Deprecated Expo SDK features
- Missing platform-specific handling (`Platform.OS` checks missing)
- Hardcoded dimensions instead of using `useWindowDimensions`
- Not using SafeAreaView for notches/status bars
- Missing error boundaries for critical screens
- Background task handlers not properly configured
- Permissions requested without proper UX flow

---

## Output Format

For each finding:
1. **Quote exact code** (file:line or code block)
2. **Debt type** (category from above)
3. **Risk explanation** (e.g., "Using `any` hides type errors that could cause runtime crashes")
4. **Suggested fix** with code snippet following project conventions
5. **Severity**: Critical / High / Medium / Low
6. **Effort**: Estimated lines changed and time

---

## Summary Requirements

End with:
- Debt ratio estimate (% of codebase affected)
- Top 3 "quick wins" (< 15 min each, high impact)
- Top critical/high items requiring immediate attention
- Areas with systematic patterns (e.g., "All service files in activities/ lack return types")
```

---

## Usage Context

- After completing refactorings or major code changes
- Before committing code to identify cleanup opportunities
- During code review to catch technical debt early
- When preparing for app store releases

---

## Expected Output

- Detailed list of issues with exact code locations
- Severity ratings and effort estimates
- Specific fix suggestions with code snippets following project conventions
- Prioritized action plan
- Overall debt ratio estimate
- Quick wins for immediate improvement
