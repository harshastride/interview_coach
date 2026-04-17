# Graph Report - .  (2026-04-12)

## Corpus Check
- 70 files · ~53,399 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 245 nodes · 250 edges · 61 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Platform & Architecture|Core Platform & Architecture]]
- [[_COMMUNITY_Admin Panel Operations|Admin Panel Operations]]
- [[_COMMUNITY_API & Database Schema|API & Database Schema]]
- [[_COMMUNITY_Code Quality & Refactoring|Code Quality & Refactoring]]
- [[_COMMUNITY_Monolith Decomposition|Monolith Decomposition]]
- [[_COMMUNITY_Flashcard Study Session|Flashcard Study Session]]
- [[_COMMUNITY_Security & API Key Exposure|Security & API Key Exposure]]
- [[_COMMUNITY_Auth & Role Management|Auth & Role Management]]
- [[_COMMUNITY_API Client Library|API Client Library]]
- [[_COMMUNITY_UIUX Redesign & Branding|UI/UX Redesign & Branding]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Study API Hooks|Study API Hooks]]
- [[_COMMUNITY_Shared View Utilities|Shared View Utilities]]
- [[_COMMUNITY_Auth Middleware Tests|Auth Middleware Tests]]
- [[_COMMUNITY_AITTS Route Handler|AI/TTS Route Handler]]
- [[_COMMUNITY_Global Navigation|Global Navigation]]
- [[_COMMUNITY_Slug Utilities|Slug Utilities]]
- [[_COMMUNITY_Flashcard Setup|Flashcard Setup]]
- [[_COMMUNITY_Interview Session|Interview Session]]
- [[_COMMUNITY_Express Server|Express Server]]
- [[_COMMUNITY_App Root Component|App Root Component]]
- [[_COMMUNITY_Database Init|Database Init]]
- [[_COMMUNITY_Misc Route Utils|Misc Route Utils]]
- [[_COMMUNITY_Interview Hook|Interview Hook]]
- [[_COMMUNITY_Flashcards Hook|Flashcards Hook]]
- [[_COMMUNITY_TTS Hook|TTS Hook]]
- [[_COMMUNITY_Auth Hook|Auth Hook]]
- [[_COMMUNITY_Dark Mode Hook|Dark Mode Hook]]
- [[_COMMUNITY_Progress Hook|Progress Hook]]
- [[_COMMUNITY_STT Hook|STT Hook]]
- [[_COMMUNITY_CSV Parser|CSV Parser]]
- [[_COMMUNITY_CSS Utilities|CSS Utilities]]
- [[_COMMUNITY_Access Denied View|Access Denied View]]
- [[_COMMUNITY_Interview Setup|Interview Setup]]
- [[_COMMUNITY_Home Screen|Home Screen]]
- [[_COMMUNITY_Login Screen|Login Screen]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]
- [[_COMMUNITY_Test Setup|Test Setup]]
- [[_COMMUNITY_Utils Tests|Utils Tests]]
- [[_COMMUNITY_Slug Tests|Slug Tests]]
- [[_COMMUNITY_CSV Tests|CSV Tests]]
- [[_COMMUNITY_Constants Tests|Constants Tests]]
- [[_COMMUNITY_App Entry Point|App Entry Point]]
- [[_COMMUNITY_Term Data|Term Data]]
- [[_COMMUNITY_Constants|Constants]]
- [[_COMMUNITY_DB Connection Pool|DB Connection Pool]]
- [[_COMMUNITY_Study Routes|Study Routes]]
- [[_COMMUNITY_Admin Routes|Admin Routes]]
- [[_COMMUNITY_Content Routes|Content Routes]]
- [[_COMMUNITY_TTS Routes|TTS Routes]]
- [[_COMMUNITY_Auth Routes|Auth Routes]]
- [[_COMMUNITY_Environment Config|Environment Config]]
- [[_COMMUNITY_Error Handling|Error Handling]]
- [[_COMMUNITY_Tailwind CSS|Tailwind CSS]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Code Quality Audit|Code Quality Audit]]
- [[_COMMUNITY_Duplicated Utils Issue|Duplicated Utils Issue]]
- [[_COMMUNITY_Security Audit|Security Audit]]
- [[_COMMUNITY_Weak Session Secret|Weak Session Secret]]
- [[_COMMUNITY_Performance Docs|Performance Docs]]

