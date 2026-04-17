# Security Audit

## 1. Summary

| Severity | Count |
|----------|:-----:|
| Critical | 2 |
| High | 2 |
| Medium | 5 |
| Low | 3 |
| **Total** | **12** |

---

## 2. Critical Vulnerabilities

### SEC-01: API Key Exposed in Client Bundle

- **Location**: `vite.config.ts` (line 18), `src/App.tsx` (line 32)
- **Severity**: Critical
- **OWASP Category**: A01:2021 — Broken Access Control
- **Description**: The `GEMINI_API_KEY` is embedded in the production JavaScript bundle via Vite's `define` configuration. Any user can open browser DevTools, inspect the bundled JavaScript, and extract the API key.
- **Attack Scenario**:
  1. Attacker opens the app in a browser
  2. Opens DevTools → Sources → searches for `apiKey`
  3. Extracts the Gemini API key
  4. Uses the key for their own API calls, incurring charges
- **Mitigation**:
  - Remove `GEMINI_API_KEY` from Vite's `define` config
  - Create server-side proxy endpoints for all Gemini API calls:
    - `POST /api/ai/tts` — text-to-speech
    - `POST /api/ai/explain` — quiz explanations
    - `POST /api/ai/transcribe` — speech-to-text
  - Keep the API key server-side only

### SEC-02: Secrets Committed to Version Control

- **Location**: `.env` file in repository root
- **Severity**: Critical
- **OWASP Category**: A02:2021 — Cryptographic Failures
- **Description**: The `.env` file containing production secrets is tracked in git:
  - `GEMINI_API_KEY`
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  - `SESSION_SECRET`
  - `DATABASE_URL` (with credentials)
- **Impact**: Anyone with repository access (or if the repo becomes public) has full access to all secrets.
- **Mitigation**:
  1. Immediately rotate ALL secrets
  2. Remove `.env` from git tracking: `git rm --cached .env`
  3. Verify `.env` is in `.gitignore` (it is listed but was committed before the rule)
  4. Consider purging from git history: `git filter-repo --path .env --invert-paths`
  5. Use a secrets management solution for production (Docker secrets, HashiCorp Vault, or environment variables set at deployment time)

---

## 3. High Severity Vulnerabilities

### SEC-03: No CSRF Protection

- **Location**: `server.ts` (all POST/PATCH/DELETE endpoints)
- **Severity**: High
- **OWASP Category**: A01:2021 — Broken Access Control
- **Description**: No CSRF tokens are implemented. The application relies on `sameSite: lax` cookies, which protect against cross-site POST from foreign domains but NOT against:
  - Same-site attacks (if attacker controls a subdomain)
  - GET-based state changes (though the app correctly uses POST for mutations)
- **Attack Scenario**:
  1. Attacker hosts a page on a same-site subdomain
  2. Page submits a form POST to `/api/admin/allowlist` with `email=attacker@evil.com`
  3. Admin's session cookie is sent automatically
- **Mitigation**:
  - Implement CSRF tokens (e.g., `csrf-csrf` middleware or double-submit cookie pattern)
  - Alternatively, require a custom header (e.g., `X-Requested-With`) that simple forms cannot set

### SEC-04: Weak Default Session Secret

- **Location**: `server.ts` (line 232)
- **Severity**: High
- **OWASP Category**: A02:2021 — Cryptographic Failures
- **Description**: A hardcoded fallback session secret is used when `SESSION_SECRET` is not set:
  ```typescript
  const sessionSecret = process.env.SESSION_SECRET || "local-dev-session-secret";
  ```
- **Impact**: If `SESSION_SECRET` is not configured in production, sessions are signed with a known, guessable key. An attacker could forge session cookies.
- **Mitigation**:
  - Throw an error on startup if `SESSION_SECRET` is not set and `NODE_ENV=production`
  - Remove the fallback entirely for production builds

---

## 4. Medium Severity Vulnerabilities

### SEC-05: No Content Security Policy (CSP)

