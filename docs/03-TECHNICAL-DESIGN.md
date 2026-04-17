# Technical Design Document (TDD)

## 1. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend Framework | React | 19.x | UI rendering |
| Language | TypeScript | 5.8.x | Type safety |
| Build Tool | Vite | 6.2.x | Dev server, HMR, production bundling |
| Styling | Tailwind CSS | 4.1.x | Utility-first CSS framework |
| Animation | Motion (Framer Motion) | 12.x | Page transitions, card flip animations |
| Icons | Lucide React | 0.546.x | SVG icon library |
| AI/ML | Google Gemini (@google/genai) | 1.29.x | TTS, STT, quiz explanations |
| Backend | Express.js | 4.21.x | HTTP server, API routing |
| Database | PostgreSQL | 16 (Alpine) | Persistent storage |
| Session Store | connect-pg-simple | 10.x | PostgreSQL-backed sessions |
| Authentication | Passport.js + Google OAuth 2.0 | 0.7.x | User authentication |
| Rate Limiting | express-rate-limit | 8.2.x | Request throttling |
| PDF Generation | jsPDF | 4.2.x | Client-side PDF export |
| Markdown | react-markdown | 10.1.x | AI explanation rendering |
| CSS Utilities | clsx + tailwind-merge | 2.x / 3.x | Class name composition |
| Reverse Proxy | Nginx | Alpine | SSL termination, proxying |
| SSL | Let's Encrypt (Certbot) | Latest | TLS certificates |
| Container | Docker + Docker Compose | - | Containerization |
| Runtime | Node.js | 22 (Alpine) | Server runtime |
| TS Runner | tsx | 4.21.x | TypeScript execution without precompilation |

## 2. Application Architecture

### Architecture Pattern

**Monolithic full-stack application** with a single Express.js server serving both API endpoints and the React SPA.

```
┌─────────────────────────────────────────────────────┐
│                   Nginx (Reverse Proxy)               │
│                   SSL Termination                     │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP :3000
┌─────────────────────▼───────────────────────────────┐
│                 Express.js Server                     │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Auth Routes  │  │ API Routes │  │ Admin Routes │  │
│  └──────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│         │               │                │           │
│  ┌──────▼───────────────▼────────────────▼───────┐  │
│  │            PostgreSQL Pool (pg)                │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                           │
│  ┌───────────────────────▼───────────────────────┐  │
│  │        Static Files (dist/) OR Vite Dev       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │    PostgreSQL 16      │
              │    (Docker volume)    │
              └───────────────────────┘
```

### Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Frontend serving | Vite dev server middleware (HMR) | Static files from `dist/` |
| Server start | `tsx server.ts` (ts execution) | `npx tsx server.ts` in Docker |
| Database | Local PostgreSQL (port 5433) | Docker PostgreSQL (internal network) |
| SSL | None (HTTP) | Nginx + Let's Encrypt |
| API key | `.env` or `.env.local` | Docker environment variables |

## 3. Folder Structure

```
azure-data-engineering-flashcards/
├── server.ts                          # [844 lines] Express backend — ALL API routes, auth, DB init
├── src/
│   ├── App.tsx                        # [2419 lines] Main React component — ENTIRE UI
│   ├── main.tsx                       # [11 lines] React DOM entry point
│   ├── constants.ts                   # [119 lines] Types, builders, category/level constants
│   ├── termData.ts                    # [~600 lines] Static flashcard data (term/def/level/category)
│   ├── index.css                      # [50 lines] Global CSS, Tailwind imports, CSS variables
│   ├── lib/
│   │   └── utils.ts                   # [7 lines] cn() utility (clsx + tailwind-merge)
│   └── components/
│       └── GlobalNav.tsx              # [118 lines] Navigation: TopBar, BottomNav, AppLayout
├── public/
│   └── stint-logo.svg                 # Brand logo SVG
├── nginx/                             # Nginx reverse proxy configuration
│   ├── Dockerfile                     # Nginx container build
│   ├── nginx.conf                     # Main nginx configuration
│   ├── entrypoint.sh                  # Smart SSL detection script
│   ├── options-ssl-nginx.conf         # TLS 1.2/1.3 settings
│   └── conf.d/
│       ├── default.conf.template      # HTTPS server block template
│       ├── default-http-only.conf.template  # HTTP-only fallback
│       └── default.conf               # Generated active config
├── scripts/
│   ├── certbot-init.sh                # Initial SSL certificate provisioning
│   └── certbot-renew.sh              # Certificate renewal script
├── docs/                              # Documentation
├── audio_cache/                       # Legacy local audio cache directory
├── Dockerfile                         # Multi-stage app container build
├── docker-compose.yml                 # Service orchestration (postgres, app, nginx, certbot)
├── docker-compose.override.example-no-nginx.yml  # Optional override
├── package.json                       # Dependencies and npm scripts
├── package-lock.json                  # Lockfile
├── vite.config.ts                     # Vite build configuration
├── tsconfig.json                      # TypeScript configuration
├── index.html                         # SPA HTML entry point
├── metadata.json                      # App metadata (name, permissions)
├── .env.example                       # Environment variable template
├── .env                               # Active environment variables
├── .gitignore                         # Git exclusions
└── .dockerignore                      # Docker build exclusions
```

## 4. Service Responsibilities

### Frontend Components

| Component | File | Lines | Responsibility |
|-----------|------|-------|---------------|
| App | `src/App.tsx` | 2419 | Auth gates, home screen, flashcard mode, quiz mode, interview mode, admin panel, TTS/STT, progress tracking, PDF export |
| GlobalNav | `src/components/GlobalNav.tsx` | 118 | Reusable navigation layout (top bar with back/home, bottom tab nav) |
| Constants | `src/constants.ts` | 119 | Flashcard type definitions, ID builder, category/level constants, interview types |
| TermData | `src/termData.ts` | ~600 | Static array of Azure DE flashcard terms (used as fallback) |
| Utils | `src/lib/utils.ts` | 7 | `cn()` class name merge utility |