## God Nodes (most connected - your core abstractions)
1. `Stint Academy Interview Coach` - 14 edges
2. `Google Gemini API (TTS/STT/LLM)` - 9 edges
3. `Database Documentation` - 9 edges
4. `Phase 2: Architecture Improvements (Week 3-6, ~60h)` - 8 edges
5. `PostgreSQL 16 Database` - 7 edges
6. `Nginx Reverse Proxy` - 7 edges
7. `Role-Based Access Control (RBAC)` - 7 edges
8. `users Table Schema` - 7 edges
9. `Phase 1: Critical Fixes (Week 1-2, ~20h)` - 7 edges
10. `App.tsx (2419-line God Component)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Good Practice: Parameterized SQL Queries (SQL injection prevention)` --semantically_similar_to--> `SEC-01: Gemini API Key in Client Bundle (OWASP A01)`  [AMBIGUOUS] [semantically similar]
  docs/07-CODE-QUALITY-AUDIT.md → docs/08-SECURITY-AUDIT.md
- `Stint Logo SVG (Blue geometric facets wordmark)` --rationale_for--> `Brand Color Palette (Logo-Derived Blues: #4474B9, #4E8ACE, #75C4F3)`  [EXTRACTED]
  public/stint-logo.svg → docs/REDESIGN-PLAN.md
- `CQ-01: God Component App.tsx (2419 lines)` --semantically_similar_to--> `Critical: Monolithic App.tsx (2419 lines)`  [INFERRED] [semantically similar]
  docs/07-CODE-QUALITY-AUDIT.md → docs/01-EXECUTIVE-SUMMARY.md
- `Interview Coach App (README)` --references--> `Stint Academy Interview Coach`  [EXTRACTED]
  README.md → docs/01-EXECUTIVE-SUMMARY.md
- `Interview Coach App (README)` --references--> `Google Gemini API (TTS/STT/LLM)`  [EXTRACTED]
  README.md → docs/01-EXECUTIVE-SUMMARY.md

## Hyperedges (group relationships)
- **API Key Exposure: Client Bundle + Vite Define + Server Proxy Recommendation** — cq_cq02_api_key_bundle, tdd_vite_key_exposure, sec_sec01_api_key, sec_recommended_server_proxy, perf_perf02_server_gemini_proxy [EXTRACTED 0.95]
- **Monolithic Code Problem → Audit Issues → Refactoring Plan** — cq_cq01_god_component, tdd_app_tsx, tdd_server_ts, refactor_decompose_app_tsx, refactor_server_modules, perf_perf08_react_rendering [EXTRACTED 0.90]
- **TTS Audio System: Gemini API → tts_cache Table → API Endpoints → Security/Performance Concerns** — exec_gemini_api, db_tts_cache_table, api_tts_endpoints, cq_cq09_tts_unbounded, sec_sec08_unrestricted_tts_write, perf_perf06_tts_cache_cleanup [EXTRACTED 0.90]

## Communities

### Community 0 - "Core Platform & Architecture"
Cohesion: 0.14
Nodes (26): Certbot Let's Encrypt SSL Certificate Provisioning, Repeatable Deploy Steps (git pull + docker compose up), Akamai Deployment Runbook, Data Flow Diagram (Auth → Content → TTS → Progress), Deployment Architecture (Akamai Ubuntu + Docker), Architecture Diagrams Document, Frontend State Machine (Loading→Home→Flashcards/Quiz/Interview), Interview Practice Sequence Diagram (+18 more)

### Community 1 - "Admin Panel Operations"
Cohesion: 0.12
Nodes (10): bulkDeleteInterview(), bulkDeleteTerms(), cancelTtsJob(), deleteTtsCache(), fetchInterview(), fetchTerms(), fetchTtsJob(), fetchTtsStats() (+2 more)

