# Security Review Prompt

**Purpose:** Identify security vulnerabilities in this React Native/Expo mobile application for Strava activity tracking.

---

## Prompt

```
You are a Senior Mobile Security Engineer specializing in React Native/Expo applications. Review this mobile application for security vulnerabilities: Offline Fitness - a React Native/Expo app that is fully offline and imports a Strava account archive from the device.

## Application Context
- **Function**: Mobile app for tracking and analyzing Strava activities
- **Ingestion**: local import of a Strava data-export ZIP (`activities.csv` + GPX tracks) — no Strava API, no OAuth, no account tokens
- **Data Storage**: AsyncStorage for activities, FileSystem for stream caching
- **Network**: none for activity data; optional WebDAV backup/restore of the local store (credentials in SecureStore)
- **Platforms**: iOS and Android

---

## Scan Categories

### 1. Credential & Backup Security

**Backup Credentials**
- WebDAV password stored unencrypted (should use SecureStore/keychain)
- Backup credentials logged to console or included in error messages
- Password sent over plain HTTP (the backup server is user-provided — check the transport)
- Hardcoded test endpoints or credentials left in the UI

**Local Data Lifecycle**
- Sensitive data not cleared when the user wipes local activities
- Deleted activities resurrected by a restore (tombstone handling)
- No backup encryption of a full copy of the GPS history

---

### 2. Data Storage Security

**Sensitive Data Exposure**
- User credentials or backup secrets in AsyncStorage (unencrypted)
- API keys hardcoded in source code
- Sensitive data in console.log statements
- Debug data exposed in production builds

**Local Storage**
- AsyncStorage used for sensitive data (not secure on rooted devices)
- FileSystem cache containing sensitive GPS data without encryption
- Backup enabled for sensitive data (Android)
- Data not cleared on logout

**Environment Variables**
- Secrets in .env files included in bundle
- API endpoints hardcoded instead of configured
- Debug features enabled in production

---

### 3. Archive Import Security

**Untrusted Input**
- A malicious `.zip` crafted to crash the parser (zip bomb, path traversal in entry names, oversized entries)
- Path traversal when writing extracted entries to the documents directory
- CSV/GPX content injected into logs, file names, or the UI without validation
- Archive entries written outside the intended folder

**Resource Use**
- Whole-archive reads (the export is ~1 GB uncompressed) exhausting memory
- Unbounded loops over entries or GPX points
- No way to cancel a long import

---

### 4. Network Security (WebDAV backup only)

**Network Security**
- HTTP used instead of HTTPS
- Certificate pinning not implemented (MITM risk)
- Sensitive data in URL query parameters (logged by servers)
- Requests without proper authorization headers

**Input Validation**
- User input not sanitized before requests
- Deep link parameters not validated
- File paths not validated (path traversal)
- Remote file names not validated before being written locally

**Error Handling**
- Detailed error messages exposing internal details
- Stack traces sent to client
- Error responses logged with sensitive data

---

### 4. Code Security

**Sensitive Code Exposure**
- Sensitive logic in JavaScript (easily decompiled)
- API secrets visible in bundle
- Algorithm implementations that should be server-side
- Encryption keys in code

**Third-party Dependencies**
- Outdated dependencies with known vulnerabilities
- Dependencies with excessive permissions
- npm audit warnings not addressed

---

### 5. Mobile Platform Security

**iOS-Specific**
- Keychain not used for sensitive storage
- App Transport Security exceptions too broad
- Clipboard data not cleared for sensitive content

**Android-Specific**
- Sensitive data in SharedPreferences (not encrypted)
- Exported components unnecessarily (AndroidManifest)
- Backup allowed for sensitive data (android:allowBackup)
- Debug mode enabled in release build

**Cross-Platform**
- Deep link handlers not validating schemes/origins
- Screenshot allowed on sensitive screens
- Biometric authentication not used where appropriate

---

### 6. Privacy & Data Protection

**Data Collection**
- Collecting more data than necessary
- GPS/location data handling and retention policies
- Analytics collecting PII without consent
- Third-party SDKs with unknown data practices

**Data Transmission**
- Sensitive data sent to third-party analytics
- Location data shared without user awareness
- Activity data uploaded to a backup server without clear user consent

---

### 7. Resource Exhaustion (DoS Vectors)

**Client-Side DoS**
- Unbounded loops on malformed data
- Large data payloads crashing the app (a real Strava export is ~1 GB uncompressed)
- Memory exhaustion from large images/files
- No way to cancel a long-running import or backup

---

## Output Format

For each finding:
1. **Vulnerability**: CWE ID if applicable (e.g., CWE-312: Cleartext Storage)
2. **Location**: File:line or component/service name
3. **Attack Vector**: How could this be exploited?
4. **Impact**: Confidentiality / Integrity / Availability / Privacy
5. **Proof of Concept**: Minimal scenario that triggers the issue
6. **Remediation**: Specific fix with code snippet
7. **Severity**: Critical / High / Medium / Low

---

## Summary Requirements

End with:
- **Security Posture Score**: 1-10 with justification
- **Critical Vulnerabilities**: Must fix before any release
- **Attack Surface Assessment**: What inputs are most dangerous?
- **Hardening Recommendations**: Defense-in-depth suggestions
```

---

## Usage Context

- Before app store submissions
- After adding new network or archive-import features
- When handling new types of sensitive data
- During security-focused code reviews
