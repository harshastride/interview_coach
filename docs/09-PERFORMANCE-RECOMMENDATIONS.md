# Performance Recommendations

## 1. Current Performance Profile

| Area | Current State | Concern Level |
|------|--------------|:---:|
| Frontend bundle size | Monolithic (App.tsx ~2,400 lines + termData ~600 lines) | High |
| Database queries | Simple SELECTs, no complex joins | Low |
| Bulk inserts | Sequential single-row INSERTs in loop | High |
| TTS cache | DB lookup per term, BYTEA stored in PostgreSQL | Medium |
| Progress updates | Fires on every state change (500ms debounce) | Medium |
| API calls to Gemini | Direct from browser, no server-side caching | High |
| Database indexes | Only primary keys and unique constraints | Medium |

---

## 2. Recommendations

### PERF-01: Batch Database Inserts for Bulk Uploads

- **Current**: Sequential `INSERT` in a `for` loop — one query per row
- **Impact**: N database round-trips for N entries; slow for large CSVs
- **Recommendation**: Use multi-row INSERT or PostgreSQL `COPY` command

```typescript
// Instead of:
for (const entry of entries) {
  await pgPool.query("INSERT INTO uploaded_terms ...", [entry.t, entry.d, ...]);
}

// Use multi-row INSERT:
const values = entries.map((e, i) => `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`).join(', ');
const params = entries.flatMap(e => [e.t, e.d, e.l, e.c]);
await pgPool.query(`INSERT INTO uploaded_terms (t, d, l, c) VALUES ${values}`, params);
```

- **Expected Improvement**: 10-50x faster for bulk uploads (single round-trip instead of N)
- **Priority**: High

---

### PERF-02: Server-Side Gemini API Proxy with Caching

- **Current**: All Gemini calls (TTS, quiz explanations, STT) made directly from browser
- **Impact**: No server-side caching, no request deduplication, no rate limit control, API key exposed
- **Recommendation**: Create server-side proxy endpoints:

```
POST /api/ai/tts      — generate TTS audio (check cache first)
POST /api/ai/explain   — generate quiz explanation
POST /api/ai/compare   — compare spoken answer to correct term
```

Benefits:
- Server can cache explanations for common term pairs
- Request deduplication (if two users request same TTS simultaneously, only one Gemini call)
- Server-side rate limiting and quota management
- API key stays server-side

- **Expected Improvement**: 30-70% reduction in Gemini API calls via caching
- **Priority**: High

---

### PERF-03: Frontend Code Splitting

- **Current**: Single monolithic bundle containing all UI code
- **Impact**: Users download admin panel, interview logic, and quiz logic even when only using flashcards
- **Recommendation**: Use React.lazy + Suspense for route-level code splitting:

```typescript
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const InterviewView = React.lazy(() => import('./views/InterviewView'));
const QuizView = React.lazy(() => import('./views/QuizView'));
```

- **Expected Improvement**: 40-60% reduction in initial bundle size
- **Priority**: Medium

---

### PERF-04: Remove Unused Static Term Data from Bundle

- **Current**: `termData.ts` (~600 lines of static flashcard data) is imported by `constants.ts` which is imported by `App.tsx`. However, `App.tsx` now loads all terms from the database API — the static data is unused.
- **Impact**: ~30-50KB of unused JavaScript in the client bundle
- **Recommendation**: Remove the import chain or lazy-load as a fallback
- **Expected Improvement**: ~30-50KB smaller initial bundle
- **Priority**: Medium

---

### PERF-05: Add Database Indexes

- **Current**: Only primary keys and unique constraints; no additional indexes
- **Impact**: Full table scans on filtered queries
- **Recommendation**:

```sql
-- Terms filtered by category and level
CREATE INDEX idx_uploaded_terms_category_level ON uploaded_terms (c, l);

-- Interview filtered by category
CREATE INDEX idx_uploaded_interview_category ON uploaded_interview (category);

-- Interview filtered by role and company
CREATE INDEX idx_uploaded_interview_role_company ON uploaded_interview (role, company);

-- Audit log ordered by date (latest first)
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);

-- Access requests filtered by status
CREATE INDEX idx_access_requests_status ON access_requests (status, requested_at);

-- Progress dashboard ordering
CREATE INDEX idx_user_progress_updated ON user_progress (updated_at DESC);
```

- **Expected Improvement**: 2-10x faster for filtered/sorted queries at scale
- **Priority**: Medium

---

### PERF-06: TTS Cache Cleanup and Optimization

- **Current**: `tts_cache` table stores BYTEA audio data indefinitely, no TTL, no size limits
- **Impact**: Database grows unbounded; backups become large; old/unused audio wastes storage
- **Recommendation**:
  1. Add periodic cleanup: `DELETE FROM tts_cache WHERE created_at < NOW() - INTERVAL '30 days'`
  2. Consider moving audio to object storage (S3, Azure Blob) with CDN
  3. Add size validation on insert (max 1MB per entry)
  4. Add `last_accessed` column to track usage