### Community 2 - "API & Database Schema"
Cohesion: 0.14
Nodes (21): Access Request Endpoint (POST /api/access-request), Admin Endpoints (/api/admin/*), Content Endpoints (/api/content/terms, /api/content/interview), API Documentation (22 Endpoints), Progress Endpoint (POST /api/progress), TTS Cache Endpoints (GET/POST /api/tts), Progress Tracking Feature, CQ-09: TTS Cache Grows Unbounded (+13 more)

### Community 3 - "Code Quality & Refactoring"
Cohesion: 0.13
Nodes (16): CQ-04: No Global Express Error Handler, CQ-05: Bulk Inserts Without Transactions, CQ-07: Missing credentials: include on TTS Fetch Calls, CQ-12: No CSRF Protection, CQ-16: Static termData.ts Dead Code (~600 lines), Missing Database Indexes Recommendation, No CI/CD Pipeline, PERF-01: Batch Database Inserts for Bulk Uploads (+8 more)

### Community 4 - "Monolith Decomposition"
Cohesion: 0.14
Nodes (16): 24 Azure DE Content Categories, PDF Export Feature, CQ-01: God Component App.tsx (2419 lines), Zero Test Coverage (No test files, no CI/CD), No Migration Tool (CREATE TABLE IF NOT EXISTS on startup), PERF-08: Optimize React Rendering (split App.tsx), Extract Custom Hooks (useAuth, useTTS, useSTT, useProgress, etc.), Implement Database Migrations (node-pg-migrate) (+8 more)

### Community 5 - "Flashcard Study Session"
Cohesion: 0.19
Nodes (4): handleQuizSelect(), handler(), handleTypedSubmit(), stopListening()

### Community 6 - "Security & API Key Exposure"
Cohesion: 0.15
Nodes (13): CQ-02: API Key Exposed in Client Bundle, CQ-03: Secrets (.env) Committed to Git, CQ-06: Client-Side Gemini AI Calls, Critical: GEMINI_API_KEY Exposed in Client Bundle, Critical: Monolithic App.tsx (2419 lines), Critical: Secrets Committed to Git, Executive Summary, PERF-02: Server-Side Gemini API Proxy with Caching (+5 more)

### Community 7 - "Auth & Role Management"
Cohesion: 0.18
Nodes (12): Authentication Endpoints (/auth/google, /api/auth/me, logout), Admin User Type, CSV Bulk Content Upload, Email Allowlist Access Control, Learner User Type, Manager User Type, Role-Based Access Control (RBAC), Admin Panel Feature (+4 more)

### Community 8 - "API Client Library"
Cohesion: 0.29
Nodes (1): ApiError

### Community 9 - "UI/UX Redesign & Branding"
Cohesion: 0.33
Nodes (7): Stint Logo SVG (Blue geometric facets wordmark), Brand Color Palette (Logo-Derived Blues: #4474B9, #4E8ACE, #75C4F3), Home Navigation Fix (One-Tap Home from Every Screen), Global Navigation Spec (Desktop Top Bar + Mobile Bottom Nav), UX/UI Redesign Plan Document, UX Audit (10 Usability Issues), GlobalNav.tsx Component

### Community 10 - "Auth Middleware"
Cohesion: 0.33
Nodes (0): 

### Community 11 - "Study API Hooks"
Cohesion: 0.4
Nodes (0): 

### Community 12 - "Shared View Utilities"
Cohesion: 0.67
Nodes (2): slug(), uniqueId()

### Community 13 - "Auth Middleware Tests"
Cohesion: 0.67
Nodes (0): 

### Community 14 - "AI/TTS Route Handler"
Cohesion: 0.67
Nodes (0): 

### Community 15 - "Global Navigation"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Slug Utilities"
Cohesion: 1.0
Nodes (2): slug(), uniqueId()

### Community 17 - "Flashcard Setup"
Cohesion: 0.67
Nodes (0): 

### Community 18 - "Interview Session"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Express Server"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "App Root Component"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Database Init"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Misc Route Utils"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Interview Hook"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Flashcards Hook"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "TTS Hook"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Auth Hook"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Dark Mode Hook"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Progress Hook"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "STT Hook"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "CSV Parser"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "CSS Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Access Denied View"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Interview Setup"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Home Screen"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Login Screen"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Vitest Config"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Test Setup"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Utils Tests"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Slug Tests"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "CSV Tests"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Constants Tests"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "App Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Term Data"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Constants"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "DB Connection Pool"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Study Routes"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Admin Routes"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Content Routes"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "TTS Routes"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Auth Routes"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Environment Config"
Cohesion: 1.0
Nodes (1): Environment Variables Configuration

### Community 53 - "Error Handling"
Cohesion: 1.0
Nodes (1): Error Handling Strategy (try/catch + no global handler)

### Community 54 - "Tailwind CSS"
Cohesion: 1.0
Nodes (1): Tailwind CSS v4

### Community 55 - "TypeScript Config"
Cohesion: 1.0
Nodes (1): TypeScript 5.8

### Community 56 - "Code Quality Audit"
Cohesion: 1.0
Nodes (1): Code Quality Audit Report

### Community 57 - "Duplicated Utils Issue"
Cohesion: 1.0
Nodes (1): CQ-08: Duplicated slug/uniqueId Utility Functions

### Community 58 - "Security Audit"
Cohesion: 1.0
Nodes (1): Security Audit Report (12 Vulnerabilities)

### Community 59 - "Weak Session Secret"
Cohesion: 1.0
Nodes (1): SEC-04: Weak Default Session Secret (OWASP A02)

### Community 60 - "Performance Docs"
Cohesion: 1.0
Nodes (1): Performance Recommendations Document

## Ambiguous Edges - Review These
- `Good Practice: Parameterized SQL Queries (SQL injection prevention)` → `SEC-01: Gemini API Key in Client Bundle (OWASP A01)`  [AMBIGUOUS]
  docs/07-CODE-QUALITY-AUDIT.md · relation: semantically_similar_to

## Knowledge Gaps
- **41 isolated node(s):** `Azure DE Interview Preparation Problem`, `Manager User Type`, `CSV Bulk Content Upload`, `PDF Export Feature`, `Progress Tracking Feature` (+36 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Express Server`** (2 nodes): `startServer()`, `server.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Root Component`** (2 nodes): `LoadingSpinner()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Init`** (2 nodes): `initPg()`, `init.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc Route Utils`** (2 nodes): `asNonNegInt()`, `misc.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Interview Hook`** (2 nodes): `useInterview.ts`, `useInterview()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Flashcards Hook`** (2 nodes): `useFlashcards.ts`, `useFlashcards()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TTS Hook`** (2 nodes): `useTTS.ts`, `useTTS()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Hook`** (2 nodes): `useAuth.ts`, `useAuth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dark Mode Hook`** (2 nodes): `useDarkMode.ts`, `useDarkMode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Progress Hook`** (2 nodes): `useProgress.ts`, `useProgress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `STT Hook`** (2 nodes): `useSTT.ts`, `useSTT()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSV Parser`** (2 nodes): `parseCSV()`, `csv.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSS Utilities`** (2 nodes): `utils.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Access Denied View`** (2 nodes): `handleRequest()`, `AccessDeniedScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Interview Setup`** (2 nodes): `startInterview()`, `InterviewSetup.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Home Screen`** (2 nodes): `handleSearch()`, `HomeScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Screen`** (2 nodes): `LoginScreen()`, `LoginScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Setup`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utils Tests`** (1 nodes): `utils.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Slug Tests`** (1 nodes): `slug.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSV Tests`** (1 nodes): `csv.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Constants Tests`** (1 nodes): `constants.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Entry Point`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Term Data`** (1 nodes): `termData.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Constants`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB Connection Pool`** (1 nodes): `pool.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Study Routes`** (1 nodes): `study.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Routes`** (1 nodes): `admin.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Content Routes`** (1 nodes): `content.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TTS Routes`** (1 nodes): `tts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Routes`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Environment Config`** (1 nodes): `Environment Variables Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Error Handling`** (1 nodes): `Error Handling Strategy (try/catch + no global handler)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind CSS`** (1 nodes): `Tailwind CSS v4`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TypeScript Config`** (1 nodes): `TypeScript 5.8`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Code Quality Audit`** (1 nodes): `Code Quality Audit Report`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Duplicated Utils Issue`** (1 nodes): `CQ-08: Duplicated slug/uniqueId Utility Functions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Security Audit`** (1 nodes): `Security Audit Report (12 Vulnerabilities)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Weak Session Secret`** (1 nodes): `SEC-04: Weak Default Session Secret (OWASP A02)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Performance Docs`** (1 nodes): `Performance Recommendations Document`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Good Practice: Parameterized SQL Queries (SQL injection prevention)` and `SEC-01: Gemini API Key in Client Bundle (OWASP A01)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `server.ts (844-line Backend)` connect `Core Platform & Architecture` to `Monolith Decomposition`, `Auth & Role Management`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `Phase 2: Architecture Improvements (Week 3-6, ~60h)` connect `Monolith Decomposition` to `Code Quality & Refactoring`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `Stint Academy Interview Coach` connect `Core Platform & Architecture` to `Security & API Key Exposure`, `Auth & Role Management`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `Azure DE Interview Preparation Problem`, `Manager User Type`, `CSV Bulk Content Upload` to the rest of the system?**
  _41 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Platform & Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Admin Panel Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._