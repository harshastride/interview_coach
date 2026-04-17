# Code Quality Audit

## 1. Summary

| Severity | Count |
|----------|:-----:|
| Critical | 3 |
| High | 4 |
| Medium | 6 |
| Low | 4 |
| **Total** | **17** |

---

## 2. Critical Issues

### CQ-01: God Component — App.tsx (2,419 lines)

- **File**: `src/App.tsx`
- **Severity**: Critical
- **Description**: The entire application UI — authentication, home screen, flashcard mode, quiz mode, interview practice (4 phases), admin panel (7 tabs), TTS logic, STT logic, progress tracking, PDF generation, and CSV parsing — is contained in a single React component.
- **Impact**: Extremely difficult to maintain, test, debug, or extend. Any change risks unintended side effects. No code reuse possible. React re-renders are inefficient because all state is in one component.
- **Recommendation**: Decompose into ~15-20 focused components and custom hooks. See Refactoring Roadmap.

### CQ-02: API Key Exposed in Client Bundle

- **File**: `vite.config.ts` (line 18), `src/App.tsx` (line 32)
- **Severity**: Critical
- **Description**: `GEMINI_API_KEY` is injected into the frontend JavaScript bundle via Vite's `define` configuration. The key is accessible to anyone using browser DevTools.
- **Code**:
  ```typescript
  // vite.config.ts
  define: {
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? ''),
  }
  // App.tsx
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  ```
- **Impact**: Anyone can steal the API key and use it for their own purposes, incurring charges.
- **Recommendation**: Proxy all Gemini API calls through the Express server.

### CQ-03: Secrets Committed to Git

