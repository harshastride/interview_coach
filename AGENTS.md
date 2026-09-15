# Interview Coach — agent guide

## Read before working

- Read this guide before starting any task in this repository, then inspect the relevant source and any more specific directory instructions before editing.
- Treat verified source code as authoritative when documentation differs. Correct this guide when your changes affect features, architecture, configuration, or development commands.
- Preserve existing user changes, including untracked work. Keep changes focused on the requested task.
- Use existing components, hooks, and API helpers where appropriate. Preserve authentication, role checks, and request headers when changing a flow.
- Never put credentials or real environment values in documentation or client code. Use `.env.example` for configuration names.
- Run checks appropriate to the change and report what was checked and any limitations. Documentation-only changes need path/command verification, not new application tests.

## What the application does

Interview Coach (Stint) helps candidates prepare through term flashcards, quizzes, interview questions with displayed answers, and read-aloud practice with feedback. It tracks study progress, reviews, bookmarks, streaks, and reading attempts. Administrators manage access and users; admins and managers can manage uploaded study content.

## Architecture and code map

The React 19/TypeScript frontend uses React Router, Vite, Tailwind CSS, and Motion. An Express server serves both the API and the frontend: Vite middleware in development, built `dist/` files in production. The server connects through `pg` to Supabase-hosted Postgres; authentication uses Google OAuth through Passport with Postgres-backed sessions.

| Location | Responsibility |
| --- | --- |
| `server.ts` | Environment loading, database initialization, sessions, middleware, API mounts, and frontend serving |
| `src/main.tsx`, `src/App.tsx` | Frontend entry, authentication-gated routes, lazy-loaded screens, shared content state |
| `src/views/` | Home, login/access denial, flashcard/quiz setup and study, interview setup and sessions |
| `src/hooks/` | Authentication, flashcards/interviews, progress, study persistence, speech playback/recognition, recording, and theme |
| `src/components/`, `src/components/ui/` | Navigation, admin panel, avatar, score displays, and reusable UI primitives |
| `src/index.css` | Global styles and theme tokens |
| `src/lib/` | API request helpers, CSV parsing, slugs, and shared utilities |
| `src/constants.ts`, `src/termData.ts` | Shared definitions and bundled term data; inspect callers to determine current usage |
| `src/server/routes/` | Auth, content, admin, AI, TTS cache, study, and miscellaneous endpoints |
| `src/server/middleware/auth.ts` | Authentication, admin/uploader checks, CSRF header validation, and audit helper |
| `src/server/db/pool.ts`, `src/server/db/init.ts` | Postgres connection and startup schema initialization/migrations |
| `analysis/` | Optional Python FastAPI reading analysis using faster-whisper, acoustic metrics, and Ollama coaching |
| `tests/`, `vitest.config.ts` | Vitest setup and existing shared-utility/auth-middleware tests |

## Main flows

- **Sign-in and access:** Google OAuth routes live under `/auth`; `useAuth` loads `/api/auth/bootstrap` for the user and uploaded content. The UI selects login, access-denied, or authenticated screens. Access checks are enforced by backend middleware; admin routes use admin or uploader checks as appropriate. Bootstrap content is uncached and scoped to the authenticated user and assigned domain.
- **Content management:** The admin panel calls `/api/admin` routes for uploaded terms/interview content and access administration. `/api/content` supplies study content, and uploads trigger a frontend refresh. Postgres also stores users, allowlist entries, access requests, and audit records.
- **Study:** `/flashcards` and `/quiz` share setup/study views; `/interview` leads to `/interview/session`. Hooks and `/api/study` routes handle reviews, due cards, bookmarks, activity/streaks, and saved session state. `/api/progress` saves module progress.
- **Speech and AI:** Gemini-backed endpoints under `/api/ai` provide TTS, explanations, transcription, and other coaching operations. TTS audio is cached in Postgres; `/api/tts` also exposes cache operations. Answer evaluation can use Ollama when `AI_PROVIDER=local`.
- **Reading practice:** The interview session displays an answer and records the candidate reading it with `useAnswerRecorder` and browser `MediaRecorder` (up to 180 seconds). `/api/ai/analyze-reading` uses the Python service when `ANALYSIS_URL` is configured, with Gemini as fallback when that service fails; without that URL it uses Gemini directly. Feedback includes transcript, scores, delivery metrics, and coaching. `/api/reading-attempt` saves attempts. The Python service can use template coaching if Ollama is unavailable and has an optional vocal-confidence model.

See [the reading-practice architecture specification](docs/reading-practice-spec.md) for detailed flow and analysis contracts. Verify details against the implementation when modifying this feature.

