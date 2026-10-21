# Concurrency and Data Flow Architectural Review

This document details the findings of an architectural review focused on concurrency, race conditions, and data flow in the Offline Fitness application.

## 1. `useActivities` Hook

**File:** `src/features/activities/hooks/useActivities.ts`

### 1.1. Unhandled Promise Rejection in `silentFetchAndStoreStreams`

*   **Issue:** The `silentFetchAndStoreStreams` function is called in a "fire-and-forget" manner within the `refreshActivities` function. If the promise returned by `silentFetchAndStoreStreams` is rejected, the error will be unhandled.
*   **Risk:** An unhandled promise rejection can lead to the application crashing or behaving in unexpected ways.
*   **Recommendation:** Add a `.catch()` block to the `silentFetchAndStoreStreams` promise to handle any potential errors.

## 2. Stream Fetching Services

**File:** `src/features/activities/services/fetchAndStoreStreams.ts`

### 2.1. Race Conditions in File I/O

*   **Issue:** The functions in this file perform numerous file system operations (creating, writing, and deleting files) without any locking mechanism.
*   **Risk:** If multiple asynchronous operations on the same file are initiated in parallel, it could lead to data corruption or an inconsistent state. For example, `deleteStreamFiles` could be called while `fetchAndStoreData` is writing to a file for the same activity.
*   **Recommendation:** Implement a queuing or locking mechanism to ensure that only one file operation is performed at a time for a given activity ID. This could be achieved with a simple in-memory lock or a more robust library.

### 2.2. Unhandled Promise Rejection in `deleteStreamFiles`

*   **Issue:** The `Promise.all` in the `deleteStreamFiles` function does not have a `.catch()` block.
*   **Risk:** If any of the `file.delete()` promises reject, it will result in an unhandled promise rejection.
*   **Recommendation:** Add a `.catch()` block to the `Promise.all` to handle any potential errors.

## 3. Authentication Service

**File:** `src/features/auth/services/AuthService.ts`

### 3.1. Race Condition in `getAccessToken`

*   **Issue:** If multiple parts of the app call `getAccessToken` at the same time when the token is expired, it will trigger multiple parallel calls to `refresh_access_token`.
*   **Risk:** This is inefficient and could lead to inconsistent state if the token is refreshed multiple times in quick succession.
*   **Recommendation:** Implement a simple locking mechanism (e.g., a boolean flag) to ensure that `refresh_access_token` is only called once, even if `getAccessToken` is called multiple times in parallel.

### 3.2. Unhandled Promise Rejection in `useStravaAuth`

*   **Issue:** The `getToken` function, which performs several asynchronous operations, is called from within a `useEffect` hook without a `.catch()` block.
*   **Risk:** If any of the `await` calls within `getToken` reject, it will result in an unhandled promise rejection.
*   **Recommendation:** Wrap the call to `getToken` in a `try/catch` block or add a `.catch()` block to the promise chain to handle any potential errors.
