# API Documentation

## Overview

- **Base URL**: `http://localhost:3000` (development) / `https://your-domain.com` (production)
- **Content Type**: `application/json`
- **Authentication**: Session-based via cookie (set after Google OAuth login)
- **Rate Limits**: Auth routes: 20/15min, Admin routes: 3000/hour

---

## 1. Authentication Endpoints

### 1.1 `GET /auth/google`

Initiates Google OAuth 2.0 login flow.

- **Auth**: None
- **Rate Limit**: 20 requests per 15 minutes
- **Response**: `302 Redirect` to Google consent screen
- **Error**: `503` if `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` not configured

---

### 1.2 `GET /auth/google/callback`

OAuth callback handler. Creates or updates user record, establishes session.

- **Auth**: Google OAuth token (handled by Passport)
- **Response**: `302 Redirect` to `/` (if allowed) or `/access-denied` (if not allowed)
- **Side Effects**: Creates/updates user in `users` table, saves session to PostgreSQL

---

### 1.3 `GET /api/auth/me`

Returns current authenticated user information.

- **Auth**: Session cookie (optional — returns unauthenticated state if missing)
- **Response**:

```json
// Authenticated and allowed
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "avatar_url": "https://lh3.googleusercontent.com/...",
    "role": "admin",
    "isAllowed": true
  }
}

// Not authenticated
{
  "authenticated": false
}
```

---

### 1.4 `POST /api/auth/logout`

Destroys the current session.

- **Auth**: Session cookie
- **Request Body**: None
- **Response**: `{ "ok": true }`

---

## 2. Content Endpoints

### 2.1 `GET /api/content/terms`

Returns all uploaded flashcard terms.

- **Auth**: `requireAuth` (authenticated + allowed)
- **Response**:

```json
[
  {
    "t": "Delta Lake",
    "d": "Open-source storage layer that brings ACID transactions to Apache Spark.",
    "l": 5,
    "c": "Delta Lake"
  }
]
```

---

### 2.2 `GET /api/content/interview`

Returns all uploaded interview Q&A.

- **Auth**: `requireAuth`
- **Response**:

```json
[
  {
    "question": "What is a Data Lake?",
    "ideal_answer": "A centralized repository that stores structured and unstructured data at any scale.",
    "role": "Data Engineer",
    "company": "Stint Academy",
    "category": "Data Basics"
  }
]
```

---

## 3. TTS Cache Endpoints

### 3.1 `GET /api/tts/:term`

Retrieves cached TTS audio for a term.

- **Auth**: `requireAuth`
- **URL Param**: `term` — URL-encoded term string (normalized to lowercase, trimmed)
- **Response (200)**:

```json
{
  "audio": "base64-encoded-pcm-audio-data..."
}
```

- **Response (404)**: `{ "error": "Not found" }`
- **Response (500)**: `{ "error": "Server error" }`

---

### 3.2 `POST /api/tts`

Stores TTS audio in the server-side cache.

- **Auth**: `requireAuth`
- **Request Body**:

```json
{
  "term": "delta lake",
  "audio": "base64-encoded-pcm-audio-data..."
}
```

- **Response (200)**: `{ "status": "ok" }`
- **Response (400)**: `{ "error": "Missing term or audio" }`
- **Response (500)**: `{ "error": "Failed to save" }`

---

## 4. User Progress

### 4.1 `POST /api/progress`

Saves a user progress snapshot (upsert — one record per user).

- **Auth**: `requireAuth`
- **Request Body**:

```json
{
  "module": "flashcards",
  "total_terms": 50,
  "completed_terms": 10,
  "quiz_correct": 5,
  "quiz_incorrect": 2,
  "interview_total": 10,
  "interview_answered": 3
}
```

| Field | Type | Validation |
|-------|------|-----------|
| `module` | string | Truncated to 32 chars, defaults to `"home"` |
| `total_terms` | number | Non-negative integer, defaults to 0 |
| `completed_terms` | number | Non-negative integer, capped at `total_terms` |
| `quiz_correct` | number | Non-negative integer |
| `quiz_incorrect` | number | Non-negative integer |
| `interview_total` | number | Non-negative integer |
| `interview_answered` | number | Non-negative integer, capped at `interview_total` |