- **Expected Improvement**: Controlled database growth; faster backups
- **Priority**: Medium

---

### PERF-07: Reduce Progress Update Frequency

- **Current**: Progress snapshot is sent via `POST /api/progress` on every state change with a 500ms debounce
- **Impact**: High frequency of writes; unnecessary database load during active study
- **Recommendation**:
  - Increase debounce to 3-5 seconds
  - Only send when values actually change (compare with last sent values)
  - Use `navigator.sendBeacon` on page unload for final snapshot

```typescript
// Optimized progress update
const lastSentRef = useRef<string>('');
useEffect(() => {
  const payload = JSON.stringify({ module, total_terms, completed_terms, ... });
  if (payload === lastSentRef.current) return; // Skip if unchanged
  const timer = setTimeout(() => {
    fetch('/api/progress', { method: 'POST', ... });
    lastSentRef.current = payload;
  }, 3000); // 3 second debounce
  return () => clearTimeout(timer);
}, [/* deps */]);
```

- **Expected Improvement**: 60-80% reduction in progress API calls
- **Priority**: Low

---

### PERF-08: Optimize React Rendering

- **Current**: All state in a single App component; any state change triggers re-render of entire tree
- **Impact**: Unnecessary re-renders of unrelated UI sections
- **Recommendation**:
  - Split into separate components with their own state
  - Use `React.memo` for pure display components
  - Use `useMemo` / `useCallback` correctly (some are already used)
  - Move admin panel state into its own component (already partially done)

- **Expected Improvement**: Smoother UI, fewer wasted renders
- **Priority**: Medium (blocked by CQ-01 refactoring)

---

### PERF-09: Lazy-Load jsPDF

- **Current**: `jsPDF` is dynamically imported only when "Download PDF" is clicked (good)
- **Status**: Already optimized — using dynamic `import('jspdf')`
- **Priority**: None needed

---

### PERF-10: Connection Pool Tuning

- **Current**: Default `pg.Pool` settings (max 10 connections)
- **Impact**: May be insufficient under load; may be wasteful for low traffic
- **Recommendation**: Configure pool based on expected concurrency:

```typescript
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Max connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail after 5s if no connection available
});
```

- **Priority**: Low

---

## 3. Summary Table

| # | Recommendation | Effort | Impact | Priority |
|---|---------------|--------|--------|----------|
| PERF-01 | Batch database inserts | Low | High | High |
| PERF-02 | Server-side Gemini proxy with caching | High | High | High |
| PERF-03 | Frontend code splitting | Medium | Medium | Medium |
| PERF-04 | Remove unused static term data | Low | Low | Medium |
| PERF-05 | Add database indexes | Low | Medium | Medium |
| PERF-06 | TTS cache cleanup/optimization | Medium | Medium | Medium |
| PERF-07 | Reduce progress update frequency | Low | Low | Low |
| PERF-08 | Optimize React rendering | High | Medium | Medium |
| PERF-09 | Lazy-load jsPDF | - | - | Already done |
| PERF-10 | Connection pool tuning | Low | Low | Low |

---

## 4. DevOps & Deployment Recommendations

### Current Deployment State

| Aspect | Implementation |
|--------|---------------|
| Containerization | Docker multi-stage build (Node.js 22 Alpine) |
| Orchestration | Docker Compose (postgres, app, nginx) |
| Reverse Proxy | Nginx with SSL (Let's Encrypt) |
| CI/CD | None |
| Monitoring | None (console.log only) |
| Backups | None |
| Health Checks | PostgreSQL only (Docker healthcheck) |

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---------------|----------|--------|
| 1 | **Add CI/CD pipeline** (GitHub Actions) — lint, type-check, build, deploy | High | Medium |
| 2 | **Add health check endpoint** (`GET /health`) returning DB connection status | High | Low |
| 3 | **Implement structured logging** (pino/winston) with JSON output, log levels | High | Medium |
| 4 | **Add database migration tool** (node-pg-migrate) — replace `CREATE TABLE IF NOT EXISTS` | High | Medium |
| 5 | **Set up automated database backups** (pg_dump cron → S3/local) | High | Low |
| 6 | **Add application monitoring** (Sentry for errors, Prometheus for metrics) | Medium | Medium |
| 7 | **Use Docker secrets** or vault for sensitive configuration | Medium | Low |
| 8 | **Add container resource limits** in docker-compose.yml | Low | Low |
| 9 | **Configure log rotation** for container logs | Low | Low |

### Test Coverage Recommendations

| Test Type | Current | Target | Framework |
|-----------|:---:|--------|-----------|
| Unit Tests | 0 | 80% coverage | Vitest |
| Integration Tests | 0 | Critical API paths | Supertest |
| E2E Tests | 0 | Core user journeys | Playwright |
| Security Tests | 0 | OWASP Top 10 | Manual + automated |

Priority test targets:
1. Auth middleware (requireAuth, requireAdmin, requireUploader)
2. Bulk upload validation and transaction handling
3. OAuth callback user creation/update logic
4. Admin user management (role changes, access grants)
5. Progress upsert logic
