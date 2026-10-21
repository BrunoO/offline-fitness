# Error Handling Audit Prompt

**Purpose:** Audit error handling patterns for robustness, reliability, and debuggability in this React Native/Expo mobile application.

---

## Prompt

```
You are a Senior Reliability Engineer specializing in robust mobile applications. Review this React Native/Expo application for error handling completeness and consistency: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Function**: Mobile app importing a Strava account archive for offline activity tracking
- **Reliability Needs**: Handles malformed archives, unreadable tracks, storage failures, and (optionally) WebDAV backup network failures
- **Error Sources**: the imported ZIP/CSV/GPX files, AsyncStorage, FileSystem, navigation, user input, the backup transport
- **Logging**: Custom logger with severity levels

---

## Scan Categories

### 1. Async/Promise Error Handling

**Missing Catches**
- `async` functions without try/catch blocks
- Promise chains without `.catch()` handlers
- `Promise.all` not handling individual failures
- Fire-and-forget async calls with no error handling

**Error Propagation**
- Errors swallowed silently (empty catch blocks)
- Generic error messages losing original error context
- Error types not preserved through abstraction layers
- Async errors in useEffect not properly handled

**Async Patterns**
- Race conditions in concurrent async operations
- Missing cancellation for in-flight requests on unmount
- Error states not reset before retrying operations

---

### 2. React Error Boundaries

**Missing Boundaries**
- Critical screens without error boundaries
- Error boundary only at app root (too coarse)
- Feature modules without isolated error handling
- Navigation errors not caught properly

**Boundary Implementation**
- Error boundaries not showing recovery UI
- Missing "retry" functionality in fallback UI
- Error state not logged or reported
- Child errors not surfaced appropriately

---

### 3. Import & Network Error Handling

**Import Errors**
- A single unreadable track aborting the whole import
- Corrupt or truncated ZIP entries not detected
- Malformed CSV rows (missing id/date) crashing the parser
- Partial imports leaving activities without their tracks, with no way to resume
- Cancellation not honoured promptly

**Network Errors (WebDAV backup only)**
- Network failures not distinguished from server errors
- Missing offline detection and handling
- No retry logic for transient failures
- Timeout not configured for the backup transport

**HTTP Status Handling**
- Not checking response status before parsing JSON
- 4xx and 5xx errors treated the same
- Server errors not retried
- Authentication failures (401) not surfaced as "reconnect"

**Error Recovery**
- No queue for requests during offline periods
- Partial failures leaving state inconsistent
- Failed operations not communicated to user

---

### 4. Storage Error Handling

**AsyncStorage Errors**
- Read/write failures not caught
- JSON parse errors on corrupted data
- Storage quota exceeded not handled
- Missing fallback for unavailable storage

**FileSystem Errors**
- File not found errors not handled gracefully
- Write permission errors not caught
- Disk full scenarios not handled
- Cache corruption not detected

---

### 5. User Feedback & Error Communication

**Error Display**
- Errors not surfaced to user in understandable form
- Silent failures with no indication of problem
- Technical error messages shown to users
- Missing actionable guidance for recovery

**Loading & Error States**
- Components without explicit loading/error/empty states
- Error states not distinguishing between error types
- Missing skeleton loaders for better perceived performance
- No retry buttons for failed operations

---

### 6. Logging & Diagnostics

**Logging Completeness**
- Errors occurring without any log output
- Log messages missing important context (error stack, request details)
- Inconsistent log severity levels for similar errors

**Error Reporting**
- Critical errors not reported to error tracking service
- Missing breadcrumbs for error context
- User actions not logged for debugging
- Error counts/trends not tracked

---

### 7. Graceful Degradation

**Partial Failure Handling**
- Single activity failure stopping entire list load
- One import failure affecting unrelated features
- Search failing completely instead of showing cached results

**Recovery Strategies**
- No offline mode when the backup server is unavailable
- Missing cached data fallback
- State not recoverable after errors
- App restart required to recover from errors

---

### 8. Input Validation

**User Input**
- Search queries not validated before API calls
- Form inputs not validated before submission
- Deep link parameters not validated
- File imports not validated (the archive must be a real Strava export before parsing)

**Data Validation**
- API responses not validated against expected shape
- Missing TypeScript runtime validation (Zod, io-ts)
- Nullable/undefined values not checked
- Type assertions (`as Type`) hiding validation

---

## Output Format

For each finding:
1. **Location**: File:line or component/hook name
2. **Error Type**: Category from above
3. **Failure Scenario**: What input/condition triggers this?
4. **Current Behavior**: What happens now?
5. **Expected Behavior**: What should happen?
6. **Fix**: Specific code changes needed
7. **Severity**: Critical / High / Medium / Low

---

## Summary Requirements

End with:
- **Reliability Score**: 1-10 with justification
- **Critical Gaps**: Errors that could crash or corrupt data
- **Logging Improvements**: What to add for better debugging
- **Recovery Recommendations**: How to handle transient failures
- **Testing Suggestions**: Error scenarios to add to test suite
```

---

## Usage Context

- After reliability incidents to identify root causes
- Before app store releases requiring stability
- When adding new error-prone operations (API calls, storage)
- During reviews of async and lifecycle code
