# Architecture Diagrams

All diagrams use Mermaid format and can be rendered in GitHub, GitLab, Notion, or any Mermaid-compatible viewer.

---

## 1. System Architecture Diagram

High-level view of all system components, their relationships, and external services.

```mermaid
graph TB
    subgraph Client["Browser (Client)"]
        React["React SPA<br/>App.tsx"]
        Gemini_Client["Google Gemini SDK<br/>(Client-side TTS/STT/Quiz)"]
    end

    subgraph Infrastructure["Docker Compose"]
        Nginx["Nginx<br/>Reverse Proxy<br/>SSL Termination"]

        subgraph App["Node.js Container"]
            Express["Express.js Server<br/>server.ts"]
            Vite_Static["Static Files<br/>(dist/)"]
        end

        PG["PostgreSQL 16<br/>(Alpine)"]
    end

    subgraph External["External Services"]
        Google_OAuth["Google OAuth 2.0"]
        Gemini_API["Google Gemini API<br/>(TTS, STT, LLM)"]
    end

    React -->|HTTPS| Nginx
    Nginx -->|HTTP :3000| Express
    Express -->|SQL| PG
    Express -->|OAuth flow| Google_OAuth
    Gemini_Client -->|API calls| Gemini_API
    React --> Gemini_Client
```

---

## 2. Component Diagram

Internal modules and their dependencies.

```mermaid
graph LR
    subgraph Frontend["Frontend (React SPA)"]
        App["App.tsx<br/>(2419 lines)<br/>Auth + UI + Logic"]
        GlobalNav["GlobalNav.tsx<br/>TopBar + BottomNav + Layout"]
        Constants["constants.ts<br/>Types, Builders, Categories"]
        TermData["termData.ts<br/>Static Flashcard Data"]
        Utils["utils.ts<br/>cn() helper"]
        IndexCSS["index.css<br/>Tailwind + CSS vars"]

        App --> GlobalNav
        App --> Constants
        App --> Utils
        Constants --> TermData
    end

    subgraph Backend["Backend (Express.js)"]
        Server["server.ts<br/>(844 lines)"]
        AuthMiddleware["Auth Middleware<br/>requireAuth<br/>requireAdmin<br/>requireUploader"]
        AuthRoutes["Auth Routes<br/>/auth/google<br/>/api/auth/*"]
        ContentRoutes["Content Routes<br/>/api/content/*<br/>/api/tts/*<br/>/api/progress"]
        AdminRoutes["Admin Routes<br/>/api/admin/*"]
        AuditHelper["audit() helper"]

        Server --> AuthMiddleware
        Server --> AuthRoutes
        Server --> ContentRoutes
        Server --> AdminRoutes
        ContentRoutes --> AuthMiddleware
        AdminRoutes --> AuthMiddleware
        AdminRoutes --> AuditHelper
    end

    subgraph Data["Data Layer"]
        PGPool["pg.Pool<br/>Connection Pool"]
        PGSession["connect-pg-simple<br/>Session Store"]
    end

    App -->|"fetch() API calls"| Server
    Server --> PGPool
    Server --> PGSession
```

---

## 3. Data Flow Diagram

How data moves through the system for key operations.

```mermaid
flowchart TD
    User((User)) -->|"1. GET /auth/google"| GoogleOAuth[Google OAuth 2.0]
    GoogleOAuth -->|"2. Profile data"| Server[Express Server]
    Server -->|"3. Check allowlist<br/>Create/Update user"| PG[(PostgreSQL)]
    PG -->|"4. User record"| Server
    Server -->|"5. Session cookie<br/>Redirect to /"| User

    User -->|"6. GET /api/content/terms"| Server
    Server -->|"7. SELECT FROM uploaded_terms"| PG
    PG -->|"8. Term rows"| Server
    Server -->|"9. JSON response"| User

    User -->|"10. Gemini TTS request<br/>(client-side)"| GeminiAPI[Gemini API]
    GeminiAPI -->|"11. Base64 PCM audio"| User
    User -->|"12. POST /api/tts<br/>(cache audio)"| Server
    Server -->|"13. INSERT INTO tts_cache"| PG

    Admin((Admin)) -->|"14. POST /api/admin/terms/bulk<br/>(CSV upload)"| Server
    Server -->|"15. INSERT INTO uploaded_terms<br/>(loop)"| PG
    Server -->|"16. INSERT INTO audit_log"| PG

    User -->|"17. POST /api/progress<br/>(debounced)"| Server
    Server -->|"18. UPSERT user_progress"| PG
```

---

## 4. Authentication Flow Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant Browser as React SPA
    participant Express as Express Server
    participant Google as Google OAuth
    participant PG as PostgreSQL

    User->>Browser: Visit app
    Browser->>Express: GET /api/auth/me
    Express-->>Browser: { authenticated: false }
    Browser->>Browser: Show login screen

    User->>Browser: Click "Continue with Google"
    Browser->>Express: GET /auth/google
    Express->>Google: Redirect to consent screen
    Google-->>User: Show consent form
    User->>Google: Grant access
    Google->>Express: GET /auth/google/callback?code=...

    Express->>Google: Exchange code for profile
    Google-->>Express: Profile (id, email, name, avatar)

    Express->>PG: SELECT * FROM users WHERE google_id = ?
    alt New user
        Express->>PG: SELECT COUNT(*) FROM users
        Express->>PG: SELECT 1 FROM email_allowlist WHERE email = ?
        Express->>PG: INSERT INTO users (...)
    else Existing user
        Express->>PG: SELECT 1 FROM email_allowlist WHERE email = ?
        Express->>PG: UPDATE users SET last_login = NOW()
    end

    Express->>PG: Store session
    Express-->>Browser: 302 Redirect + Set-Cookie

    Browser->>Express: GET /api/auth/me (with cookie)
    Express->>PG: Deserialize user from session
    Express-->>Browser: { authenticated: true, user: {...} }
    Browser->>Browser: Show home screen