Reading practice automatically starts recording after question audio finishes, alongside the answer's typewriter reveal. Controls are available below the reading pane immediately; the user presses **Done — Show Metrics** after speaking (or the 180-second cap submits the recording). Text completion does not stop recording. Both question and answer playback are disabled while the microphone starts/records. Cancellation and microphone failures require an explicit retry; each new question auto-starts once. Leaving a question discards its pending recording/analysis so stale metrics cannot appear on another question. The active interview uses compact participant previews, reading text and the recorded transcript on the left, and a separate metrics/coaching panel on the right. Desktop panels scroll independently with recording controls fixed below the text; mobile stacks the panels. All feedback sections remain accessible without expanding disclosures.

## Azure reading checkpoints (opt-in)

`READING_ANALYSIS_PROVIDER=azure` selects `src/server/services/hybridReading.ts`; otherwise the existing analysis flow above remains active. Configure `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_LOCALE` (default `en-IN`) and `ANALYSIS_URL`. Node requires ffmpeg (included in Docker). Credentials remain server-side. See [Azure setup and scoring](docs/azure-reading.md).

Every accepted recording gets a local baseline; attempts 1, 6, 11, etc. in each UTC month additionally use Azure continuous pronunciation assessment when allowance remains. `readingQuota.ts` reserves a maximum of 1,800 audio seconds per user/month under a database lock, before the external call. Startup creates the private `reading_analysis_jobs` ledger. Failed/uncertain Azure submissions retain their reservation. Completed identical submissions reuse the saved result. Gemini receives text/measurements only for coaching; local feedback cannot prove pronunciation or confidence improvement. Hybrid reports suppress cross-provider score deltas.

## Local setup and commands

Use Node.js/npm (the application Docker image uses Node 22), a configured Postgres database, Google OAuth credentials for sign-in, and a Gemini key for Gemini-backed features.

1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the required values locally. The server also loads `.env.local` with override enabled.
3. Run `npm run dev`, then open `http://localhost:3000`.

`./start.sh` is an alternative setup/start helper: it checks prerequisites, creates `.env` if missing and exits for configuration, installs dependencies, and starts development. It can start a locally installed Ollama when configured for local AI.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Express with the Vite development frontend |
| `npm run build` | Build frontend assets into `dist/` |
| `npm run lint` | TypeScript checking (`tsc --noEmit`); does not format files |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run preview` | Preview built frontend assets only; does not start the Express API |
| `docker compose up -d --build` | Build/start the production app and analysis service; app at `http://localhost:8000` |

Database initialization runs on server startup and may create schema objects. Existing databases take the incremental migration path in `init.ts`; changes to initial table creation alone will not update them.

## Configuration

For temporary local access without Google sign-in, set `DEV_AUTH_BYPASS=true` in `.env` and restart. It activates only when `NODE_ENV` is unset or `development`, binds Express to `127.0.0.1`, and grants loopback requests the Local Developer admin identity. Its database row is a disallowed viewer; admin access exists only on the request and is never saved in a login session. Progress uses that row's real ID. Signing out while enabled automatically re-enters local access on the next request. Set the flag to `false` and restart to restore normal sign-in. The local row is excluded from first-real-user admin assignment.

Use `.env.example` as the configuration reference; document names, never secrets.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | Required database connection; shared app data, sessions, progress, and TTS cache live in Postgres |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` | Google sign-in and OAuth callback base URL; `APP_URL` also controls secure session cookies |
| `SESSION_SECRET` | Session signing secret; required in production |
| `GEMINI_API_KEY` | Gemini-backed AI and speech operations |
| `AI_PROVIDER`, `OLLAMA_URL`, `OLLAMA_MODEL` | Optional local answer evaluation; Ollama URL/model also configure Python coaching in its own environment |
| `ANALYSIS_URL` | Optional Python analysis endpoint base URL |
| `WHISPER_MODEL`, `ENABLE_EMOTION` | Python transcription model and optional confidence analysis; emotion support requires extra dependencies |
| `NODE_ENV` | Selects development middleware or production static serving |

Express listens on port 3000; Docker maps host port 8000 to it. Python listens on 8001 inside its container, and Compose sets `ANALYSIS_URL=http://analysis:8001` without publishing that port to the host. Compose connects to external Postgres and expects Ollama on the host when local coaching is used. A separately launched local Python service can be reached at `http://localhost:8001` when configured accordingly.

## Keeping this guide useful

When completing a task, update only the sections affected by changed behavior or structure. Keep this a concise map of the current application, not a task log or a list of proposed features. Link to detailed specifications instead of duplicating them. `AGENTS.md` discovery depends on the AI tool; tools without support must be explicitly directed to read this file.

