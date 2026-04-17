# Refactoring Roadmap

## Overview

This roadmap organizes all recommended improvements into four prioritized phases. Each phase builds on the previous one.

| Phase | Focus | Timeline | Effort |
|-------|-------|----------|--------|
| Phase 1 | Critical Fixes | Week 1-2 | ~20 hours |
| Phase 2 | Architecture Improvements | Week 3-6 | ~60 hours |
| Phase 3 | Performance Improvements | Week 7-8 | ~30 hours |
| Phase 4 | Maintainability Improvements | Week 9-12 | ~50 hours |

---

## Phase 1 — Critical Fixes (Week 1-2)

**Goal**: Fix security vulnerabilities and data integrity risks.

| # | Task | Severity | Effort | Files Affected |
|---|------|----------|--------|----------------|
| 1.1 | **Remove GEMINI_API_KEY from client bundle** | Critical | Medium | `vite.config.ts`, `src/App.tsx`, `server.ts` |
| | Remove `define` in vite.config.ts | | | |
| | Create server-side proxy endpoints: `/api/ai/tts`, `/api/ai/explain`, `/api/ai/compare` | | | |
| | Update App.tsx to call server endpoints instead of Gemini directly | | | |
| 1.2 | **Remove `.env` from git and rotate secrets** | Critical | Low | `.env`, `.gitignore` |
| | `git rm --cached .env` | | | |
| | Rotate: GEMINI_API_KEY, GOOGLE_CLIENT_SECRET, SESSION_SECRET | | | |
| | Verify `.env` is in `.gitignore` | | | |
| 1.3 | **Add global Express error handler** | High | Low | `server.ts` |
| | Add `app.use((err, req, res, next) => {...})` before static serving | | | |
| | Log error details server-side; return generic message to client | | | |
| 1.4 | **Wrap bulk inserts in transactions** | High | Low | `server.ts` |
| | Use `BEGIN`/`COMMIT`/`ROLLBACK` for bulk term and interview uploads | | | |
| 1.5 | **Add CSRF protection** | Medium | Low | `server.ts`, `package.json` |
| | Install `csrf-csrf` or implement double-submit cookie | | | |
| 1.6 | **Fail on missing SESSION_SECRET in production** | High | Low | `server.ts` |
| | `if (!process.env.SESSION_SECRET && NODE_ENV === 'production') throw ...` | | | |
| 1.7 | **Fix missing `credentials: 'include'`** | High | Low | `src/App.tsx` |
| | Add to TTS cache POST calls (lines ~1016, ~1099) | | | |

### Phase 1 Checklist

- [ ] 1.1 — Server-side Gemini proxy created and working
- [ ] 1.2 — `.env` removed from git, secrets rotated
- [ ] 1.3 — Global error handler added
- [ ] 1.4 — Bulk uploads use transactions
- [ ] 1.5 — CSRF protection enabled
- [ ] 1.6 — SESSION_SECRET required in production
- [ ] 1.7 — All fetch calls include credentials

---

## Phase 2 — Architecture Improvements (Week 3-6)

**Goal**: Decompose the monolithic codebase into maintainable modules.