- **Response**: `{ "ok": true }`

---

## 5. Access Request

### 5.1 `POST /api/access-request`

Submits an access request for authenticated but non-allowed users.

- **Auth**: Authenticated (session cookie), but does NOT require `is_allowed`
- **Request Body**:

```json
{
  "name": "John Doe",
  "reason": "I'm preparing for Azure DE interviews"
}
```

| Field | Type | Required | Description |
|-------|------|:---:|-------------|
| `name` | string | Yes | Requester's name |
| `reason` | string | No | Optional reason for access |

- **Response (200)**: `{ "ok": true }`
- **Response (400)**: `{ "error": "Name required" }`
- **Response (401)**: `{ "error": "Not authenticated" }`

---

## 6. Admin Endpoints

All admin endpoints require authentication and appropriate role.

### 6.1 User Management

#### `GET /api/admin/users`

- **Auth**: `requireAdmin`
- **Response**:

```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "avatar_url": "https://...",
    "role": "admin",
    "is_allowed": 1,
    "created_at": "2025-01-15T10:00:00Z",
    "last_login": "2025-01-20T14:30:00Z"
  }
]
```

#### `PATCH /api/admin/users/:id`

Updates a user's role and/or access status.

- **Auth**: `requireAdmin`
- **URL Param**: `id` — user ID (integer)
- **Request Body** (all optional):

```json
{
  "role": "manager",
  "is_allowed": true
}
```

| Field | Validation |
|-------|-----------|
| `role` | Must be `"admin"`, `"manager"`, or `"viewer"` |
| `is_allowed` | Boolean (converted to 1 or 0) |

- **Response (200)**: `{ "ok": true }`
- **Response (400)**: `{ "error": "Cannot modify your own account" }` or `{ "error": "Invalid role" }`
- **Side Effects**: Audit log entry created

#### `DELETE /api/admin/users/:id`

Revokes a user's access (sets `is_allowed = 0`). Does NOT delete the user record.

- **Auth**: `requireAdmin`
- **Response (200)**: `{ "ok": true }`
- **Response (400)**: `{ "error": "Cannot remove your own account" }`

---

### 6.2 Email Allowlist

#### `GET /api/admin/allowlist`

- **Auth**: `requireAdmin`
- **Response**: `[{ "email": "user@example.com", "added_at": "2025-01-15T10:00:00Z" }]`

#### `POST /api/admin/allowlist`

- **Auth**: `requireAdmin`
- **Request Body**: `{ "email": "newuser@example.com" }`
- **Response (200)**: `{ "ok": true }`
- **Side Effects**: Also sets `is_allowed = 1` for existing user with that email; audit log entry

#### `DELETE /api/admin/allowlist/:email`

- **Auth**: `requireAdmin`
- **URL Param**: `email` — URL-encoded email address
- **Response (200)**: `{ "ok": true }`
- **Side Effects**: Also sets `is_allowed = 0` for user with that email; audit log entry

---

### 6.3 Access Requests

#### `GET /api/admin/requests`

Returns pending access requests only.

- **Auth**: `requireAdmin`
- **Response**:

```json
[
  {
    "id": 1,
    "email": "requester@example.com",
    "name": "John Doe",
    "reason": "Preparing for interviews",
    "status": "pending",
    "requested_at": "2025-01-20T09:00:00Z"
  }
]
```

#### `POST /api/admin/requests/:id/approve`

Approves an access request — adds email to allowlist and grants access.

- **Auth**: `requireAdmin`
- **Response (200)**: `{ "ok": true }`
- **Response (404)**: `{ "error": "Request not found" }`

#### `POST /api/admin/requests/:id/reject`

Rejects an access request.

- **Auth**: `requireAdmin`
- **Response (200)**: `{ "ok": true }`
- **Response (404)**: `{ "error": "Request not found" }`