Only `/interview/session` hides the sidebar and removes its layout offset. The `/interview` topic-selection page retains standard navigation. The reading pane keeps at least 220px of height and follows newly revealed text with Auto-scroll enabled by default; users can turn it off or choose Show full answer without ending their recording. Short windows allow outer scrolling rather than collapsing the text pane.

The home screen includes `src/components/ReadingDashboard.tsx`: a compact reading overview and the three latest readings below the practice cards and streak/cards-and-quiz goal. Full history lives at `/reading/history`, and dedicated reports at `/reading/reports/:attemptId` show transcript, delivery metrics, and coaching via `ReadingPages.tsx` and `ReadingReport.tsx`. Its authenticated `GET /api/reading-attempts` endpoint in `misc.ts` returns only the current user's latest 50 attempts, with no-store caching. `GET /api/reading-attempts/:attemptId` validates a positive Postgres integer ID and restricts reports to the authenticated owner, returning 404 for unavailable reports. Empty, loading, and retry states are explicit. These reports display saved analysis results, including provider metadata and word-level Azure feedback when available. Reading setup and the session emphasize guided repetition with a next-exercise card and a passage retry action.

## Domain access and staff analytics

Read [domain access and rollout](docs/domain-access.md) before changing authorization. `src/server/domain/` contains the additive schema, scope/content guards, request and assignment routes, and staff analytics. `src/views/StaffWorkspace.tsx` provides `/staff/overview`, `/staff/candidates`, `/staff/content`, `/staff/requests`, admin-only `/staff/usage`, candidate drilldowns and staff report URLs. Existing management/upload tools open from this workspace. Database roles remain `admin`, `manager` (Editor), and `viewer` (Candidate).

Candidates select one domain only in their first access-request form. The saved selection is read-only on subsequent visits; rejected requests resubmit the same domain. Admins/editors approve requests and assign candidates across domains. Role changes, domain administration, enforcement activation and allowance/cost information are admin-only. Staff actions are audited. Content may belong to multiple domains and may be archived.

Startup adds domain metadata and begins in preparation mode; never guess existing assignments or turn enforcement on automatically. The readiness checklist requires approved candidates, pending requests and all active content to have active domain assignments. Candidate content, AI reference lookup, cached audio and study writes are restricted on the server after activation. Content IDs survive sessions, and reference answers are resolved from the database. Client caches are removed; access-version changes invalidate sessions and redirect stale clients. `src/server/env.ts` must load before modules constructing the database pool. Async Express 4 routes use `safeRouter` or `wrap` so query failures reach error middleware.

Practice records retain domain-at-submission metadata. Historical unclassified readings remain unassigned; legacy daily activity is copied once with no domain, so it appears only in all-domain totals. Reading trends require the same candidate, content ID, reference hash, locale, provider and assessment version. Activity uses Asia/Kolkata dates; Azure allowance uses UTC months and reserved seconds, never invented currency amounts. Exclude staff/dev identities from candidate engagement.

Verify with `npm test`, `npm run lint`, `npm run build`, and `node --import tsx scripts/verify-domains.ts` when database access is available. The latter creates connection-local temporary fixture tables and rolls back; it does not assign real candidates or enable live restrictions. Python analysis and Azure recording/scoring behavior remain independent of this feature.

The staff Usage page supports case-insensitive name search across all returned users and displays ten people per page, with result counts and an explicit no-match state. Search resets pagination.

For staff dashboard work, apply the user's dashboard usability preferences: searchable lists, bounded pagination, visible stable sorting, and a period picker for time-based metrics. The reusable personal skill is `~/.codex/skills/dashboard-usability/SKILL.md`. Usage defaults to most reserved minutes, breaking ties by name and ID; it supports name ordering, least remaining allowance, and Recently added (descending account ID, since accounts have no creation timestamp). Its UTC month picker calls `/api/staff/usage?month=YYYY-MM`; month/sort selections persist in the URL. All usage counts and allowance totals refer to that month.

Usage also has an alphabetical Candidate dropdown across all loaded accounts, filtered by stable user ID with duplicate names distinguished. Selecting a candidate clears name search, resets pagination, and persists in the URL; All candidates removes this filter.

## Daily reading loop

Home passes currently accessible passages to `ReadingPracticePlan` through `ReadingDashboard`. It recommends the first accessible exercise from the personal revision queue by stable `content_id`, and offers a single-passage session plus the existing topic chooser. Never match historical question text to guess a content assignment. The separate two-reading daily goal counts saved attempts in the latest 50 using Asia/Kolkata boundaries; it is not a new streak or a cards/quiz contribution.

`ReadingNextStep` leads live and saved feedback with at most two supplied improvements and three distinct flagged words. Checkboxes are voluntary rehearsal markers, not scores. Live feedback reuses existing word playback and recording retry. Saved personal reports offer repeat only when their content ID remains accessible. The reading history/detail endpoints include content_id without changing ownership checks. Recording, scoring, and Azure cadence remain unchanged.

