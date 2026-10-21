# Test Strategy Audit Prompt

**Purpose:** Evaluate test coverage, quality, and strategy for this React Native/Expo mobile application. Identify gaps and opportunities to improve confidence in the codebase.

---

## Prompt

```
You are a Senior QA Architect and Test Engineer specializing in React Native test strategies. Audit the test suite for this mobile application: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Testing Context
- **Framework**: Jest with jest-expo preset
- **Test Location**: `__tests__/` directory
- **Component Testing**: @testing-library/react-native
- **Mocking**: Jest mocks for native modules
- **Coverage Tools**: Jest coverage reports
- **Build**: Expo managed workflow

---

## Scan Categories

### 1. Coverage Analysis

**Missing Test Files**
- Services, hooks, utilities with no corresponding `.spec.ts` file
- New features added without test coverage
- Platform-specific code untested

**Coverage Gaps by Type**
- Public functions/hooks with no test cases
- Error handling paths never exercised
- Edge cases not covered (empty input, null values, large datasets)
- Async operations not tested for all outcomes

**Coverage Metrics**
- Line coverage < 70% in critical services
- Branch coverage neglected (only happy paths tested)
- Hook coverage missing for custom hooks

---

### 2. Test Quality

**Test Smell Detection**
- Tests > 50 lines (should be split into focused cases)
- Multiple assertions testing unrelated behaviors
- Tests with no assertions (verify something!)
- Commented-out tests still in source
- Magic values without explanation

**Test Independence Issues**
- Tests relying on execution order
- Shared mutable state between tests
- Tests modifying global state without cleanup
- AsyncStorage state persisting between tests

**Assertion Quality**
- Weak assertions (`expect(result).toBeTruthy()` vs `expect(result).toEqual(expected)`)
- Missing failure messages for complex assertions
- Not testing error messages, only error types
- Snapshot tests without meaningful snapshots

---

### 3. Test Organization

**Naming Conventions**
- Test names not describing behavior (e.g., `test1`, `testCase`)
- Inconsistent naming patterns across test files
- Describe blocks not matching component/function names

**Test Structure**
- Missing `describe` blocks to group related tests
- Duplicate setup code across multiple tests (should use `beforeEach`)
- Test files with unrelated test cases grouped together

**Test Categories**
- No distinction between unit/integration tests
- Slow tests not identified or skipped in watch mode
- Missing test scripts in package.json for different scenarios

---

### 4. Mock Strategy

**Mock Coverage**
- Native modules without mocks (causing test failures)
- API services not mocked for unit tests
- AsyncStorage/FileSystem not mocked consistently
- Navigation context not mocked for screen tests

**Mock Quality**
- Mocks with hardcoded return values (not configurable per test)
- Over-mocking (mocking implementation details)
- Mocks not matching real module interfaces
- Jest moduleNameMapper not configured for all native modules

**Isolation**
- Network calls leaking into tests (should mock fetch / the WebDAV transport)
- AsyncStorage state not reset between tests
- Timer-dependent tests not using fake timers

---

### 5. React Native Specific Testing

**Component Testing**
- Components tested with enzyme instead of @testing-library/react-native
- Missing accessibility queries (getByRole, getByA11yLabel)
- Not testing loading/error/empty states
- User interactions not tested (fireEvent, press, type)

**Hook Testing**
- Custom hooks not tested in isolation
- Missing @testing-library/react-hooks or renderHook
- Hook dependencies not tested

**Navigation Testing**
- Screen components not tested with navigation context
- Deep links not tested
- Navigation events not verified

---

### 6. Error & Edge Case Testing

**Error Path Coverage**
- API failures not simulated in tests
- Network offline conditions not tested
- AsyncStorage failures not exercised
- Invalid input handling incomplete

**Boundary Testing**
- Empty arrays/objects
- Single-element collections
- Large data sets (performance)
- Unicode/special characters in search
- Long strings exceeding expected limits

**Negative Testing**
- Invalid props not tested
- Null/undefined inputs not verified
- Type boundary values not tested

---

### 7. Test Infrastructure

**Configuration**
- jest.setup.js missing common mocks
- transformIgnorePatterns not covering all needed modules
- moduleNameMapper incomplete for native modules

**Test Performance**
- Slow tests not optimized
- Test parallelization not enabled
- Expensive setup repeated across tests (use beforeAll)

**CI Integration**
- Tests not run in CI pipeline
- Coverage reports not generated/tracked
- Test failures not blocking merges

---

### 8. Missing Test Types

**Integration Tests**
- Feature flows not tested end-to-end
- Service + storage interactions not verified
- API integration not tested (even with mocks)

**Visual/Snapshot Tests**
- Component snapshots not used for UI regression
- Snapshots too large (should snapshot smaller units)
- Snapshots not reviewed when updated

**E2E Tests (Detox)**
- Critical user flows not covered by E2E tests
- Missing Detox configuration for E2E
- No smoke tests for app launch

---

## Output Format

For each finding:
1. **Component**: File or module name
2. **Issue Type**: Category from above
3. **Gap Description**: What testing is missing or flawed
4. **Risk**: What bugs could slip through?
5. **Suggested Action**: Specific test to add or fix
6. **Priority**: Critical / High / Medium / Low
7. **Effort**: S/M/L

---

## Summary Requirements

End with:
- **Test Health Score**: 1-10 with justification
- **Coverage Estimate**: Approximate line/branch coverage
- **Critical Gaps**: Components with highest risk from missing tests
- **Flakiness Assessment**: Are there timing-dependent tests?
- **Quick Wins**: Easy tests to add with high value
- **Recommended Testing Strategy**: Unit vs Integration vs E2E balance
- **Infrastructure Improvements**: Jest config, mocks, CI integration
```

---

## Usage Context

- Before major releases to assess confidence
- After discovering production bugs (was it testable?)
- When planning test improvement sprints
- During code reviews to suggest missing tests

---

## Test Improvement Checklist

After running this audit:

- [ ] Add tests for critical uncovered services/hooks
- [ ] Fix or remove flaky tests
- [ ] Add proper mocks for all native modules
- [ ] Enable coverage reporting in CI
- [ ] Create integration tests for key user flows
- [ ] Document testing strategy in `docs/TESTING.md`
