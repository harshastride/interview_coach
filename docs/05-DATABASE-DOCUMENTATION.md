# Database Documentation

## 1. Overview

- **Database**: PostgreSQL 16 (Alpine)
- **Connection**: Via `pg.Pool` using `DATABASE_URL` environment variable
- **Default**: `postgresql://flashcards:flashcards@localhost:5432/flashcards`
- **Schema Initialization**: `CREATE TABLE IF NOT EXISTS` on server startup (no migration tool)
- **Session Store**: Auto-created by `connect-pg-simple`
- **Total Tables**: 8 application tables + 1 session table

---

## 2. Table Definitions

### 2.1 `users`

Primary user table. Created on first Google OAuth login.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PRIMARY KEY | auto-increment | Unique user identifier |
| `google_id` | TEXT | UNIQUE NOT NULL | - | Google OAuth profile ID |
| `email` | TEXT | UNIQUE NOT NULL | - | User email address |
| `name` | TEXT | NOT NULL | - | Display name from Google profile |
| `avatar_url` | TEXT | NULLABLE | NULL | Google profile picture URL |
| `role` | TEXT | NOT NULL | `'viewer'` | User role: `admin`, `manager`, `viewer` |
| `is_allowed` | INTEGER | NOT NULL | `0` | Access flag: 0=denied, 1=allowed |
| `created_at` | TIMESTAMPTZ | - | `NOW()` | Registration timestamp |
| `last_login` | TIMESTAMPTZ | - | `NOW()` | Last login timestamp |

**Indexes**: Primary key on `id`, unique on `google_id`, unique on `email` (implicit from UNIQUE constraint).

---

### 2.2 `email_allowlist`

Pre-approved email addresses that are auto-granted access on login.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `email` | TEXT | PRIMARY KEY | - | Allowed email address (lowercase) |
| `added_by` | INTEGER | FK → `users(id)` | - | Admin who added this email |
| `added_at` | TIMESTAMPTZ | - | `NOW()` | When the email was added |

---

### 2.3 `uploaded_terms`

Flashcard terms uploaded by admins/managers.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PRIMARY KEY | auto-increment | Unique term identifier |
| `t` | TEXT | NOT NULL | - | Term text (e.g., "Delta Lake") |
| `d` | TEXT | NOT NULL | - | Definition text |
| `l` | INTEGER | NOT NULL | - | Level: 2 (Beginner), 3 (Elementary), 4 (Intermediate), 5 (Advanced) |
| `c` | TEXT | NOT NULL | - | Category name (one of 24 predefined categories) |
| `added_by` | INTEGER | FK → `users(id)` | - | Uploader user ID |
| `added_at` | TIMESTAMPTZ | - | `NOW()` | Upload timestamp |

---

### 2.4 `uploaded_interview`

Interview questions and ideal answers uploaded by admins/managers.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PRIMARY KEY | auto-increment | Unique Q&A identifier |
| `question` | TEXT | NOT NULL | - | Interview question text |
| `ideal_answer` | TEXT | NOT NULL | - | Model answer text |
| `role` | TEXT | NOT NULL | - | Target job role (e.g., "Data Engineer") |
| `company` | TEXT | NOT NULL | - | Target company (e.g., "Stint Academy") |
| `category` | TEXT | NOT NULL | `'General'` | Question category (e.g., "SQL", "System Design") |
| `added_by` | INTEGER | FK → `users(id)` | - | Uploader user ID |
| `added_at` | TIMESTAMPTZ | - | `NOW()` | Upload timestamp |

**Note**: The `category` column was added retroactively with an `ALTER TABLE` migration guard for existing databases.

---

### 2.5 `access_requests`

Requests from authenticated but non-allowed users to gain access.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PRIMARY KEY | auto-increment | Request identifier |
| `email` | TEXT | NOT NULL | - | Requester's email address |
| `name` | TEXT | NOT NULL | - | Requester's display name |
| `reason` | TEXT | NULLABLE | NULL | Optional reason for requesting access |
| `status` | TEXT | - | `'pending'` | Request status: `pending`, `approved`, `rejected` |
| `requested_at` | TIMESTAMPTZ | - | `NOW()` | Request submission timestamp |