---

### 6.4 Audit Log

#### `GET /api/admin/audit`

Returns the last 100 audit log entries.

- **Auth**: `requireAdmin`
- **Response**:

```json
[
  {
    "id": 42,
    "action": "upload_terms_bulk",
    "target": "25",
    "detail": null,
    "created_at": "2025-01-20T14:30:00Z",
    "actor_email": "admin@example.com"
  }
]
```

---

### 6.5 Progress Dashboard

#### `GET /api/admin/progress`

Returns learner progress for all users (with computed completion percentages).

- **Auth**: `requireUploader` (admin or manager)
- **Response**:

```json
[
  {
    "id": 2,
    "name": "Learner",
    "email": "learner@example.com",
    "role": "viewer",
    "is_allowed": 1,
    "last_login": "2025-01-20T14:30:00Z",
    "module": "flashcards",
    "total_terms": 50,
    "completed_terms": 25,
    "quiz_correct": 10,
    "quiz_incorrect": 3,
    "interview_total": 10,
    "interview_answered": 7,
    "updated_at": "2025-01-20T14:35:00Z",
    "flashcard_completion_pct": "50.0",
    "interview_completion_pct": "70.0"
  }
]
```

---

### 6.6 Content Upload — Terms

#### `POST /api/admin/terms`

Upload a single flashcard term.

- **Auth**: `requireUploader`
- **Request Body**:

```json
{
  "t": "Delta Lake",
  "d": "Open-source storage layer bringing ACID transactions to Spark.",
  "l": 5,
  "c": "Delta Lake"
}
```

| Field | Type | Required | Validation |
|-------|------|:---:|-----------|
| `t` | string | Yes | Non-empty after trim |
| `d` | string | Yes | Non-empty after trim |
| `l` | number | Yes | Must be 2, 3, 4, or 5 |
| `c` | string | Yes | Must match one of 24 predefined categories |

- **Response (200)**: `{ "ok": true }`
- **Response (400)**: `{ "error": "term, definition, category required" }` or `{ "error": "level must be 2, 3, 4, or 5" }` or `{ "error": "Invalid category" }`

#### `POST /api/admin/terms/bulk`

Bulk upload flashcard terms.

- **Auth**: `requireUploader`
- **Request Body**:

```json
{
  "entries": [
    { "t": "Term 1", "d": "Definition 1", "l": 3, "c": "SQL Fundamentals" },
    { "t": "Term 2", "d": "Definition 2", "l": 4, "c": "Azure Data Services" }
  ]
}
```

- **Response (200)**: `{ "ok": true, "imported": 2 }`
- **Response (400)**: `{ "error": "entries array required" }`
- **Note**: Invalid entries are silently skipped (no error)

#### `GET /api/admin/terms`

List all uploaded terms (ordered by `added_at DESC`).

- **Auth**: `requireUploader`
- **Response**: `[{ "id": 1, "t": "...", "d": "...", "l": 4, "c": "...", "added_at": "..." }]`

#### `DELETE /api/admin/terms/:id`

Delete a single uploaded term.

- **Auth**: `requireUploader`
- **Response (200)**: `{ "ok": true }`
- **Response (404)**: `{ "error": "Not found" }`

---

### 6.7 Content Upload — Interview

#### `POST /api/admin/interview`

Upload a single interview Q&A.

- **Auth**: `requireUploader`
- **Request Body**:

```json
{
  "question": "What is a Star Schema?",
  "ideal_answer": "A dimensional modeling technique with a central fact table...",
  "role": "Data Engineer",
  "company": "Stint Academy",
  "category": "Data Architecture"
}
```

| Field | Type | Required | Validation |
|-------|------|:---:|-----------|
| `question` | string | Yes | Non-empty after trim |
| `ideal_answer` | string | Yes | Non-empty after trim |
| `role` | string | Yes | Non-empty after trim |
| `company` | string | Yes | Non-empty after trim |
| `category` | string | No | Defaults to `"General"` |

- **Response (200)**: `{ "ok": true }`

