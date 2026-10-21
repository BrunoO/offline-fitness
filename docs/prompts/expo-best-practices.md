# Expo Best Practices Review Prompt

**Purpose:** Evaluate Expo SDK usage, managed workflow compliance, and mobile-specific best practices for this React Native/Expo application.

---

## Prompt

```
You are a Senior Expo/React Native Engineer specializing in production mobile applications. Review this application for Expo best practices and configuration: Offline Fitness - a React Native/Expo app for tracking and analyzing Strava activities.

## Application Context
- **Framework**: Expo managed workflow (SDK 54)
- **Build**: EAS Build for production
- **Deployment**: Google Play Store / Apple App Store
- **Features**: maps, file system caching, local archive import, WebDAV backup

---

## Scan Categories

### 1. Expo SDK Usage

**Deprecated APIs**
- Usage of deprecated Expo SDK features
- Outdated SDK patterns (old import paths)
- Features that require ejecting when not necessary

**SDK Version Alignment**
- Dependencies not aligned with current SDK version
- Incompatible native module versions
- Missing Expo SDK updates for security/performance

**Module Selection**
- Using community modules when Expo equivalents exist
- Heavy native modules that could use lighter Expo alternatives
- Missing Expo modules that would simplify implementation

---

### 2. app.json / app.config.js Configuration

**Essential Configuration**
- Missing required fields (name, slug, version)
- Incorrect bundle identifiers
- Missing or incorrect permissions declarations
- Splash screen not configured properly

**Platform-Specific Config**
- iOS-specific config missing (supportsTablet, infoPlist)
- Android-specific config missing (permissions, versionCode)
- Missing adaptive icon configuration
- Incorrect deep link schemes

**Optimization Config**
- Asset bundling not optimized
- Missing web configuration (if applicable)
- Incorrect or missing Sentry/error reporting config

---

### 3. EAS Build Configuration

**eas.json Completeness**
- Build profiles for development/preview/production
- Missing environment variables configuration
- No build caching configuration
- Missing native credentials management

**Build Optimization**
- Gradle/Xcode build settings not optimized
- Missing proguard/minification configuration
- Bundle size not optimized

**Submission Configuration**
- Missing EAS Submit configuration
- Store credentials not properly managed
- Auto-increment version not configured

---

### 4. Permissions & Platform Capabilities

**Permissions Handling**
- Permissions requested without proper context/explanation
- Missing permission usage descriptions (iOS)
- Permissions requested at wrong time in user flow
- No handling for denied permissions

**Location Services**
- Background location not configured properly
- Unnecessary location precision requested
- Missing location permission rationale

**Background Work**
- Background tasks that are no longer needed (the app syncs in the foreground only)
- `expo-background-task` / `expo-task-manager` still referenced after removal
- `UIBackgroundModes` entries left in `app.json` without a registered task

---

### 5. OTA Updates (expo-updates)

**Update Strategy**
- No OTA update strategy defined
- Critical updates not forced
- No fallback for failed updates
- Update checks blocking app start

**Configuration**
- expo-updates not configured
- Missing update URL or runtime version
- No staging/production update channels

---

### 6. Asset Management

**Asset Bundling**
- Large assets not included in prebuild
- Missing assetBundlePatterns configuration
- Font loading not optimized
- Image assets not optimized for mobile

**Caching Strategy**
- expo-asset not used for static assets
- expo-file-system cache not managed
- Cache cleanup logic missing

---

### 7. Error Reporting & Monitoring

**Error Tracking**
- Missing Sentry or equivalent error tracking
- Native crashes not captured
- Source maps not uploaded to error service
- No breadcrumb logging for debugging

**Analytics**
- App analytics not implemented
- User journeys not tracked
- Performance metrics not collected

---

### 8. Development Workflow

**Dev Client Usage**
- Not using expo-dev-client for native debugging
- Missing development build configuration
- Slow development iteration

**Debugging Tools**
- Flipper not configured
- React DevTools not accessible
- Performance profiling not set up

---

## Output Format

For each finding:
1. **Location**: Configuration file or code location
2. **Issue Type**: Category from above
3. **Impact**: How does this affect the app?
4. **Current State**: What is configured now?
5. **Recommended Fix**: Specific configuration or code change
6. **Severity**: Critical / High / Medium / Low
7. **Effort**: S/M/L

---

## Summary Requirements

End with:
- **Expo Best Practices Score**: 1-10 with justification
- **Critical Configuration Issues**: Must fix for production
- **SDK Upgrade Considerations**: Should any modules be upgraded?
- **Build Optimization Recommendations**: Reduce build time/size
- **Quick Wins**: Easy improvements for better development experience
```

---

## Usage Context

- Before submitting to app stores
- After Expo SDK upgrades
- When adding new native features
- During production readiness reviews