| # | Task | Effort | Files Affected |
|---|------|--------|----------------|
| 2.1 | **Decompose App.tsx into route components** | High | `src/App.tsx` → 8+ new files |
| | Create: `src/views/HomeScreen.tsx` | | |
| | Create: `src/views/FlashcardSetup.tsx` | | |
| | Create: `src/views/FlashcardStudy.tsx` | | |
| | Create: `src/views/QuizSetup.tsx` | | |
| | Create: `src/views/QuizStudy.tsx` | | |
| | Create: `src/views/InterviewSetup.tsx` | | |
| | Create: `src/views/InterviewSession.tsx` | | |
| | Create: `src/views/InterviewComplete.tsx` | | |
| | Create: `src/components/AdminPanel.tsx` (extract from App.tsx) | | |
| | Create: `src/components/AccessDeniedScreen.tsx` (extract) | | |
| | Create: `src/components/LoginScreen.tsx` (extract) | | |
| 2.2 | **Create custom hooks** | Medium | New `src/hooks/` directory |
| | `useAuth.ts` — auth state, login, logout | | |
| | `useTTS.ts` — text-to-speech logic, caching, AudioContext management | | |
| | `useSTT.ts` — speech-to-text via Gemini Live API | | |
| | `useProgress.ts` — progress snapshot logic | | |
| | `useFlashcards.ts` — term filtering, shuffling, scoring | | |
| | `useInterview.ts` — session management, typewriter, phases | | |
| 2.3 | **Extract server routes into modules** | Medium | `server.ts` → 5+ new files |
| | Create: `src/server/routes/auth.ts` | | |
| | Create: `src/server/routes/content.ts` | | |
| | Create: `src/server/routes/tts.ts` | | |
| | Create: `src/server/routes/admin.ts` | | |
| | Create: `src/server/routes/ai.ts` (new Gemini proxy) | | |
| | Create: `src/server/middleware/auth.ts` | | |
| | Create: `src/server/db/init.ts` | | |
| 2.4 | **Add React Router** | Medium | `src/App.tsx`, `src/main.tsx` |
| | Install `react-router-dom` | | |
| | Define routes: `/`, `/flashcards`, `/quiz`, `/interview`, `/admin` | | |
| | Enable code splitting via `React.lazy` | | |
| 2.5 | **Implement database migrations** | Medium | New `migrations/` directory |
| | Install `node-pg-migrate` | | |
| | Convert `CREATE TABLE IF NOT EXISTS` to versioned migrations | | |
| | Add `migrate` script to `package.json` | | |
| 2.6 | **Set up test infrastructure** | Medium | New `tests/` directory |
| | Install Vitest, React Testing Library, Supertest | | |
| | Configure test scripts in `package.json` | | |
| | Write first test: auth middleware unit test | | |

### Phase 2 Target File Structure

```
src/
├── views/
│   ├── HomeScreen.tsx
│   ├── FlashcardSetup.tsx
│   ├── FlashcardStudy.tsx
│   ├── QuizSetup.tsx
│   ├── QuizStudy.tsx
│   ├── InterviewSetup.tsx
│   ├── InterviewSession.tsx
│   └── InterviewComplete.tsx
├── components/
│   ├── GlobalNav.tsx (existing)
│   ├── AdminPanel.tsx (extracted)
│   ├── AccessDeniedScreen.tsx (extracted)
│   ├── LoginScreen.tsx (extracted)
│   ├── FlashCard.tsx
│   └── QuizCard.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useTTS.ts
│   ├── useSTT.ts
│   ├── useProgress.ts
│   ├── useFlashcards.ts
│   └── useInterview.ts
├── server/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── content.ts
│   │   ├── tts.ts
│   │   ├── admin.ts
│   │   └── ai.ts
│   ├── middleware/
│   │   └── auth.ts
│   └── db/
│       └── init.ts
├── lib/
│   └── utils.ts (existing)
├── constants.ts (existing)
├── index.css (existing)
├── main.tsx (updated with router)
└── App.tsx (slim shell with router)
```

### Phase 2 Checklist

- [ ] 2.1 — App.tsx decomposed into view components
- [ ] 2.2 — Custom hooks extracted
- [ ] 2.3 — Server routes modularized
- [ ] 2.4 — React Router integrated
- [ ] 2.5 — Database migration system working
- [ ] 2.6 — Test infrastructure in place with at least 5 tests

---

## Phase 3 — Performance Improvements (Week 7-8)

**Goal**: Optimize database operations, frontend bundle, and API usage.

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 3.1 | **Optimize bulk inserts** | Low | High |
| | Use multi-row INSERT statements instead of loops | | |
| 3.2 | **Add server-side caching for Gemini responses** | Medium | High |
| | Cache quiz explanations for common term pairs (LRU, 1 hour TTL) | | |
| | Deduplicate concurrent TTS requests for same term | | |
| 3.3 | **Code splitting with React.lazy** | Medium | Medium |
| | Lazy-load AdminPanel, InterviewView, QuizView | | |
| 3.4 | **Remove unused static termData from bundle** | Low | Low |
| | Delete import chain or make it a server-side fallback | | |
| 3.5 | **Add database indexes** | Low | Medium |
| | Add indexes on frequently filtered/sorted columns | | |
| 3.6 | **TTS cache TTL and cleanup** | Low | Medium |
| | Add cleanup job for entries older than 30 days | | |
| 3.7 | **Reduce progress update frequency** | Low | Low |
| | Increase debounce to 3 seconds; skip if unchanged | | |

