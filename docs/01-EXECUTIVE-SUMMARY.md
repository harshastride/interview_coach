# Executive Summary

## System Overview

**Stint Academy Interview Coach** is a full-stack, single-page web application that serves as an interactive learning platform for Azure Data Engineering. It provides three core learning modalities: **Flashcards**, **AI-powered Quizzes**, and **Interview Practice sessions** with Text-to-Speech and Speech-to-Text capabilities powered by Google Gemini AI.

The application uses Google OAuth for authentication, an email-based allowlist for access control, and a role-based admin panel for content and user management. It is containerized with Docker Compose and deployed behind Nginx with Let's Encrypt SSL on an Akamai server.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 6, Motion (Framer Motion) |
| Backend | Express.js 4, TypeScript, Passport.js (Google OAuth) |
| Database | PostgreSQL 16 (Alpine) |
| AI/ML | Google Gemini API (TTS, STT, LLM explanations) |
| Deployment | Docker Compose, Nginx, Let's Encrypt (Certbot) |

## Codebase Size

| Metric | Value |
|--------|-------|
| Total source files | ~15 (excluding data/config) |
| Frontend lines | ~2,700 (App.tsx: 2,419, GlobalNav: 118, constants: 119) |
| Backend lines | ~844 (server.ts) |
| Database tables | 8 + 1 auto-created session table |
| API endpoints | 22 |
| Test files | 0 |

## Key Features

1. **Flashcard Study** — Interactive flip-cards with TTS audio, category/level filtering
2. **Quiz Mode** — Multiple-choice with AI explanations, voice answer via Gemini Live API
3. **Interview Practice** — Simulated interview with TTS questions, typewriter ideal answers, PDF export
4. **Admin Panel** — User management, allowlist, audit log, progress dashboard, content CRUD
5. **Bulk Content Upload** — CSV-based upload for flashcards and interview Q&A

## Top 5 Critical Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | **GEMINI_API_KEY exposed in client bundle** — API key injected into frontend via Vite `define`, extractable from browser DevTools | Critical |
| 2 | **Secrets committed to git** — `.env` file with production credentials exists in repository | Critical |
| 3 | **Monolithic App.tsx (2,419 lines)** — entire UI in a single React component | Critical |
| 4 | **Zero test coverage** — no test framework, no test files, no CI/CD pipeline | High |
| 5 | **No database transactions for bulk operations** — bulk uploads insert rows without transaction boundaries | High |

## Documentation Index

| # | Document | File |
|---|----------|------|
| 1 | Executive Summary | `01-EXECUTIVE-SUMMARY.md` (this file) |
| 2 | Business Requirements Document | `02-BUSINESS-REQUIREMENTS.md` |
| 3 | Technical Design Document | `03-TECHNICAL-DESIGN.md` |
| 4 | Architecture Diagrams | `04-ARCHITECTURE-DIAGRAMS.md` |
| 5 | Database Documentation | `05-DATABASE-DOCUMENTATION.md` |
| 6 | API Documentation | `06-API-DOCUMENTATION.md` |
| 7 | Code Quality Audit | `07-CODE-QUALITY-AUDIT.md` |
| 8 | Security Audit | `08-SECURITY-AUDIT.md` |
| 9 | Performance Recommendations | `09-PERFORMANCE-RECOMMENDATIONS.md` |
| 10 | Refactoring Roadmap | `10-REFACTORING-ROADMAP.md` |
