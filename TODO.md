## LEGAL
- [ ] **Terms & Conditions**
- [ ] **Privacy Policy**
- [ ] Wire the acceptance checkbox into `views/legal_consent.ejs` (placeholder already rendered
      by onboarding step 1 and claim step 2) and gate their Continue buttons on it

## UI
- [x] **Mobile UI**
- [ ] **Settings Drop Area Fill Mode + UI**
- [ ] **Error Page (404 / 500)**
- [ ] **Empty States for Unfilled Profile Sections**
- [ ] General Popup Class (Confirm Actions + Terms & Conditions)
- [ ] Skeleton Loaders
- [ ] Fix Profile Content Height 

## FEATURES
- [x] **Account Deletion**
- [x] **Account Claiming**
- [x] **Admin Account Creation**
- [x] **Content Reporting**
- [x] **Email Only Authentication**
- [ ] Keep Report History on Deletion
- [ ] Purge abandoned signups (`onboarding_complete = false`, no profile, older than ~7 days).
      A verified magic link creates the users row before onboarding runs, and
      `cleanup_expired_tokens` only covers `auth_tokens`.

## ERRORS
- [x] **Error Handling (No Visible JSON Errors)**
- [ ] Sentry Error Handling

## SECURITY
- [ ] **Environment Variables & Security Audit**
- [x] **Rate Limiting & Auth Input Sanitization**
- [x] **Session Security**
- [ ] HTTPS live in front of the app (`secure` cookies + 30-day sessions assume it)

## BROWSER OPTIMIZATION
- [ ] **Favicon & Web Manifest**
- [ ] OpenGraph Meta Tags & SEO
- [ ] Preloaded / Fast / Optimized Profile Pages

## GENERAL
- [ ] **Clean Up Code + Comments**
- [ ] **Accent Insensitive Search**
- [ ] **Debugging**