- **File**: `.env`
- **Severity**: Critical
- **Description**: The `.env` file containing `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `DATABASE_URL` is tracked in the git repository.
- **Impact**: Credential exposure in version history. Even if removed now, secrets remain in git history.
- **Recommendation**: Remove `.env` from git, add to `.gitignore` (already listed but file was committed before), rotate ALL secrets immediately, consider using `git filter-branch` to purge from history.

---

## 3. High Severity Issues

### CQ-04: No Global Express Error Handler

- **File**: `server.ts`
- **Severity**: High
- **Description**: Express has no error-handling middleware (`app.use((err, req, res, next) => {...})`). Unhandled async errors in route handlers could crash the Node.js process.
- **Impact**: Server crash on unexpected errors; no consistent error response format.
- **Recommendation**: Add a global error handler at the end of the middleware chain.

### CQ-05: Bulk Inserts Without Transactions

- **File**: `server.ts` (lines 700-718, 791-796)
- **Severity**: High
- **Description**: Bulk upload endpoints iterate over entries and insert one row at a time without wrapping in a database transaction.
- **Code**:
  ```typescript
  for (const { t, d, l, c } of entries) {
    // ... validation ...
    await pgPool.query("INSERT INTO uploaded_terms ...", [...]);
    imported++;
  }
  ```
- **Impact**: If the server crashes or an error occurs mid-loop, partial data is committed — no way to rollback.
- **Recommendation**: Use `BEGIN`/`COMMIT`/`ROLLBACK` transaction blocks, or use a single multi-value INSERT statement.

### CQ-06: Client-Side AI Calls

- **File**: `src/App.tsx` (lines 967-1044, 1046-1126, 1237-1249, 1252-1368)
- **Severity**: High
- **Description**: All Gemini API calls (TTS generation, STT via Live API, quiz explanations, answer comparison) are made directly from the browser.
- **Impact**: Exposes API key (see CQ-02), bypasses server-side rate limiting, no centralized error handling, no usage monitoring.
- **Recommendation**: Create server-side proxy endpoints for all Gemini interactions.

### CQ-07: Missing `credentials: 'include'` on Some Fetch Calls

- **File**: `src/App.tsx` (lines 1016-1020, 1099-1103)
- **Severity**: High
- **Description**: TTS cache POST calls omit `credentials: 'include'`, which means session cookies are not sent. This may cause authentication failures.
- **Code**:
  ```typescript
  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Missing: credentials: 'include'
    body: JSON.stringify({ term: normalizedText, audio: base64Audio }),
  })
  ```
- **Impact**: TTS caching may silently fail if same-origin cookie behavior doesn't cover the request.
- **Recommendation**: Add `credentials: 'include'` to all fetch calls consistently.

---

## 4. Medium Severity Issues

### CQ-08: Duplicated Utility Functions

- **Files**: `src/App.tsx` (lines 47-63), `src/constants.ts` (lines 13-33)
- **Severity**: Medium
- **Description**: `slug()` and `uniqueId()` functions are copy-pasted between two files.
- **Recommendation**: Extract to a shared utility module.

### CQ-09: TTS Cache Grows Unbounded

- **File**: `server.ts` (tts_cache table)
- **Severity**: Medium
- **Description**: The `tts_cache` table stores BYTEA audio data and has no TTL or size limit. Each entry can be several hundred KB.
- **Impact**: Database size grows unbounded over time, affecting backup size and query performance.
- **Recommendation**: Add a cleanup job (e.g., delete entries older than 30 days) or move to object storage.

### CQ-10: Memory Leak Risk — AudioContext/Live API

- **File**: `src/App.tsx` (lines 1135-1137, 1267-1296)
- **Severity**: Medium
- **Description**: New `AudioContext` instances are created without cleanup. The Gemini Live API session is never explicitly closed.
- **Recommendation**: Reuse a single AudioContext; close Live API sessions in cleanup.

### CQ-11: `useEffect` Dependency Array Issues

- **File**: `src/App.tsx` (lines 1161-1165)
- **Severity**: Medium
- **Description**: The auto-speak effect depends on `isFlipped` but references `speakTerm` and `currentCard` without including them in the dependency array.
- **Impact**: Stale closure bugs — may speak the wrong term.
- **Recommendation**: Use `useCallback` for `speakTerm` and include all dependencies.

### CQ-12: No CSRF Protection

- **File**: `server.ts`
- **Severity**: Medium
- **Description**: No CSRF tokens are used. The application relies solely on `sameSite: lax` cookies.
- **Impact**: POST/PATCH/DELETE endpoints may be vulnerable to CSRF attacks from same-site contexts.
- **Recommendation**: Add CSRF middleware or use double-submit cookie pattern.

### CQ-13: No React Error Boundaries

- **File**: `src/App.tsx`
- **Severity**: Medium
- **Description**: No React Error Boundary components exist. A rendering error in any part of the UI crashes the entire application.
- **Recommendation**: Add Error Boundaries around major sections (flashcard, quiz, interview, admin).

---

## 5. Low Severity Issues

### CQ-14: Hardcoded Port

- **File**: `server.ts` (line 209)
- **Severity**: Low
- **Description**: `const PORT = 3000` is hardcoded. Should use `process.env.PORT || 3000`.

### CQ-15: Deprecated ScriptProcessorNode

- **File**: `src/App.tsx` (line 1269)
- **Severity**: Low
- **Description**: Uses deprecated `createScriptProcessor` for audio processing. Modern replacement is `AudioWorklet`.

### CQ-16: Static termData.ts No Longer Used

- **File**: `src/termData.ts`, `src/constants.ts`
- **Severity**: Low
- **Description**: The static `TERM_ENTRIES` array and `buildFlashcards()` function in constants.ts are no longer used by App.tsx — all terms now come from the database API. This adds ~600 lines of dead code to the client bundle.
- **Recommendation**: Remove from frontend bundle or lazy-load as fallback.

### CQ-17: `is_allowed` Uses INTEGER Instead of BOOLEAN

- **File**: `server.ts` (users table definition)
- **Severity**: Low
- **Description**: `is_allowed` is `INTEGER NOT NULL DEFAULT 0` but semantically represents a boolean. PostgreSQL supports native `BOOLEAN` type.

---

## 6. Code Metrics

| Metric | Value | Assessment |
|--------|-------|-----------|
| Largest file | `src/App.tsx` — 2,419 lines | Far exceeds recommended max (~300 lines per component) |
| Second largest | `server.ts` — 844 lines | Should be split into route modules |
| Total frontend files | 5 (App, GlobalNav, constants, termData, utils) | Severely under-modularized |
| Total backend files | 1 (server.ts) | All logic in one file |
| Test files | 0 | No tests exist |
| Type coverage | Partial (TypeScript but many `any` casts) | Could be stricter |
| Dependencies | 17 production, 10 dev | Reasonable for the feature set |

---

## 7. Positive Observations

Despite the issues above, the codebase demonstrates several good practices:

1. **Parameterized queries** — All SQL uses `$1, $2, ...` placeholders, preventing SQL injection
2. **Rate limiting** — Auth and admin endpoints are rate-limited
3. **Audit logging** — Admin actions are tracked with actor, action, target, and timestamp
4. **Input validation** — Uploads validate categories against allowlist, levels against valid range
5. **Self-protection** — Admins cannot modify their own accounts
6. **Session security** — httpOnly cookies, secure flag, sameSite lax, 7-day expiry
7. **Accessibility** — ARIA labels on interactive elements, keyboard navigation support
8. **Responsive design** — Mobile-first with bottom navigation, responsive breakpoints
9. **Graceful degradation** — Works without Gemini API key (just disables AI features)
10. **Duplicate detection** — Bulk interview upload checks for existing questions