---

### 2.6 `audit_log`

Append-only log of all admin actions for accountability.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PRIMARY KEY | auto-increment | Log entry identifier |
| `performed_by` | INTEGER | FK → `users(id)` | - | Actor user ID |
| `action` | TEXT | NOT NULL | - | Action type string |
| `target` | TEXT | NULLABLE | NULL | Target identifier (user ID, email, term name) |
| `detail` | TEXT | NULLABLE | NULL | JSON string with additional context |
| `created_at` | TIMESTAMPTZ | - | `NOW()` | Action timestamp |

**Audit Action Types**:

| Action | Trigger |
|--------|---------|
| `change_role` | Admin changes a user's role |
| `grant_access` | Admin grants access to a user |
| `revoke_access` | Admin revokes access from a user |
| `allowlist_add` | Admin adds email to allowlist |
| `allowlist_remove` | Admin removes email from allowlist |
| `approve_access_request` | Admin approves an access request |
| `reject_access_request` | Admin rejects an access request |
| `upload_term` | Manager/admin uploads a single term |
| `upload_terms_bulk` | Manager/admin bulk uploads terms |
| `delete_term` | Manager/admin deletes a term |
| `upload_interview` | Manager/admin uploads a single interview Q&A |
| `upload_interview_bulk` | Manager/admin bulk uploads interview Q&A |
| `delete_interview` | Manager/admin deletes an interview Q&A |

---

### 2.7 `user_progress`

Snapshot of each learner's study progress across all modules.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id` | INTEGER | PK, FK → `users(id)` ON DELETE CASCADE | - | User identifier |
| `module` | TEXT | NOT NULL | `'home'` | Current active module: `home`, `flashcards`, `interview`, `quiz` |
| `total_terms` | INTEGER | NOT NULL | `0` | Total terms in current session |
| `completed_terms` | INTEGER | NOT NULL | `0` | Number of completed (correct) terms |
| `quiz_correct` | INTEGER | NOT NULL | `0` | Correct quiz answers |
| `quiz_incorrect` | INTEGER | NOT NULL | `0` | Incorrect quiz answers |
| `interview_total` | INTEGER | NOT NULL | `0` | Total interview questions in session |
| `interview_answered` | INTEGER | NOT NULL | `0` | Interview questions answered |
| `updated_at` | TIMESTAMPTZ | - | `NOW()` | Last progress update |

**Note**: Uses `INSERT ON CONFLICT DO UPDATE` (upsert) — one row per user, overwritten on each state change.

---

### 2.8 `tts_cache`

Server-side cache for TTS audio generated by Gemini API.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `term` | TEXT | PRIMARY KEY | - | Normalized term/cache key (lowercase, trimmed) |
| `audio_data` | BYTEA | NOT NULL | - | Raw PCM audio binary data (base64-decoded) |
| `created_at` | TIMESTAMPTZ | - | `NOW()` | Cache entry creation/update timestamp |

**Note**: Uses `INSERT ON CONFLICT DO UPDATE` — regenerated audio replaces the cached version.

---

### 2.9 `session` (auto-created)

Automatically created by `connect-pg-simple` for Express session persistence.

| Column | Type | Description |
|--------|------|-------------|
| `sid` | VARCHAR | Session ID (primary key) |
| `sess` | JSON | Serialized session data |
| `expire` | TIMESTAMP | Session expiration timestamp |

---

