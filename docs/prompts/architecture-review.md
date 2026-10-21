# Architecture & Code Smells Review Prompt

**Purpose:** Identify architectural weaknesses, design pattern violations, and code smells that reduce understanding and maintainability in a React Native/Expo mobile application.

---

## Prompt

```
You are a Senior Software Architect with deep expertise in React Native, Expo, and modern TypeScript patterns. Review this mobile application: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Code Standards Context
- **Standard**: TypeScript with strict mode, functional components, hooks-based architecture
- **State Management**: React Context for global state, AsyncStorage for persistence
- **Architecture**: Feature-based modular structure with barrel exports (see architecture.md)
- **Navigation**: React Navigation (Drawer-based)

---

## Scan Categories

### 1. SOLID Principle Violations

**Single Responsibility Principle (SRP)**
- Components doing too many things (fetching data AND rendering AND handling navigation)
- Hooks with multiple unrelated responsibilities
- Service files mixing API calls, data transformation, AND storage

**Open/Closed Principle (OCP)**
- Components requiring modification for every new feature instead of composition
- Switch statements on type that grow with each new case
- Hardcoded behaviors that should be configurable via props or context

**Liskov Substitution Principle (LSP)**
- Custom hooks that don't follow standard hook patterns
- Components that break expected behavior when replacing parent components

**Interface Segregation Principle (ISP)**
- Props interfaces with many optional properties forcing components to handle nulls
- Context providers exposing more than consumed by children

**Dependency Inversion Principle (DIP)**
- Components directly importing concrete services instead of using Context/props
- Hard-coded API clients where abstraction would enable testing
- Missing dependency injection for services

---

### 2. React Patterns & Anti-patterns

**Component Design Issues**
- Prop drilling through many levels when Context is appropriate
- Components that are too generic (accept too many props) or too specific
- Missing composition patterns (children, render props, compound components)
- Inline component definitions causing remounts

**Hook Hygiene**
- Custom hooks with side effects that should be pure
- useEffect with incorrect/missing dependencies
- Overuse of useEffect for derived state (should use useMemo)
- State updates not batched properly

**State Management Problems**
- Global state for local concerns (or vice versa)
- Derived state stored when it should be computed
- State shape too nested or denormalized
- Missing loading/error states in async operations

---

### 3. Module & Import Structure

**Circular Dependencies** (per architecture.md)
- Importing from own module's barrel export
- Cross-feature imports creating cycles (A → B → C → A)
- Shared services importing from feature modules

**Import Organization**
- Relative imports where aliases (@/) should be used
- Barrel exports including implementation details
- Missing barrel exports for public module APIs

**Module Boundaries**
- Feature modules with unclear boundaries
- Shared module containing feature-specific code
- Leaky abstractions exposing internal implementation

---

### 4. Coupling & Cohesion Smells

**Tight Coupling**
- Components directly accessing AsyncStorage instead of through services
- Navigation logic spread across components instead of centralized
- Platform-specific code leaking into shared components

**Low Cohesion**
- "Utils" files with unrelated functions grouped together
- Feature folders with unrelated components
- Services mixing unrelated API endpoints

**Feature Envy**
- Components that access more data from other features than their own
- Hooks that primarily manipulate external state

---

### 5. Abstraction Failures

**Leaky Abstractions**
- Services exposing raw API response shapes to components
- AsyncStorage keys visible outside storage layer
- Platform-specific types in cross-platform interfaces

**Missing Abstractions**
- Duplicate code suggesting missing shared components or hooks
- Repeated parameter groups that should be typed interfaces
- Magic strings that should be typed constants or enums

**Wrong Level of Abstraction**
- Over-engineered abstractions for single-use cases
- Under-abstracted common patterns (loading states, error handling)
- Components that know too much about data fetching internals

---

### 6. Testability Smells

**Hard to Unit Test**
- Components with direct API calls instead of injected services
- Hooks that depend on global state without Context
- Functions with side effects that should be pure

**Test Coupling**
- Tests that rely on AsyncStorage, network, or timing
- Missing abstraction boundaries for mocking
- Private functions that should be extracted and tested separately

**Missing Boundaries**
- No clear interface between features for mocking
- Services not abstractable for test doubles

---

### 7. Maintainability Red Flags

**Cognitive Complexity**
- Components > 200 lines or > 10 hooks
- Nested conditionals > 3 levels deep
- Boolean props that fundamentally change component behavior

**Documentation Gaps**
- Public interfaces (Context, hooks, services) without TSDoc comments
- Complex business logic without explanatory comments
- Props interfaces without descriptions for non-obvious props

**Naming & Structure**
- Generic names (`Manager`, `Helper`, `Handler`, `Data`, `Info`)
- Inconsistent file organization across features
- Components with names not matching their purpose

---

## Output Format

For each finding:
1. **Location**: File(s) and component/hook/function name
2. **Smell Type**: Category + specific violation
3. **Impact**: Why this hurts understanding/maintainability
4. **Refactoring Suggestion**: Brief description of how to fix, with pattern name if applicable
5. **Severity**: Critical / High / Medium / Low
6. **Effort**: S/M/L (Small: < 1hr, Medium: 1-4hrs, Large: > 4hrs)

---

## Summary Requirements

End with:
- **Architecture Health Score**: 1-10 rating with justification
- **Top 3 Systemic Issues**: Patterns that repeat across the codebase
- **Recommended Refactorings**: Prioritized list (effort vs. impact matrix)
- **Testing Improvement Areas**: Where mocking/abstractions would help most
- **State Management Assessment**: Is the current Context approach scalable?
```

---

## Usage Context

- Before major feature additions to assess extensibility
- When onboarding new team members to identify complexity hotspots
- During architectural planning or refactoring initiatives
- When experiencing state management issues or circular dependency warnings

---

## Expected Output

- Categorized list of architectural smells with locations
- SOLID violations mapped to specific components/hooks
- Module structure assessment with risk areas
- Refactoring recommendations with effort estimates
- Overall architecture health score
