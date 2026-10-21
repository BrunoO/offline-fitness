# Accessibility Review Prompt

**Purpose:** Evaluate mobile accessibility compliance, screen reader support, and inclusive design in this React Native/Expo application.

---

## Prompt

```
You are a Senior Accessibility Engineer specializing in mobile app accessibility (iOS VoiceOver, Android TalkBack). Review this application for accessibility compliance and inclusive design: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Platform**: React Native (iOS and Android)
- **Target Users**: Athletes of all abilities
- **Key Interactions**: List navigation, map viewing, data visualization
- **Standards**: WCAG 2.1 AA, iOS HIG Accessibility, Material Design Accessibility

---

## Scan Categories

### 1. Screen Reader Support (VoiceOver/TalkBack)

**Accessible Labels**
- Interactive elements without accessibilityLabel
- Images without accessibilityLabel (or decorative not marked)
- Custom components missing accessibility props
- Dynamic content not announcing updates

**Role & State**
- Missing accessibilityRole on interactive elements
- accessibilityState not set (disabled, selected, checked)
- Custom controls without proper role semantics
- Toggle states not announced

**Focus Management**
- Logical focus order (accessibilityViewIsModal)
- Focus not moved after navigation
- Modal dialogs not trapping focus
- Important content not focusable

**Announcements**
- No accessibilityLiveRegion for dynamic updates
- Loading states not announced
- Error messages not announced to screen readers
- Success confirmations silent

---

### 2. Visual Accessibility

**Color Contrast**
- Text contrast < 4.5:1 (normal text)
- Text contrast < 3:1 (large text, 18pt+)
- Icon contrast insufficient
- Focus indicators low contrast

**Color Independence**
- Color alone indicates state (error, success)
- Charts relying only on color differentiation
- Links not distinguishable without color
- Status indicators color-only

**Text Scaling**
- Text not scaling with system settings
- Fixed font sizes (should use dynamic)
- Layout breaks at large text sizes
- Truncation hiding important content

**Motion & Animation**
- No support for reduced motion preference
- Auto-playing animations without pause
- Parallax effects without alternative
- Rapid animations (> 3 per second)

---

### 3. Motor Accessibility

**Touch Targets**
- Touch targets < 44pt (iOS) / 48dp (Android)
- Insufficient spacing between targets
- Small dismiss buttons on modals
- Difficult scroll areas

**Gesture Alternatives**
- Swipe actions without button alternatives
- Complex gestures required for core functions
- Pinch-to-zoom only (need buttons)
- Long press without alternative

**Timeout & Timing**
- Time-limited interactions
- Session timeout without warning
- Auto-dismissing messages too fast

---

### 4. Cognitive Accessibility

**Clarity & Simplicity**
- Jargon without explanation
- Inconsistent terminology
- Complex navigation paths
- Overwhelming information density

**Error Prevention**
- Missing confirmation for destructive actions
- No undo functionality
- Unclear error messages
- No input validation feedback

**Predictability**
- Inconsistent navigation patterns
- Unexpected behavior changes
- Hidden features/actions
- Unclear call-to-action hierarchy

---

### 5. Platform Accessibility Features

**iOS Accessibility**
- Dynamic Type support
- Bold Text support
- Reduce Motion respected
- VoiceOver Gestures work correctly

**Android Accessibility**
- Font scale support
- High contrast support
- TalkBack navigation correct
- Switch Access compatible

**Cross-Platform**
- accessibilityHint for non-obvious actions
- accessibilityValue for sliders/progress
- Consistent behavior across platforms

---

### 6. Data Visualization Accessibility

**Charts & Graphs**
- Alternative text descriptions for charts
- Data available in non-visual format
- Color-blind safe palettes
- Pattern fills as color alternative

**Maps**
- Map content describable to screen readers
- Alternative to visual route display
- Zoom controls accessible
- Location data in text format

---

### 7. Form Accessibility

**Input Fields**
- Labels associated with inputs
- Error messages linked to fields
- Required fields indicated
- Input purpose indicated (autocomplete)

**Validation**
- Errors announced to screen readers
- Focus moved to errors
- Clear error descriptions
- Success confirmation accessible

---

## Output Format

For each finding:
1. **Location**: Screen/component name
2. **Issue Type**: Category from above
3. **WCAG Criterion**: If applicable (e.g., 1.4.3 Contrast)
4. **User Impact**: Who is affected and how?
5. **Current Behavior**: What happens now?
6. **Fix**: Specific accessibility props or changes needed
7. **Severity**: Critical / High / Medium / Low
8. **Effort**: S/M/L

---

## Summary Requirements

End with:
- **Accessibility Score**: 1-10 with justification
- **WCAG AA Compliance**: Pass / Partial / Fail
- **Screen Reader Readiness**: VoiceOver and TalkBack assessment
- **Critical Gaps**: Must fix for accessibility compliance
- **Quick Wins**: Easy fixes with big accessibility impact
- **Testing Recommendations**: Manual testing scenarios
```

---

## Usage Context

- Before app store submissions (accessibility is reviewed)
- When adding new features or screens
- After accessibility-related user feedback
- During inclusive design initiatives
- For compliance with accessibility requirements

---

## Testing Checklist

After running this audit:

- [ ] Test with VoiceOver (iOS)
- [ ] Test with TalkBack (Android)
- [ ] Test with large text sizes (200%)
- [ ] Test with inverted colors / dark mode
- [ ] Test with reduced motion enabled
- [ ] Test with Switch Control (iOS)
- [ ] Verify color contrast ratios
- [ ] Verify touch target sizes
