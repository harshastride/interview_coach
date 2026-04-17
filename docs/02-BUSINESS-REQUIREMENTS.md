# Business Requirements Document (BRD)

## 1. Business Problem Solved

The application addresses the challenge of preparing for Azure Data Engineering technical interviews. It provides a structured, interactive way to learn terminology, test knowledge, and practice interview scenarios with AI assistance. Traditional study methods (reading documentation, passive video courses) lack interactivity and feedback — this platform closes that gap with active recall via flashcards, adaptive quizzes with AI explanations, and simulated interview sessions with voice interaction.

## 2. Target Users

| User Type | Description | Access Level |
|-----------|-------------|--------------|
| **Learners** | Individuals preparing for Azure Data Engineering roles/interviews | Viewer role — study content only |
| **Admins** | Platform administrators who manage users, content, and access | Full access — all features |
| **Managers** | Content managers who upload flashcards/interview Q&A and monitor learner progress | Upload, delete, progress dashboard |

## 3. Key Features

| # | Feature | Description |
|---|---------|-------------|
| F1 | Flashcard Study | Interactive flip-cards with term/definition, audio TTS, category/level filtering |
| F2 | Quiz Mode | Multiple-choice questions with AI-generated explanations, voice answer input |
| F3 | Interview Practice | Simulated interview with TTS questions, typewriter-effect ideal answers, up to 10 questions per session |
| F4 | PDF Export | Download interview session as a formatted PDF document |
| F5 | Google OAuth Login | Secure authentication via Google accounts |
| F6 | Access Control | Email allowlist + access request workflow |
| F7 | Admin Panel | User management, allowlist, access requests, audit log, progress dashboard |
| F8 | Content Management | Single and bulk (CSV) upload for flashcards and interview Q&A |
| F9 | Progress Tracking | Real-time progress snapshots per learner, viewable by admin/manager |
| F10 | TTS Caching | Audio cached in PostgreSQL to reduce Gemini API calls |

## 4. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Users must authenticate via Google OAuth before accessing any content | P0 |
| FR-02 | First user to sign up automatically becomes admin with full access | P0 |
| FR-03 | Subsequent users must be on the email allowlist or request access | P0 |
| FR-04 | Admins can approve/reject access requests, manage allowlist, change user roles (admin/manager/viewer) | P0 |
| FR-05 | Admins and managers can upload flashcards (single or CSV bulk) with term, definition, level (2-5), category | P0 |
| FR-06 | Admins and managers can upload interview Q&A (single or CSV bulk) with question, ideal answer, role, company, category | P0 |
| FR-07 | Flashcards can be filtered by topic (category) and level (Beginner to Advanced) | P1 |
| FR-08 | Quiz generates 4 multiple-choice options from available terms and provides AI explanations via Gemini | P1 |
| FR-09 | Interview sessions select up to 10 random questions, optionally filtered by category | P1 |
| FR-10 | All admin actions (role changes, access grants/revokes, uploads, deletions) are logged in an audit trail | P1 |
| FR-11 | Progress data (current module, terms completed, quiz scores, interview progress) is persisted per user | P1 |
| FR-12 | Bulk interview uploads detect and reject duplicate questions | P2 |
| FR-13 | Interview practice supports TTS for question reading and STT for voice answer input | P1 |
| FR-14 | Users can download interview sessions as PDF documents | P2 |
| FR-15 | Flashcard audio is cached in the database to avoid repeated Gemini API calls | P1 |

## 5. Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | Rate limiting: 20 auth requests per 15 minutes, 3000 admin API requests per hour | Security |
| NFR-02 | Sessions persist for 7 days via PostgreSQL-backed session store | Reliability |
| NFR-03 | HTTPS enforced in production with Let's Encrypt certificates | Security |
| NFR-04 | Application runs in Docker containers with health checks | Availability |
| NFR-05 | JSON body size limit of 10MB for bulk uploads | Performance |
| NFR-06 | Application must support mobile-first responsive design with bottom navigation | Usability |
| NFR-07 | TTS audio uses Gemini 2.5 Flash Preview with Kore voice | Quality |
| NFR-08 | Application must work on modern browsers supporting Web Audio API | Compatibility |

## 6. User Journeys

### Journey 1: New Learner Onboarding

```
Visit app URL
  → Sign in with Google OAuth
    → [NOT on allowlist] → Access denied screen
      → Submit access request (name + optional reason)
        → Wait for admin approval
          → Login again → Access granted → Home screen
    → [ON allowlist] → Auto-approved → Home screen
```

### Journey 2: Flashcard Study Session

```
Home screen
  → Click "Flashcards"
    → Select one or more topic categories
      → Optionally filter by level (Beginner/Elementary/Intermediate/Advanced)
        → Click "Start Flashcards"
          → View term (front of card)
            → Tap to flip → See definition + example + quiz tip
              → Click speaker icon → Hear TTS pronunciation
              → Mark correct (removes from deck) or incorrect (stays)
                → Navigate with Prev/Next arrows
                  → All cards completed → "Study again" or "Back to topics"
```

### Journey 3: Quiz Session