## 3. Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ email_allowlist : "added_by"
    users ||--o{ uploaded_terms : "added_by"
    users ||--o{ uploaded_interview : "added_by"
    users ||--o{ audit_log : "performed_by"
    users ||--|| user_progress : "user_id"

    users {
        SERIAL id PK
        TEXT google_id UK
        TEXT email UK
        TEXT name
        TEXT avatar_url
        TEXT role
        INTEGER is_allowed
        TIMESTAMPTZ created_at
        TIMESTAMPTZ last_login
    }

    email_allowlist {
        TEXT email PK
        INTEGER added_by FK
        TIMESTAMPTZ added_at
    }

    uploaded_terms {
        SERIAL id PK
        TEXT t
        TEXT d
        INTEGER l
        TEXT c
        INTEGER added_by FK
        TIMESTAMPTZ added_at
    }

    uploaded_interview {
        SERIAL id PK
        TEXT question
        TEXT ideal_answer
        TEXT role
        TEXT company
        TEXT category
        INTEGER added_by FK
        TIMESTAMPTZ added_at
    }

    access_requests {
        SERIAL id PK
        TEXT email
        TEXT name
        TEXT reason
        TEXT status
        TIMESTAMPTZ requested_at
    }

    audit_log {
        SERIAL id PK
        INTEGER performed_by FK
        TEXT action
        TEXT target
        TEXT detail
        TIMESTAMPTZ created_at
    }

    user_progress {
        INTEGER user_id PK_FK
        TEXT module
        INTEGER total_terms
        INTEGER completed_terms
        INTEGER quiz_correct
        INTEGER quiz_incorrect
        INTEGER interview_total
        INTEGER interview_answered
        TIMESTAMPTZ updated_at
    }

    tts_cache {
        TEXT term PK
        BYTEA audio_data
        TIMESTAMPTZ created_at
    }
```

---

## 4. Data Lifecycle

| Data Entity | Created | Updated | Deleted | Retention |
|------------|---------|---------|---------|-----------|
| **Users** | First Google login | Each login (name, avatar, last_login, is_allowed) | Soft-delete via `is_allowed = 0` | Indefinite |
| **Email Allowlist** | Admin adds email | Overwritten on re-add (`ON CONFLICT DO UPDATE`) | Admin removes email (`DELETE`) | Until removed |
| **Uploaded Terms** | Admin/manager upload (single or bulk) | Never (immutable once created) | Admin/manager delete by ID | Until deleted |
| **Uploaded Interview** | Admin/manager upload (single or bulk) | Never (immutable once created) | Admin/manager delete by ID | Until deleted |
| **Access Requests** | User submission | Status changes (pending → approved/rejected) | Never deleted | Indefinite (no cleanup) |
| **Audit Log** | On every admin action | Never (append-only) | Never deleted | Indefinite (no cleanup) |
| **User Progress** | First progress snapshot | Overwritten on every state change (upsert) | CASCADE when user deleted | One row per user |
| **TTS Cache** | First TTS generation for a term | Overwritten on regeneration | Never deleted | Indefinite (grows unbounded) |
| **Sessions** | On login | On each request (touch) | On logout or expiry (7 days) | `connect-pg-simple` handles cleanup |

---

## 5. Missing Indexes (Recommendations)

The current schema relies only on primary keys and unique constraints. The following indexes would improve query performance:

| Table | Column(s) | Rationale |
|-------|-----------|-----------|
| `uploaded_terms` | `(c, l)` | Filtered queries by category and level |
| `uploaded_interview` | `(category)` | Filtered queries by interview category |
| `uploaded_interview` | `(role, company)` | Filtered queries by role/company |
| `audit_log` | `(created_at DESC)` | Ordered query for audit log display |
| `access_requests` | `(status, requested_at)` | Filtered query for pending requests |
| `user_progress` | `(updated_at DESC)` | Ordered query for progress dashboard |

---

## 6. Schema Migration Notes

- **Current approach**: `CREATE TABLE IF NOT EXISTS` on every server startup — no versioned migrations
- **Retroactive column addition**: `uploaded_interview.category` uses a `DO $$ ... ALTER TABLE` guard
- **Recommended**: Adopt `node-pg-migrate` or `knex` for versioned, repeatable migrations with rollback support