### Backend (server.ts)

| Section | Lines | Responsibility |
|---------|-------|---------------|
| Database init | 25-116 | CREATE TABLE IF NOT EXISTS for 8 tables |
| Types & middleware | 118-198 | DbUser interface, requireAuth/Admin/Uploader middleware, audit helper |
| Auth routes | 334-380 | Google OAuth login, callback, /api/auth/me, logout |
| Progress API | 382-434 | POST /api/progress — upsert user progress |
| Content API | 436-446 | GET terms and interview content |
| TTS API | 448-485 | GET/POST TTS cache (PostgreSQL BYTEA) |
| Access request | 487-502 | POST access request for non-allowed users |
| Admin: users | 504-547 | CRUD users (list, patch role/access, delete) |
| Admin: allowlist | 549-581 | CRUD email allowlist |
| Admin: requests | 583-631 | Approve/reject access requests |
| Admin: audit | 633-641 | Read audit log (last 100) |
| Admin: progress | 643-676 | Read learner progress dashboard |
| Admin: terms | 678-737 | Upload single/bulk terms, list, delete |
| Admin: interview | 739-824 | Upload single/bulk interview Q&A, list, delete |
| Static serving | 826-837 | Vite middleware (dev) or static file serving (prod) |

## 5. Authentication & Authorization

### Authentication Flow

```
Browser → GET /auth/google
  → Redirect to Google consent screen
    → Google callback → POST /auth/google/callback
      → Passport GoogleStrategy:
        1. Extract google_id, email, name, avatar from profile
        2. Check if user exists in DB (by google_id)
        3. If new user:
           - Check email_allowlist
           - First user ever → role=admin, is_allowed=1
           - On allowlist → role=viewer, is_allowed=1
           - Not on allowlist → role=viewer, is_allowed=0
        4. If existing user:
           - Re-check allowlist, update name/avatar/last_login
        5. Serialize user.id into session
      → Redirect to / (allowed) or /access-denied (denied)
```

### Session Management

- **Store**: PostgreSQL via `connect-pg-simple` (auto-creates `session` table)
- **Cookie**: `maxAge: 7 days`, `httpOnly: true`, `secure: auto`, `sameSite: lax`
- **Serialization**: Only `user.id` stored in session; full user loaded on each request via `deserializeUser`

### Role-Based Access Control

| Role | Study Content | Upload/Delete Content | Progress Dashboard | User Management | Audit Log |
|------|:---:|:---:|:---:|:---:|:---:|
| viewer | Yes | No | No | No | No |
| manager | Yes | Yes | Yes | No | No |
| admin | Yes | Yes | Yes | Yes | Yes |

### Middleware Chain

```typescript
requireAuth    → isAuthenticated() && is_allowed
requireAdmin   → isAuthenticated() && role === 'admin'
requireUploader → isAuthenticated() && role in ['admin', 'manager']
```

## 6. Configuration Management

### Environment Variables

| Variable | Required | Default | Description |
|----------|:---:|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key for TTS, STT, quiz explanations |
| `GOOGLE_CLIENT_ID` | Yes | - | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | - | Google OAuth 2.0 client secret |
| `SESSION_SECRET` | Yes | `"local-dev-session-secret"` | Express session encryption key |
| `APP_URL` | Yes | `"http://localhost:3000"` | Base URL for OAuth callback |
| `DATABASE_URL` | No | `"postgresql://flashcards:flashcards@localhost:5432/flashcards"` | PostgreSQL connection string |
| `DOMAIN` | No | `"localhost"` | Domain for Nginx/Certbot |
| `LETSENCRYPT_EMAIL` | No | - | Email for Let's Encrypt notifications |
| `NGINX_HTTP_PORT` | No | `80` | HTTP port |
| `NGINX_HTTPS_PORT` | No | `443` | HTTPS port |
| `NODE_ENV` | No | - | `production` in Docker |

### Build-time Configuration

The `GEMINI_API_KEY` is injected at build time via Vite's `define` option in `vite.config.ts`:

```typescript
define: {
  'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? ''),
}
```

> **WARNING**: This exposes the API key in the client-side JavaScript bundle.

## 7. Error Handling Strategy

### Server-Side

- **Pattern**: try/catch blocks in individual route handlers
- **Logging**: `console.error()` for caught exceptions
- **No global error handler**: Missing Express error-handling middleware
- **Database errors**: Caught per-query; connection failure on startup exits process

### Client-Side

- **Pattern**: `.catch()` on fetch calls with fallback to empty arrays/defaults
- **TTS errors**: Exponential backoff retry (up to 3 retries, 2/4/8 seconds) for 429/RESOURCE_EXHAUSTED
- **Auth errors**: Redirect to unauthenticated state
- **Gemini API errors**: Fallback message shown to user

### Known Gaps

1. No centralized error handling middleware on Express
2. No structured error codes or error response schema
3. Unhandled promise rejections could crash the server
4. No error boundary in React for component-level failures

## 8. Logging Strategy

### Current State

- **Server**: `console.log()`, `console.error()`, `console.warn()` only
- **Client**: `console.error()`, `console.warn()` for debug
- **No structured logging**: No log levels, timestamps, correlation IDs, or log aggregation
- **Audit log**: Admin actions logged to `audit_log` table (not application logs)

### Recommended Improvement

Adopt `pino` or `winston` with structured JSON logging, request correlation IDs, and log level configuration via `NODE_ENV`.