### Phase 3 Checklist

- [ ] 3.1 — Bulk inserts use multi-row INSERT
- [ ] 3.2 — Server-side Gemini caching operational
- [ ] 3.3 — Code splitting reduces initial bundle by 40%+
- [ ] 3.4 — Unused static data removed from bundle
- [ ] 3.5 — Database indexes added
- [ ] 3.6 — TTS cache cleanup scheduled
- [ ] 3.7 — Progress updates optimized

---

## Phase 4 — Maintainability Improvements (Week 9-12)

**Goal**: Establish CI/CD, monitoring, comprehensive testing, and operational excellence.

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 4.1 | **CI/CD pipeline** | Medium | High |
| | GitHub Actions: lint → type-check → test → build → deploy | | |
| | Automated deployment to Akamai on main branch push | | |
| 4.2 | **Structured logging** | Medium | Medium |
| | Install pino; add request correlation IDs | | |
| | Configure log levels via NODE_ENV | | |
| | Add request/response logging middleware | | |
| 4.3 | **Comprehensive test suite** | High | High |
| | Unit tests for: auth middleware, input validation, slug generation, CSV parsing | | |
| | Integration tests for: all API endpoints, OAuth flow, RBAC | | |
| | E2E tests for: login, flashcard study, quiz, interview practice | | |
| | Target: 80% line coverage | | |
| 4.4 | **Monitoring and alerting** | Medium | Medium |
| | Health check endpoint (`GET /health`) | | |
| | Error tracking (Sentry or equivalent) | | |
| | Basic metrics (request count, response time, error rate) | | |
| 4.5 | **Database backups** | Low | High |
| | Automated pg_dump cron (daily) | | |
| | Backup to external storage (S3 or similar) | | |
| | Test restore procedure | | |
| 4.6 | **Replace deprecated ScriptProcessorNode** | Low | Low |
| | Migrate to AudioWorklet API for audio processing | | |
| 4.7 | **Add Content-Security-Policy** | Low | Medium |
| | Configure CSP headers in Nginx | | |
| 4.8 | **Add React Error Boundaries** | Low | Low |
| | Wrap major view components in error boundaries | | |

### Phase 4 Checklist

- [ ] 4.1 — CI/CD pipeline running on every push
- [ ] 4.2 — Structured logging deployed
- [ ] 4.3 — Test suite at 80% coverage
- [ ] 4.4 — Health check and error tracking live
- [ ] 4.5 — Automated daily backups verified
- [ ] 4.6 — AudioWorklet migration complete
- [ ] 4.7 — CSP headers configured
- [ ] 4.8 — Error boundaries in place

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:---:|:---:|-----------|
| API key abuse before Phase 1 | High | High | Prioritize 1.1 immediately |
| Data loss during refactoring | Low | High | Backup database before Phase 2 |
| Regression bugs during decomposition | Medium | Medium | Phase 2.6 sets up tests before major refactoring |
| Deployment downtime during migration | Low | Medium | Use blue-green deployment or maintenance window |
| Gemini API quota exhaustion | Medium | Medium | Phase 3.2 adds caching to reduce API calls |

---

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 4 Target |
|--------|---------|:---:|:---:|
| Security vulnerabilities (Critical) | 2 | 0 | 0 |
| Security vulnerabilities (Total) | 12 | 4 | 0 |
| Largest component (lines) | 2,419 | 2,419 | < 300 |
| Total source files | ~15 | ~15 | ~35 |
| Test coverage | 0% | 0% | 80% |
| CI/CD pipeline | None | None | Full |
| Mean Time to Deploy | Manual | Manual | < 10 min |
| Monitoring coverage | None | None | Full |