Responsive layout: `AppLayout` uses dynamic viewport height and the live `--sidebar-width` set by Sidebar, including its collapsed state. Bottom navigation occupies its own flex row; do not also reserve duplicate bottom padding. Home keeps greeting/search and practice cards stacked below the wide-desktop breakpoint; the reading-plan passage and action stack so buttons cannot squeeze passage text on mobile. Check actual CSS viewport dimensions when browser zoom changes the requested preview size.

## Practice setup, audio review and report saving

`InterviewSetup` offers Quick practice (one selected passage) and Full session (first ten filtered passages), full-list search, topic/estimated-difficulty filters, eight-item pagination, and a duration estimate including a second reading and review. Difficulty is a transparent heuristic based on answer/sentence length, not a technical skill rating.

Session entry requests microphone access with camera explicitly optional. `MicrophoneCheck` shows an input meter and supports a browser-local ten-second sample/replay; starting the interview is disabled during that sample. Sample audio is not submitted for analysis. Completed reading audio also stays in session memory for playback; model sentences can be played individually. Timeline seeking is manual, not forced word/sentence alignment. Revoke audio object URLs on replacement/unmount and stop playback before recording. Domain TTS guards allow exact sentences of accessible content as well as existing full text/words.

`saveReadingAttempt` returns a Promise and rejects failed responses. The session shows saving/saved/error states; retry reuses the same submission ID so the existing database uniqueness constraint prevents duplicates. Retry does not repeat analysis. Next/repeat actions wait for successful save. The admin-only `/staff/domains` page contains domain creation/rename/activation controls with assigned approved-candidate and active-content counts; Content no longer duplicates these controls.

## Personal revision queue

`/reading/revision` uses `ReadingRevisionQueue` and `buildRevisionQueue` (`src/lib/readingRevision.ts`). It derives suggestions from the latest saved attempt per accessible stable passage ID within the 50-attempt history window. Priority: current-passage flagged words, other feedback, passages absent from recent history, then refreshers; older attempts come first within each group, with stable ID ties. It does not compare scores across providers or claim mastery when words disappear from feedback. Unknown IDs and inaccessible content are excluded; flags are deduplicated and must occur in the current answer.

Home's next exercise now uses this queue. The queue provides eight-item pages, full-list search, topic/focus filters and source report links. Starting an exercise carries at most three words and two supplied improvements into session preparation for rehearsal. Query filters survive refresh via the URL; queue results are derived from authenticated history and current bootstrap content, with no separate persisted queue or completion claim.

Coach assignments: `PracticeAssignments` appears on candidate home and staff candidate/report pages. `src/server/domain/assignments.ts` implements owner-scoped reads and editor/admin creation/cancellation. `reading_assignments` is created additively with private access controls. Require explicit active candidate-domain-content membership even in preparation mode. Pending duplicates are blocked. The reading-save SQL uses one CTE to insert an attempt and complete matching pending assignments atomically; an idempotent replay never completes a newer assignment. Preserve the original assignment domain and mark changed-domain/content assignments unavailable, not completed. See `docs/domain-access.md` and database fixture checks in `scripts/verify-domains.ts`.


Verified save boundary: all successful `/api/ai/analyze-reading` paths issue a private persisted receipt via `readingReceipt.ts`. Receipts are deduplicated by user and audio/content/domain/reference fingerprint; receipt IDs cannot be used across users or scopes. New report saves require a receipt and use its server-stored analysis. A receipt saves once even with a different submission ID, and assignments complete only when the receipt was issued after assignment creation. Legacy unsaved analysis requires re-recording. Existing saved history is retained.

Assignments now use server-side search/status/pagination over the full history with totals; home requests one pending item and links to `/reading/assignments`. Do not reintroduce client-only filtering over a capped result set. Failed mutations retain their exact retry request; load errors reload data. Cancelling an assignment does not erase a coaching-note draft.

## Natural delivery coaching

`ReadingDeliveryCoach` leads live and saved reports with existing evidence-supported feedback and a sentence rehearsal exercise. Session preparation also offers the exercise before recording. `readingCoaching.ts` selects an unchanged reference sentence; punctuation breaks and user-selected emphasis are optional text-based rehearsal cues, never acoustic findings. New analyses attach `delivery_coaching` before the verified receipt is saved, preserving the original exercise in historical reports. Old reports without this field use general guidance, never a guessed reference from the transcript. Sentence rehearsal is voluntary and unscored; the retry records the full passage through the existing save/analysis flow. Gemini prompts prioritise concrete delivery exercises and forbid locating acoustic faults from aggregate metrics. No scoring, quota, or recording cadence changes.
