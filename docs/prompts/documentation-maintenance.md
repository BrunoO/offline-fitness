# Documentation Maintenance Prompt

**Purpose:** Keep project documentation current, well-organized, and useful as the codebase evolves. Run periodically or after significant changes.

---

## Prompt

```
You are a Senior Technical Writer and Documentation Architect reviewing this React Native/Expo mobile application. Audit the documentation for completeness, accuracy, and organization: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Documentation Context
- **Location**: `docs/` folder and root-level documentation files
- **Key Files**: 
  - `docs/architecture.md`: System architecture and import patterns
  - `docs/status.md`: Current development status  
  - `AGENTS.md`: Coding conventions and rules
  - `readme.md`: Project overview
  - `docs/prompts/`: AI assistant prompts for code review
- **Code Comments**: TSDoc/JSDoc in source files

---

## Scan Categories

### 1. Stale Documentation

**Outdated Content**
- Documents referencing removed components, hooks, or services
- Instructions for deprecated build commands or tools
- API documentation not matching current function signatures
- Screenshots showing outdated UI

**Superseded Documents**
- Multiple versions of same topic (keep latest, archive others)
- Plans that have been fully implemented (move to Historical)
- Completed TODO lists still at root level

**Temporal Documents**
- Date-stamped files older than 30 days at root level
- "NEXT_STEPS" or "TODO" files with completed items
- Implementation plans fully executed but not archived

---

### 2. Missing Documentation

**Architecture & Design**
- Components without documented purpose/usage
- State management patterns not documented
- Navigation flow not explained
- API integration patterns unexplained

**How-To Guides**
- Build instructions incomplete for iOS/Android
- Development setup missing steps
- Debugging guides for common issues
- Contribution guidelines missing

**Reference Documentation**
- Public hooks/services without TSDoc comments
- Component props not documented
- Configuration options not explained
- Error codes/messages not explained

---

### 3. Documentation Organization

**File Structure**
- Root level clutter (files that belong in docs/)
- Inconsistent naming conventions
- Related documents not grouped together
- Missing index or table of contents

**Cross-References**
- Broken links between documents
- Missing "See Also" sections
- Duplicate information across files

---

### 4. Documentation Quality

**Clarity Issues**
- Jargon without explanation
- Assumed knowledge not stated
- Missing context for decisions
- Ambiguous instructions

**Formatting Consistency**
- Inconsistent heading levels
- Mixed markdown styles
- Code blocks without language specification
- Tables vs. lists inconsistently used

**Completeness**
- Documents that end abruptly
- Placeholder sections never filled in
- "TBD" or "TODO" markers still present

---

### 5. Code-Documentation Sync

**AGENTS.md Compliance**
- Per AGENTS.md: parse and understand architecture.md before changes
- Per AGENTS.md: update status.md after code changes
- Verify architecture.md reflects current structure
- Verify status.md is current

**JSDoc/TSDoc Comments**
- Services with missing/outdated JSDoc
- Hooks without documented parameters/returns
- Complex functions without explanatory comments

**README Files**
- Root readme not matching current project state
- Feature lists outdated
- Dependency versions incorrect

---

### 6. Documentation Lifecycle

**Archive Candidates**
- Completed implementation plans
- Resolved issue analyses
- Time-specific reviews (move with date)

**Consolidation Opportunities**
- Multiple small docs that should be one comprehensive guide
- Fragmented information across related files

**Split Candidates**
- Overly long documents covering multiple topics
- Mixed audience docs (user guide + developer guide)

---

## Output Format

For each finding:
1. **File**: Document path
2. **Issue Type**: Category from above
3. **Specific Problem**: What exactly is wrong/missing
4. **Suggested Action**: Create / Update / Archive / Delete / Merge / Split
5. **Priority**: High / Medium / Low
6. **Effort**: Quick (< 15 min) / Medium (15-60 min) / Significant (> 1 hr)

---

## Summary Requirements

End with:
- **Documentation Health Score**: 1-10 with justification
- **Archive Actions**: Documents ready to move to archive
- **Critical Gaps**: Missing docs that would most help new contributors
- **Quick Wins**: Easy updates with high impact
- **status.md Check**: Is it current with actual project status?
```

---

## Usage Context

- Monthly documentation review
- After completing major features or refactorings
- Before onboarding new team members
- When documentation feels overwhelming or outdated

---

## Maintenance Checklist

Run this audit and take these actions:

- [ ] Update architecture.md if structure has changed
- [ ] Update status.md with current progress
- [ ] Move completed plans to archive
- [ ] Fix broken cross-references
- [ ] Remove or update stale content
- [ ] Add missing documentation for recent changes
