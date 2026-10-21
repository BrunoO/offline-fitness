#!/bin/bash
# Script to call Jules for React Native/Expo build verification and comprehensive review
# Usage: ./scripts/call_jules.sh

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Check if jules is available
if ! command -v jules &> /dev/null; then
    echo "Error: jules command not found. Please install jules first." >&2
    exit 1
fi

# Check if we're in the project root (look for package.json and app.json)
if [[ ! -f "package.json" ]] || [[ ! -f "app.json" ]]; then
    echo "Error: This script must be run from the project root directory." >&2
    exit 1
fi

# Check if master-orchestrator.md exists
if [[ ! -f "docs/prompts/master-orchestrator.md" ]]; then
    echo "Warning: docs/prompts/master-orchestrator.md not found. Review may fail." >&2
fi

# Determine today's date for the review directory
TODAY=$(date +%Y-%m-%d)

# Find the highest version number for today's date
MAX_VERSION=0
for review_base in "docs/review" "docs/Historical/review"; do
    if [[ -d "$review_base" ]]; then
        for dir in ${review_base}/${TODAY}-v*; do
            if [[ -d "$dir" ]]; then
                VERSION=$(basename "$dir" | sed -n "s/${TODAY}-v\([0-9]*\)/\1/p")
                if [[ -n "$VERSION" && "$VERSION" -gt "$MAX_VERSION" ]]; then
                    MAX_VERSION=$VERSION
                fi
            fi
        done
    fi
done

# Increment version for this execution
NEXT_VERSION=$((MAX_VERSION + 1))
REVIEW_DIR="docs/review/${TODAY}-v${NEXT_VERSION}"

# Create review directory
mkdir -p "$REVIEW_DIR"

echo "Starting Jules session for React Native build verification and comprehensive review..."
echo "Review documents will be stored in: $REVIEW_DIR"

jules remote new --repo . --session "v${NEXT_VERSION} - React Native Build Verification and Comprehensive Review

## Context
This is a React Native/Expo mobile application (Offline Fitness) for tracking and analyzing Strava activities. The project uses TypeScript, Expo SDK 57, and targets iOS and Android.

## Task 1: Build and Test Verification (Priority: CRITICAL)

1. **Install dependencies**:
   - Run \`npm install\` to ensure all dependencies are installed
   - Check for any peer dependency warnings

2. **TypeScript and Lint verification**:
   - Run TypeScript check: \`npx tsc --noEmit\`
   - Run linting: \`npx expo lint\`
   - Fix any type errors or lint issues found

3. **Run tests**:
   - Execute test suite: \`npm test -- --watchAll=false\`
   - Verify all tests pass
   - Check test coverage if available

4. **Build verification** (optional, if time permits):
   - Verify Expo prebuild works: \`npx expo prebuild --platform android --no-install\`
   - Check for any prebuild warnings or errors

5. **If issues are found**:
   - Fix issues following project coding conventions (see AGENTS.md)
   - Re-verify TypeScript, lint, and tests after fixes
   - Document all fixes in \`$REVIEW_DIR/rationale-fixes.md\` with:
     - Description of each issue found
     - Root cause analysis
     - Solution implemented
     - Verification steps taken

## Task 2: Comprehensive Code Review (Priority: HIGH)

1. **Follow the master orchestrator**: Execute the comprehensive review following instructions in \`docs/prompts/master-orchestrator.md\`
2. **Generate all review reports** as specified in the orchestrator
3. **Store all documents** in: \`$REVIEW_DIR\`
4. **Include a summary** linking to all generated reports

## Important Notes

- **Follow AGENTS.md rules**: TypeScript strict mode, functional components, proper naming conventions
- **Follow architecture.md**: Barrel exports, circular dependency prevention rules
- **Update status.md**: After changes, update docs/status.md per AGENTS.md rules
- **Documentation**: All fixes must be documented with rationale

## Available Review Prompts

The following prompts are available in \`docs/prompts/\`:
- tech-debt.md - TypeScript/React Native technical debt
- architecture-review.md - Architecture and code smells
- performance-review.md - React Native performance issues
- security-review.md - Mobile security and backup credentials
- error-handling-review.md - Async/Promise error handling
- test-strategy-audit.md - Jest/React Native testing
- ux-review.md - Mobile UX patterns
- documentation-maintenance.md - Documentation audit
- expo-best-practices.md - Expo SDK usage
- archive-import-review.md - Strava archive import pipeline
- accessibility-review.md - VoiceOver/TalkBack accessibility

## Expected Outcomes

1. ✅ npm install succeeds without errors
2. ✅ TypeScript compiles without errors (\`npx tsc --noEmit\`)
3. ✅ Linting passes (\`npx expo lint\`)
4. ✅ All tests pass (\`npm test\`)
5. ✅ All fixes documented in rationale-fixes.md (if any fixes were needed)
6. ✅ Comprehensive review reports generated in $REVIEW_DIR
7. ✅ Review summary document created"