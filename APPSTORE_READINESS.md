# App Store Readiness Checklist — Agency AI iOS

## Build & Signing
| Item | Status | Notes |
|------|--------|-------|
| Bundle ID (`info.agencyai.app`) | Ready | Set in capacitor.config.json |
| App name ("Agency AI") | Ready | Set in capacitor.config.json |
| Version number (1.0.0) | Ready | Set in mobile/package.json |
| Xcode project builds (unsigned) | Ready | GitHub Actions workflow `ios.yml` produces unsigned archive |
| Apple Developer account | Ready | Active account available |
| Signing certificate (Distribution) | Needs-human-action | Must be created/installed in Xcode on a Mac. Go to developer.apple.com > Certificates, Identifiers & Profiles > create iOS Distribution certificate |
| Provisioning profile (App Store) | Needs-human-action | Create at developer.apple.com > Profiles > App Store distribution profile for `info.agencyai.app` |
| TestFlight upload via Xcode | Needs-human-action | Archive in Xcode > Organizer > Distribute App > App Store Connect |
| Automatic signing in CI | Needs-human-action | Requires exporting `.p12` cert + provisioning profile as GitHub secrets, updating `ios.yml` with `CODE_SIGN_IDENTITY` and `PROVISIONING_PROFILE` |

## App Store Metadata
| Item | Status | Notes |
|------|--------|-------|
| App name (30 chars max) | Ready | "Agency AI" (9 chars) |
| Subtitle (30 chars max) | Needs-content | Suggestion: "Automatische AI lead outreach" |
| Description (4000 chars max) | Needs-content | Must describe app functionality for App Store listing |
| Keywords (100 chars max) | Needs-content | e.g. "AI,leads,outreach,agency,marketing,automation,CRM" |
| Category | Ready | Business |
| Secondary category | Ready | Productivity |
| Promotional text (170 chars) | Needs-content | Short promotional text shown above description |

## Visual Assets
| Item | Status | Notes |
|------|--------|-------|
| App icon (1024x1024, no alpha) | Ready | `mobile/assets/icon-1024.png` exists, `generate-icons.js` produces all sizes |
| iPhone 6.7" screenshots (1290x2796) | Needs-content | Minimum 3 screenshots required. Take from production app on iPhone 15 Pro Max or simulator |
| iPhone 6.5" screenshots (1284x2778) | Needs-content | Required for iPhone 11 Pro Max and similar |
| iPhone 5.5" screenshots (1242x2208) | Needs-content | Required for iPhone 8 Plus and similar |
| iPad Pro 12.9" screenshots (2048x2732) | Needs-content | Required if app supports iPad (currently phone-only is fine) |
| Splash/launch screen | Ready | `mobile/generate-splash.js` exists, `www/index.html` serves as loading screen |

## Privacy & Legal
| Item | Status | Notes |
|------|--------|-------|
| Privacy policy URL | Needs-content | Must be a publicly accessible URL (e.g. `https://www.agencyai.info/privacy`). Required by Apple |
| Support URL | Needs-content | e.g. `https://www.agencyai.info/support` or `mailto:info@agencyai.info` |
| Terms of service URL | Needs-content | Recommended. e.g. `https://www.agencyai.info/terms` |
| Privacy Nutrition Label | Needs-content | Must declare data collected: email address (account), usage data (analytics), name (account). Declare in App Store Connect |
| App Tracking Transparency | Ready | No third-party tracking SDKs detected in Capacitor config |

## iOS Permissions
| Item | Status | Notes |
|------|--------|-------|
| Network access (NSAppTransportSecurity) | Ready | `cleartext: false` in Capacitor config (HTTPS only) |
| Push notifications | Needs-human-action | If push is desired: add `@capacitor/push-notifications` plugin, add `NSUserNotificationsUsageDescription` to Info.plist, configure APNs key in Apple Developer |
| Camera/Photo Library | Not needed | No camera/photo features in current web app |
| Location | Not needed | No location features |

## Age Rating
| Item | Status | Notes |
|------|--------|-------|
| Age rating questionnaire | Needs-content | Fill out in App Store Connect. Likely 4+ (no objectionable content, no user-generated content visible to other users, no gambling/contest) |

## Technical Requirements
| Item | Status | Notes |
|------|--------|-------|
| Minimum iOS version | Ready | Capacitor 5 supports iOS 13+ |
| IPv6 networking | Ready | Remote URL app — handled by iOS networking stack |
| Safe area / notch handling | Ready | `viewport-fit=cover` set in www/index.html. Web app uses CSS safe-area-inset variables |
| Dark mode support | Ready | App already uses dark theme |
| Background/resume handling | Ready | Capacitor WebView handles this natively. Remote URL reloads on resume if needed |

## Review Notes
| Item | Status | Notes |
|------|--------|-------|
| Demo account credentials | Needs-content | Provide App Review team with test login: `demo@test.nl` / `password` (create a demo account specifically for Apple review) |
| Notes for reviewer | Needs-content | Explain this is a B2B SaaS for marketing agencies. Requires account creation. Core functionality is AI-powered lead discovery and outreach automation |

## Summary
- **Ready**: 14 items
- **Needs-content**: 12 items (metadata/screenshots/legal pages that need to be written)
- **Needs-human-action**: 4 items (signing cert, provisioning profile, TestFlight upload, push notification setup)
- **Not needed**: 2 items

### Critical path to TestFlight:
1. Create Distribution certificate + provisioning profile (Apple Developer portal)
2. Open `mobile/ios/App/App.xcworkspace` in Xcode on Mac
3. Select team and signing profile
4. Archive > Distribute to App Store Connect
5. Add test users in TestFlight

### Critical path to App Store submission:
All of the above plus:
1. Write privacy policy and host at public URL
2. Take screenshots on required device sizes
3. Write app description and keywords
4. Fill out age rating questionnaire
5. Complete Privacy Nutrition Label
6. Submit for review with demo credentials