```
Home screen
  → Click "Quiz"
    → Select topics + optional level filter → Click "Start Quiz"
      → See definition prompt → 4 multiple-choice options shown
        → Click an option OR click microphone to speak answer
          → [Correct] → Score +1, AI explanation shown
          → [Incorrect] → Score tracked, correct answer highlighted, AI explanation
            → Click "Next question" → Continue until all terms
```

### Journey 4: Interview Practice

```
Home screen
  → Click "Interview Practice"
    → Select categories (or check "Random")
      → Enter candidate name
        → Click "Start Interview"
          → Intro screen → Allow microphone → Click "Begin"
            → Hear TTS greeting
              → Loop (up to 10 questions):
                → Hear question TTS → See typewriter-effect ideal answer
                  → Click "Next" to advance
              → Hear closing TTS → Completion screen
                → Listen to full session audio replay
                → Rate confidence (1-5)
                → Download PDF
                → Practice again or go Home
```

### Journey 5: Admin Content Management

```
Login as admin/manager
  → Click avatar → User menu → "Admin Panel"
    → [Users tab] View/edit user roles, toggle access, remove users
    → [Allowlist tab] Add/remove emails from allowlist
    → [Requests tab] Approve/reject pending access requests
    → [Audit Log tab] View last 100 admin actions
    → [Progress tab] View learner progress dashboard (completion %, scores)
    → [Upload Content tab]
      → Upload single flashcard (term, definition, level, category)
      → Upload CSV bulk flashcards
      → Upload single interview Q&A (question, answer, role, company, category)
      → Upload CSV bulk interview Q&A (with role/company/category applied to all)
    → [Delete Content tab] View and delete individual flashcards/interview Q&A
```

## 7. Business Rules

| # | Rule |
|---|------|
| BR-01 | First registered user is automatically assigned `admin` role with `is_allowed = 1` |
| BR-02 | Users whose email is on the `email_allowlist` are auto-approved (`is_allowed = 1`) on login |
| BR-03 | Admins cannot modify their own account (self-protection against accidental lockout) |
| BR-04 | Valid flashcard levels are 2 (Beginner), 3 (Elementary), 4 (Intermediate), 5 (Advanced) |
| BR-05 | Flashcard categories must match one of the 24 predefined categories |
| BR-06 | Interview sessions are capped at 10 questions per session |
| BR-07 | Duplicate interview questions (case-insensitive match) are rejected during bulk upload |
| BR-08 | Interview Q&A category defaults to "General" if not specified |
| BR-09 | Only admin and manager roles can upload/delete content |
| BR-10 | Only admin role can manage users, allowlist, and access requests |
| BR-11 | TTS audio is cached on first generation; subsequent requests use the cached version |
| BR-12 | Progress snapshots use upsert (INSERT ON CONFLICT UPDATE) — one record per user |

## 8. Content Categories (24 Total)

| # | Category | Level Group |
|---|----------|-------------|
| 1 | Cloud & Internet Basics | Beginner (2) |
| 2 | Azure Basics | Beginner (2) |
| 3 | Data Basics | Beginner (2) |
| 4 | SQL Fundamentals | Elementary (3) |
| 5 | Python Basics | Elementary (3) |
| 6 | File Formats | Elementary (3) |
| 7 | Python Intermediate | Intermediate (4) |
| 8 | Python Key Libraries | Intermediate (4) |
| 9 | Azure Data Services | Intermediate (4) |
| 10 | ETL & Data Integration | Intermediate (4) |
| 11 | Apache Spark Core | Advanced (5) |
| 12 | Spark Streaming | Advanced (5) |
| 13 | Delta Lake | Advanced (5) |
| 14 | Azure Databricks | Advanced (5) |
| 15 | Data Architecture Concepts | Advanced (5) |
| 16 | SQL Advanced | Advanced (5) |
| 17 | Streaming & Messaging | Advanced (5) |
| 18 | dbt & Orchestration | Advanced (5) |
| 19 | Data Quality & Governance | Advanced (5) |
| 20 | Security & Access | Advanced (5) |
| 21 | DevOps & Version Control | Advanced (5) |
| 22 | Monitoring & Observability | Advanced (5) |
| 23 | Networking & Protocols | Advanced (5) |
| 24 | Power BI & Reporting | Advanced (5) |

## 9. Assumptions

| # | Assumption |
|---|-----------|
| A-01 | All users have Google accounts for authentication |
| A-02 | The Gemini API key has sufficient quota for TTS/STT/LLM usage |
| A-03 | The deployment server has Docker and Docker Compose installed |
| A-04 | The domain is properly configured with DNS for SSL certificate provisioning |

## 10. Items Requiring Business Clarification

| # | Item |
|---|------|
| BC-01 | Pricing model — is this a free internal tool or a paid SaaS product? |
| BC-02 | SLA requirements — uptime targets, response time requirements |
| BC-03 | User capacity targets — expected number of concurrent users |
| BC-04 | Data retention policies — how long to keep audit logs, user progress, TTS cache |
| BC-05 | GDPR/privacy compliance — user data export/deletion rights |
| BC-06 | Content moderation — who reviews uploaded flashcards and interview Q&A for accuracy? |
| BC-07 | Multi-tenancy — should the platform support multiple organizations/teams? |
| BC-08 | Analytics requirements — what business metrics need to be tracked? |
