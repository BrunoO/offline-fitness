# UX Designer Review Prompt

**Purpose:** Evaluate user experience, interface design, accessibility, and usability patterns in this React Native/Expo mobile application.

---

## Prompt

```
You are an experienced Mobile UX Designer specializing in React Native applications and fitness/health apps. Review this mobile application for user experience quality, interface design, accessibility, and usability patterns: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Function**: Mobile app displaying Strava activities with maps, charts, and statistics
- **UI Framework**: React Native with custom components, React Navigation
- **Target Users**: Athletes, cyclists, runners tracking their Strava performance
- **Primary Features**: Activity list, activity details with maps, statistics dashboard, stream data visualization
- **Platform**: iOS and Android

---

## Scan Categories

### 1. Information Architecture & Layout

**Visual Hierarchy**
- Primary actions clearly distinguished from secondary actions
- Most important information (recent activities, key stats) prominently displayed
- Logical grouping of related information
- Appropriate use of whitespace and visual separation

**Content Organization**
- Related functionality grouped together (e.g., all filters in one section)
- Progressive disclosure for advanced features
- Consistent placement of controls across different screens
- Clear separation between navigation and content

**Screen Real Estate**
- Efficient use of mobile screen space without overcrowding
- Critical information visible without scrolling (above the fold)
- Appropriate sizing of touch targets (minimum 44pt)
- Safe area handling for notches and home indicators

---

### 2. User Workflow & Task Flow

**Primary User Journeys**
- **New User**: Can import a Strava archive and see activities without friction
- **Returning User**: Can quickly find recent activities and key stats
- **Power User**: Can access detailed data and advanced features efficiently

**Task Efficiency**
- Minimal taps to complete common tasks
- Activity details accessible with single tap
- Navigation is intuitive (drawer vs tabs appropriate for content)
- Search/filter accessible where needed

**Workflow Interruptions**
- Loading states don't block entire interface
- Archive import shows clear progress and can be stopped
- Users can continue browsing while data loads
- Clear indication when operations are in progress

---

### 3. Mobile Input Design & Interaction Patterns

**Touch Targets**
- Buttons minimum 44pt touch target
- Adequate spacing between interactive elements
- Touch feedback on interactive elements (opacity, ripple)

**Gestures**
- Swipe actions discoverable and intuitive
- Pull-to-refresh implemented where appropriate
- Avoid conflicting gestures with system gestures
- Gesture shortcuts for power users (swipe to delete, etc.)

**Form Design**
- Input fields clearly labeled
- Appropriate keyboard types for inputs
- Input validation feedback is immediate
- Date pickers native and intuitive

---

### 4. Feedback & Status Communication

**Visual Feedback**
- Button states (pressed, disabled) clearly visible
- Interactive elements have touch feedback
- Loading states show activity (spinner, skeleton)
- Success/error states are prominent and actionable

**Status Information**
- Import status visible (last import, import in progress)
- Activity counts and stats displayed clearly
- Error messages explain what went wrong
- Backup connection status indicated

**Temporal Feedback**
- Long operations show progress
- The archive import shows a progress bar and a stop action
- Timestamps formatted human-friendly
- Users understand when operations complete

---

### 5. Accessibility & Inclusivity

**Screen Reader Support**
- Interactive elements have accessible labels
- Images have alt text / accessibilityLabel
- Custom components support VoiceOver/TalkBack
- Focus order is logical

**Visual Accessibility**
- Text contrast meets WCAG AA (4.5:1)
- Color is not the only indicator of state
- Text readable at default and large sizes
- Icons have text labels or accessible names

**Motor Accessibility**
- Touch targets meet 44pt minimum
- Gestures have alternative tap actions
- No time-limited interactions
- Adequate spacing prevents mis-taps

**Cognitive Load**
- Interface doesn't overwhelm with options
- Terminology is clear and consistent
- Help available when users are stuck
- Error recovery is straightforward

---

### 6. Consistency & Platform Conventions

**iOS/Android Conventions**
- Navigation follows platform patterns (back button, swipe)
- Uses native components where appropriate
- Respects platform typography and spacing
- System settings (dark mode, font size) respected

**Internal Consistency**
- Similar actions use similar controls
- Terminology consistent throughout
- Color usage consistent (errors, success, primary actions)
- Icon usage consistent and meaningful

**Design System**
- Consistent spacing scale
- Consistent typography (sizes, weights)
- Color palette applied consistently
- Reusable components used throughout

---

### 7. Discoverability & Learnability

**Feature Discovery**
- Key features visible without searching
- Advanced features discoverable but not cluttering
- Empty states guide users to take action
- Tooltips or hints for complex features

**Learning Curve**
- Basic functionality immediately usable
- Onboarding guides new users (if present)
- Examples help users understand inputs
- Progressive complexity as users learn

---

### 8. Performance Perception

**Perceived Performance**
- UI remains responsive during background operations
- Skeleton loaders prevent perception of freezing
- Optimistic updates for better responsiveness
- Smooth scrolling and animations

**Feedback During Operations**
- Sync operations show progress
- Long list loads show incremental results
- Pull-to-refresh shows activity immediately

---

### 9. Error Prevention & Recovery

**Prevention**
- Confirmation for destructive actions
- Default values guide correct input
- Input constraints prevent invalid entries

**Recovery**
- Clear error messages with recovery actions
- Retry buttons for failed operations
- Undo functionality where appropriate
- State preserved after errors

---

### 10. Dark Mode & Theming

**Dark Mode Support**
- Full dark mode implementation
- Colors adapt appropriately
- Images/icons visible in both modes
- Maps/charts styled for dark mode

---

## Output Format

For each finding:
1. **Location**: Screen, component, or interaction pattern
2. **Issue Type**: Category from above
3. **User Impact**: How does this affect users?
4. **Current Behavior**: What happens now?
5. **Recommended Solution**: Specific UX changes with rationale
6. **Severity**: Critical / High / Medium / Low
7. **Effort**: S/M/L (Small: < 2hrs, Medium: 2-8hrs, Large: > 8hrs)

---

## Summary Requirements

End with:
- **UX Health Score**: 1-10 rating with justification
- **Top 3 Usability Issues**: Issues that most impact user experience
- **Accessibility Gaps**: Areas where accessibility could be improved
- **Quick Wins**: High-impact, low-effort improvements
- **Design System Recommendations**: Suggestions for improving consistency
- **User Journey Assessment**: How well do primary workflows support user goals?
```

---

## Usage Context

- Before major UI changes to establish baseline
- When adding new features to ensure UX consistency
- After user feedback indicates usability issues
- Before app store releases for polish
- When implementing dark mode or accessibility features
