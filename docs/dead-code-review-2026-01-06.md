# Dead Code Review - 2026-01-06

## Summary

A comprehensive review of the codebase was performed to identify and remove dead code, including unused functions, commented-out code, and unnecessary comments.

## Removed Dead Code

### 1. Unused Functions

#### `getDaysOfMonth` in `src/shared/utils/utils.ts`
- **Status**: Removed
- **Reason**: Function was exported but never imported or used anywhere in the codebase
- **Impact**: None - function was completely unused

#### `retrieveEpochLastFetched` in `src/shared/services/storage.ts`
- **Status**: Removed
- **Reason**: Function was exported but never called anywhere in production code
- **Note**: The `EPOCH_LAST_FETCHED_KEY` constant is still used and was kept
- **Test**: Also removed the test for this function in `__tests__/shared/services/storage.spec.ts` since the function is no longer part of the API
- **Impact**: None - function was completely unused in production code

### 2. Commented-Out Code

#### `retrieveActivity` in `src/shared/services/storage.ts`
- **Status**: Removed
- **Reason**: Entire function was commented out in a block comment, indicating it was deprecated or replaced
- **Impact**: None - code was already disabled

### 3. Unnecessary Comments

#### Commented code in `src/features/stats/screens/RecentMonthsScreen.tsx`
- **Status**: Removed
- **Reason**: Old commented-out implementation of `formatDateAxis` function (lines 21-26)
- **Impact**: None - was just old code left in comments

#### Redundant comment in `src/features/stats/screens/RecentMonthsScreen.tsx`
- **Status**: Removed
- **Reason**: Comment "Use seconds_to_label from utils for consistent HH:mm formatting" was redundant (the import already shows this)
- **Impact**: None - just cleanup

## Code Still in Use (Verified)

The following were checked and confirmed to be in active use:

- `EPOCH_LAST_FETCHED_KEY` - Used in `useActivities.ts` for storing/retrieving last fetch epoch
- All other exported utility functions in `utils.ts` - Verified usage across the codebase
- All storage functions except `retrieveEpochLastFetched` - Confirmed active usage

## Verification

- ✅ All changes pass TypeScript compilation (`npx tsc --noEmit`)
- ✅ All changes pass ESLint (`npx expo lint --fix`)
- ✅ No breaking changes introduced
- ✅ No unused imports detected in modified files

## Recommendations

1. **Ongoing Maintenance**: Consider adding a script to detect unused exports automatically
2. **Code Review**: When removing functions, check if they're part of a public API that might be used externally
3. **Documentation**: The removed functions had JSDoc comments, which suggests they were intended for use - consider documenting why they were removed if they might be needed in the future

## Files Modified

1. `src/shared/utils/utils.ts` - Removed `getDaysOfMonth` function
2. `src/shared/services/storage.ts` - Removed `retrieveEpochLastFetched` function and commented `retrieveActivity` function
3. `src/features/stats/screens/RecentMonthsScreen.tsx` - Removed commented code and redundant comments
4. `__tests__/shared/services/storage.spec.ts` - Removed test for `retrieveEpochLastFetched` function