#### `POST /api/admin/interview/bulk`

Bulk upload interview Q&A with duplicate detection.

- **Auth**: `requireUploader`
- **Request Body**:

```json
{
  "entries": [
    { "question": "What is ETL?", "ideal_answer": "Extract, Transform, Load..." },
    { "question": "Explain ACID properties.", "ideal_answer": "Atomicity, Consistency..." }
  ],
  "role": "Data Engineer",
  "company": "Stint Academy",
  "category": "ETL & Data Integration"
}
```

- **Response (200)**: `{ "ok": true, "imported": 2 }`
- **Response (400)**: `{ "error": "entries, role, company required" }`
- **Response (409)** (duplicates found):

```json
{
  "error": "Duplicates found",
  "duplicates": ["What is ETL?"]
}
```

#### `GET /api/admin/interview`

List all uploaded interview Q&A (ordered by `added_at DESC`).

- **Auth**: `requireUploader`
- **Response**: `[{ "id": 1, "question": "...", "ideal_answer": "...", "role": "...", "company": "...", "category": "...", "added_at": "..." }]`

#### `DELETE /api/admin/interview/:id`

Delete a single interview Q&A.

- **Auth**: `requireUploader`
- **Response (200)**: `{ "ok": true }`
- **Response (404)**: `{ "error": "Not found" }`

---

## 7. Error Response Schema

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### Common HTTP Status Codes

| Code | Meaning | Used For |
|------|---------|----------|
| 200 | OK | Successful requests |
| 302 | Found | OAuth redirects |
| 400 | Bad Request | Validation errors, self-modification attempts |
| 401 | Unauthorized | Missing or invalid session |
| 403 | Forbidden | Insufficient role/permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate interview questions |
| 500 | Server Error | Unhandled exceptions |
| 503 | Service Unavailable | OAuth not configured |

---

## 8. Endpoint Summary Table

| Method | Endpoint | Auth Level | Description |
|--------|----------|-----------|-------------|
| GET | `/auth/google` | None | Start OAuth login |
| GET | `/auth/google/callback` | None | OAuth callback |
| GET | `/api/auth/me` | Optional | Get current user |
| POST | `/api/auth/logout` | Session | Logout |
| GET | `/api/content/terms` | Auth | Get flashcard terms |
| GET | `/api/content/interview` | Auth | Get interview Q&A |
| GET | `/api/tts/:term` | Auth | Get cached TTS audio |
| POST | `/api/tts` | Auth | Save TTS audio |
| POST | `/api/progress` | Auth | Save progress |
| POST | `/api/access-request` | Authenticated | Request access |
| GET | `/api/admin/users` | Admin | List users |
| PATCH | `/api/admin/users/:id` | Admin | Update user |
| DELETE | `/api/admin/users/:id` | Admin | Revoke user |
| GET | `/api/admin/allowlist` | Admin | List allowlist |
| POST | `/api/admin/allowlist` | Admin | Add to allowlist |
| DELETE | `/api/admin/allowlist/:email` | Admin | Remove from allowlist |
| GET | `/api/admin/requests` | Admin | List access requests |
| POST | `/api/admin/requests/:id/approve` | Admin | Approve request |
| POST | `/api/admin/requests/:id/reject` | Admin | Reject request |
| GET | `/api/admin/audit` | Admin | Get audit log |
| GET | `/api/admin/progress` | Uploader | Get progress dashboard |
| POST | `/api/admin/terms` | Uploader | Upload single term |
| POST | `/api/admin/terms/bulk` | Uploader | Bulk upload terms |
| GET | `/api/admin/terms` | Uploader | List uploaded terms |
| DELETE | `/api/admin/terms/:id` | Uploader | Delete term |
| POST | `/api/admin/interview` | Uploader | Upload single Q&A |
| POST | `/api/admin/interview/bulk` | Uploader | Bulk upload Q&A |
| GET | `/api/admin/interview` | Uploader | List uploaded Q&A |
| DELETE | `/api/admin/interview/:id` | Uploader | Delete Q&A |