```

---

## 5. Interview Practice Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant React as React SPA
    participant Express as Express Server
    participant PG as PostgreSQL
    participant Gemini as Gemini API

    User->>React: Click "Interview Practice"
    React->>Express: GET /api/content/interview
    Express->>PG: SELECT FROM uploaded_interview
    PG-->>Express: Interview Q&A rows
    Express-->>React: JSON array of Q&As

    User->>React: Select categories + name + Start
    React->>React: Shuffle & pick 10 questions
    React->>React: Show intro screen

    User->>React: Allow microphone + click "Begin"
    React->>Gemini: TTS: "Hi [name], welcome..."
    Gemini-->>React: Base64 PCM audio
    React->>React: Play greeting via AudioContext

    loop For each question (1 to 10)
        React->>Gemini: TTS: question text
        Gemini-->>React: Audio data
        React->>React: Play question audio
        React->>Express: POST /api/tts (cache)
        Express->>PG: UPSERT tts_cache
        Note over React: questionAudioDone = true
        React->>React: Typewriter reveal ideal answer
        User->>React: Click "Next"
    end

    React->>Gemini: TTS: "Thank you [name]..."
    Gemini-->>React: Audio data
    React->>React: Show completion screen

    opt Download PDF
        User->>React: Click "Download PDF"
        React->>React: Generate PDF via jsPDF
    end

    React->>Express: POST /api/progress
    Express->>PG: UPSERT user_progress
```

---

## 6. Admin Content Upload Flow

```mermaid
sequenceDiagram
    actor Admin
    participant React as Admin Panel
    participant Express as Express Server
    participant PG as PostgreSQL

    Admin->>React: Open Admin Panel → Upload tab
    Admin->>React: Select CSV file
    React->>React: Parse CSV (client-side)
    React->>React: Show preview (first 5 rows)

    Admin->>React: Fill role, company, category
    Admin->>React: Click "Import N Q&As"

    React->>Express: POST /api/admin/interview/bulk
    Note over Express: requireUploader middleware

    Express->>PG: SELECT question FROM uploaded_interview
    PG-->>Express: Existing questions
    Express->>Express: Check for duplicates

    alt Duplicates found
        Express-->>React: 409 { error: "Duplicates found", duplicates: [...] }
        React->>React: Show alert with duplicate list
    else No duplicates
        loop For each entry
            Express->>PG: INSERT INTO uploaded_interview
        end
        Express->>PG: INSERT INTO audit_log
        Express-->>React: 200 { ok: true, imported: N }
        React->>React: Clear form, refresh lists
    end
```

---

## 7. Deployment Architecture

```mermaid
graph TB
    subgraph Internet
        DNS["DNS<br/>(domain → server IP)"]
        Users["Users<br/>(Browsers)"]
    end

    subgraph Server["Akamai Server (Ubuntu)"]
        subgraph Docker["Docker Compose"]
            Nginx["Nginx Container<br/>:80 / :443"]
            AppContainer["Node.js Container<br/>:3000 (internal)"]
            PGContainer["PostgreSQL Container<br/>:5432 (internal)"]
        end

        subgraph Volumes["Docker Volumes"]
            PGData["pg_data<br/>(database files)"]
            LECerts["letsencrypt<br/>(SSL certs)"]
        end
    end

    Users -->|HTTPS| DNS
    DNS -->|Port 80/443| Nginx
    Nginx -->|"proxy_pass :3000"| AppContainer
    AppContainer -->|"TCP :5432"| PGContainer
    PGContainer --> PGData
    Nginx --> LECerts
```

---

## 8. Frontend State Machine

```mermaid
stateDiagram-v2
    [*] --> Loading: App mount
    Loading --> Unauthenticated: No session
    Loading --> AccessDenied: Authenticated but !isAllowed
    Loading --> Home: Authenticated + isAllowed

    Unauthenticated --> Loading: Click "Continue with Google"

    AccessDenied --> Unauthenticated: Sign out
    AccessDenied --> AccessDenied: Submit access request

    Home --> FlashcardSetup: Click "Flashcards"
    Home --> InterviewSetup: Click "Interview Practice"
    Home --> QuizSetup: Click "Quiz"

    FlashcardSetup --> FlashcardStudy: Select topics → Start
    FlashcardSetup --> Home: Back

    QuizSetup --> QuizStudy: Select topics → Start
    QuizSetup --> Home: Back

    InterviewSetup --> InterviewIntro: Select categories → Start
    InterviewSetup --> Home: Back

    InterviewIntro --> InterviewInProgress: Allow mic → Begin
    InterviewIntro --> InterviewSetup: Back

    InterviewInProgress --> InterviewComplete: Last question → Finish

    InterviewComplete --> InterviewIntro: Practice again
    InterviewComplete --> Home: Home

    FlashcardStudy --> FlashcardSetup: Back to topics
    FlashcardStudy --> AllDone: All cards correct
    AllDone --> FlashcardStudy: Study again
    AllDone --> FlashcardSetup: Back to topics

    QuizStudy --> QuizSetup: Back to topics
```