- **Location**: `nginx/conf.d/default.conf.template`
- **Severity**: Medium
- **OWASP Category**: A03:2021 — Injection
- **Description**: The Nginx config includes `X-Frame-Options`, `X-Content-Type-Options`, and `X-XSS-Protection`, but does NOT include a `Content-Security-Policy` header.
- **Impact**: No protection against inline script injection, unauthorized resource loading, or data exfiltration via CSP violations.
- **Mitigation**: Add a CSP header:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://lh3.googleusercontent.com data:; connect-src 'self' https://generativelanguage.googleapis.com;
  ```

### SEC-06: No Rate Limiting on Content Endpoints

- **Location**: `server.ts` — `/api/content/*`, `/api/tts/*`, `/api/progress`
- **Severity**: Medium
- **OWASP Category**: A04:2021 — Insecure Design
- **Description**: Only `/auth/*` and `/api/admin/*` routes have rate limiting. Content and TTS endpoints are unprotected.
- **Impact**: An authenticated user could:
  - Scrape all content rapidly
  - Flood the TTS cache with arbitrary data
  - Send progress updates at high frequency
- **Mitigation**: Add rate limiting to all API endpoints (e.g., 100 requests/minute for content, 30/minute for TTS).

### SEC-07: XSS Risk via Markdown Rendering

- **Location**: `src/App.tsx` (line 2359)
- **Severity**: Medium
- **OWASP Category**: A03:2021 — Injection
- **Description**: AI-generated explanations are rendered using `react-markdown`:
  ```tsx
  <Markdown>{explanation}</Markdown>
  ```
  While `react-markdown` is generally safe (doesn't allow raw HTML by default), the content comes from Gemini API responses which could theoretically contain malicious markdown if the API were compromised.
- **Impact**: Limited XSS risk if Gemini returns unexpected content.
- **Mitigation**: Explicitly disable `allowedElements` for dangerous tags, or use `rehype-sanitize` plugin.

### SEC-08: Unrestricted TTS Cache Write

- **Location**: `server.ts` (lines 467-485)
- **Severity**: Medium
- **OWASP Category**: A04:2021 — Insecure Design
- **Description**: Any authenticated user can write arbitrary binary data to the `tts_cache` table via `POST /api/tts`. The `audio` field accepts any base64 string.
- **Impact**: Potential storage abuse; could fill database with arbitrary data.
- **Mitigation**:
  - Validate audio data size (e.g., max 1MB per entry)
  - Validate that the term matches a known flashcard/interview term
  - Add rate limiting

### SEC-09: Access Request Without Rate Limiting

- **Location**: `server.ts` (line 488)
- **Severity**: Medium
- **OWASP Category**: A04:2021 — Insecure Design
- **Description**: The `/api/access-request` endpoint has no rate limiting. A denied user could spam access requests.
- **Mitigation**: Add rate limit (e.g., 3 requests per hour per user).

---

## 5. Low Severity Vulnerabilities

### SEC-10: Verbose Error Messages

- **Location**: `server.ts` (various)
- **Severity**: Low
- **OWASP Category**: A09:2021 — Security Logging and Monitoring Failures
- **Description**: Some error responses include detailed error messages that could leak implementation details.
- **Mitigation**: Return generic error messages to clients; log details server-side only.

### SEC-11: No Account Lockout

- **Location**: `server.ts`
- **Severity**: Low
- **Description**: While auth is rate-limited to 20/15min, there's no account-level lockout mechanism. OAuth inherently mitigates brute-force since Google handles authentication, but the allowlist check happens after successful OAuth.
- **Mitigation**: Consider logging failed access attempts for monitoring.

### SEC-12: DELETE Endpoint Uses Soft-Delete Inconsistently

- **Location**: `server.ts` (line 544)
- **Severity**: Low
- **Description**: `DELETE /api/admin/users/:id` sets `is_allowed = 0` (soft delete) rather than removing the record. However, the user's Google OAuth session may still be valid.
- **Mitigation**: Invalidate the user's session when revoking access.

---

## 6. Security Posture Summary

### What's Done Well

| Control | Implementation |
|---------|---------------|
| SQL Injection Protection | All queries use parameterized placeholders (`$1, $2, ...`) |
| Session Security | httpOnly cookies, secure flag (auto), sameSite lax, 7-day expiry |
| Auth Rate Limiting | 20 requests per 15 minutes on `/auth/*` |
| Admin Rate Limiting | 3000 requests per hour on `/api/admin/*` |
| Audit Logging | All admin actions logged with actor, action, target |
| Self-Modification Prevention | Admins cannot modify their own role/access |
| Input Validation | Category allowlist, level range validation, required field checks |
| HTTPS | Nginx + Let's Encrypt with modern TLS (1.2/1.3) |
| Security Headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection via Nginx |
| Trust Proxy | `app.set('trust proxy', 1)` for correct client IP behind Nginx |

### What Needs Improvement

| Control | Status | Priority |
|---------|--------|----------|
| API key protection | Not implemented — key in client bundle | Critical |
| Secrets management | Secrets in git | Critical |
| CSRF protection | Not implemented | High |
| Content Security Policy | Not implemented | Medium |
| Rate limiting coverage | Partial (only auth + admin) | Medium |
| Session invalidation on revoke | Not implemented | Low |
| Error message sanitization | Not implemented | Low |

---

## 7. Recommended Security Improvements (Prioritized)

| Priority | Action | Effort |
|----------|--------|--------|
| P0 | Remove API key from client bundle; proxy through server | Medium |
| P0 | Remove `.env` from git; rotate all secrets | Low |
| P0 | Fail startup if `SESSION_SECRET` is missing in production | Low |
| P1 | Add CSRF protection | Low |
| P1 | Add Content Security Policy header | Low |
| P1 | Add rate limiting to all API endpoints | Low |
| P2 | Validate TTS cache write (size limit, term verification) | Low |
| P2 | Rate limit access request endpoint | Low |
| P2 | Invalidate sessions when user access is revoked | Medium |
| P3 | Add `rehype-sanitize` to react-markdown | Low |
| P3 | Sanitize error messages in production | Low |
