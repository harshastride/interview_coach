# Reading Practice — Architecture Spec

**Feature:** AI-coached read-aloud training inside Interview Practice sessions.
**Goal:** Candidates learn to speak fluently by *reading displayed answers aloud repeatedly*, with objective, per-attempt feedback that makes improvement visible (`62 → 74 → 85`).

**Current extension:** Opt-in Azure checkpoints, local baselines and Gemini text coaching are implemented; see [Azure setup and scoring](azure-reading.md). The legacy scoring descriptions below apply when Azure mode is disabled. Hybrid reports do not compare scores across providers.

**Status:** V1 + V2 implemented 2026-07-02. V2 service lives in `analysis/`; enable via `ANALYSIS_URL` (set automatically in docker-compose).

---

## 1. Locked decisions

| Decision | Choice |
|---|---|
| Learning model | Reading practice with repetition — **no** ideal-answer comparison, no free-form answering (v1) |
| Repetition | **Free repetition** — candidate repeats as they wish, best score shown; no mastery gate |
| Question asking (TTS) | **Unchanged** — existing Gemini TTS + Postgres `tts_cache` |
| Speech capture | Browser **`MediaRecorder`** (raw audio) — browser SpeechRecognition ruled out (accent accuracy, hides fillers, no Firefox) |
| Analysis v1 | **Gemini 2.5 Flash** hears the raw audio (transcript + scores + delivery) — one new endpoint |
| Analysis v2 | Local Python service: faster-whisper + Parselmouth/audEERING + Ollama coaching — $0/attempt, deterministic |
| Real-time / conversational AI | **Parked as v3** (Gemini Live API) — not needed for reading practice |

---

## 2. User flow (per question)

**Updated flow:** Recording starts automatically when question playback finishes and the answer begins appearing. The answer continues revealing during recording; reaching the end of the text does not submit the attempt. Recording controls remain below the reading pane from the start. Desktop places reading text and recorded transcript on the left and metrics/coaching on the right, with compact avatar and camera previews in the header; mobile stacks the panels. Press **Done — Show Metrics** after reading aloud to analyze the recording, or use Cancel to discard it. A failed/cancelled start requires a manual retry. The 180-second cap still auto-submits. Navigation discards unfinished work and ignores late analysis results. Feedback also shows the recorded transcript below the reference answer.

```
1. AI asks question aloud            (existing TTS — unchanged)
2. Answer text begins appearing      (typewriter continues during recording)
3. Recording starts automatically    → MediaRecorder captures candidate reading aloud
4. [Done — Show Metrics] → audio sent for analysis   state: analyzing
5. Feedback card    → scores, missed words, pace, tips
6. [Read Again]     → back to 3, attempt counter increments
   [Next Question]  → always enabled (free repetition)
```

### UI states in `InterviewSession`

`practice: 'idle' | 'starting' | 'recording' | 'analyzing' | 'feedback'`

- **idle** — manual `[🎤 Start Reading]` retry below the reading pane after cancellation/failure. If prior attempts exist: `3 attempts · best 78` chip.
- **starting** — preparing the microphone, with Cancel available; playback is disabled.
- **recording** — pulsing mic, elapsed timer, `[■ Done]`. Max length **3 min** (auto-stop). "Listen" TTS buttons disabled while recording.
- **analyzing** — spinner, "Analyzing your reading…" (2–5 s). Avatar state: `thinking`.
- **feedback** — feedback card (below). `[Read Again]` and `[Next Question]` both enabled.

State resets on question navigation; attempt history persists (DB + in-session map).

### Feedback card contents

- **Overall score** (large) + delta vs. previous attempt (`▲ +12`)
- Three bars: **accuracy / fluency / completeness** (0–100)
- **Missed or mispronounced words** as chips — tapping a chip plays its pronunciation via existing TTS
- **Delivery row:** `WPM 182 (target 140–160)` · `fillers: 6` · `long pauses: 4` · confidence note
- **Tips:** 2–3 specific improvements + one encouraging coaching sentence
- **Attempt history:** `62 → 74 → 85` (this question, this session)

---

## 3. V1 architecture

### 3.1 New pieces (everything else exists)

| Piece | Location | Size |
|---|---|---|
| `useAnswerRecorder` hook | `src/hooks/useAnswerRecorder.ts` | ~60 lines |
| `POST /api/ai/analyze-reading` | `src/server/routes/ai.ts` | ~90 lines |
| `reading_attempts` table | `src/server/db/init.ts` | 1 table |
| `POST /api/study/reading-attempt` (persist) | `src/server/routes/study.ts` or `misc.ts` | ~30 lines |
| Practice panel + feedback card UI | `src/views/InterviewSession.tsx` | ~250 lines |
| Session-complete stats (avg best score, total reps) | same file | ~20 lines |

### 3.2 `useAnswerRecorder` hook

- Reuses the mic `MediaStream` already acquired by InterviewSession (`getUserMedia`).
- `MediaRecorder` with `audio/webm;codecs=opus` (fallback `audio/mp4` for Safari). ~100 KB / 30 s.
- API: `{ isRecording, elapsedSec, start(), stop(): Promise<{ blob, durationSec }>, cancel() }`
- Hard cap 180 s → auto-stop. Cleanup on unmount.

### 3.3 `POST /api/ai/analyze-reading`

**Request**
```json
{
  "audio": "<base64>",
  "mimeType": "audio/webm",
  "referenceText": "<the on-screen answer>",
  "question": "<the interview question>",
  "durationSec": 42.5
}
```

**Response** — this contract is the stable interface; v2 swaps the implementation behind it without frontend changes.
```json
{
  "transcript": "verbatim, fillers included",
  "scores": { "overall": 74, "accuracy": 80, "fluency": 65, "completeness": 90 },
  "missed_words": ["idempotent", "partitioning"],
  "delivery": {
    "wpm": 182,
    "filler_count": 6,
    "long_pauses": 4,
    "pace": "fast",
    "confidence_note": "Voice drops at sentence ends; long pauses before technical terms."
  },
  "strengths": ["Strong, clear opening"],
  "improvements": ["Slow down on technical terms", "Read the final sentence — it was skipped"],
  "coaching": "Good progress — one more repetition focusing on the last two sentences."
}
```

**Implementation notes**
- Single Gemini `generateContent` call: audio `inlineData` + prompt. Model hears the audio directly (tone, pauses, fillers) — not a transcript-only judgment.
- Use `responseMimeType: "application/json"` + `responseSchema` in the config — guaranteed-parseable output; do **not** repeat the regex-cleanup pattern used by `evaluate-answer`.
- `wpm` computed server-side: `transcript word count / durationSec * 60` (deterministic, not model-estimated). `filler_count` counted from the verbatim transcript. `long_pauses` is a model estimate in v1 (exact in v2 via word timestamps).
- Reuse `getGenAI()`, `requireAuth`, and the existing rate-limit middleware. Retry once on 429/5xx, then return a friendly error.
- Cost: ~30–60 s audio ≈ 1–2 k input tokens on Flash → well under $0.001/attempt.

### 3.4 Persistence

```sql
CREATE TABLE IF NOT EXISTS reading_attempts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_ref  TEXT NOT NULL,          -- question text (uploaded_interview has no stable id exposed to the client)
  role          TEXT,
  attempt_no    INTEGER NOT NULL,
  overall_score INTEGER, accuracy INTEGER, fluency INTEGER, completeness INTEGER,
  wpm           INTEGER, filler_count INTEGER,
  transcript    TEXT,
  feedback      JSONB,                  -- full analyze-reading response
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reading_attempts_user ON reading_attempts (user_id, created_at);
```

- Written fire-and-forget after each successful analysis (failure to persist never blocks the feedback UI).
- Audio blobs are **not** stored (privacy + size); transcript + scores suffice for progress tracking.
- Enables: candidate progress over days; trainer view (existing admin/manager roles) of who practices and who is stuck. Trainer dashboard itself is a follow-up, not v1.

### 3.5 Edge cases

- **Recording < 2 s or empty transcript** → "We couldn't hear you — check your mic and try again." No attempt recorded.
- **Mic denied** → practice panel shows enable-mic prompt (session already handles audio-only fallback).
- **Analysis failure after retry** → friendly error + `[Try Again]`; recording is kept in memory so the candidate doesn't have to re-read.
- **Navigation / unmount mid-recording** → recorder cancelled, no orphan streams.
- **TTS ↔ recording conflict** → starting a recording stops TTS playback; Listen buttons disabled while recording.

---

## 4. V2 — Local analysis service (after V1 proves the loop)

One new Docker Compose service (`analysis`, Python/FastAPI). Same request/response contract as §3.3 — the Express route proxies to it based on env (`ANALYSIS_PROVIDER=local`), frontend untouched.

| Stage | Tool | Replaces | Gain |
|---|---|---|---|
| Verbatim transcript + word timestamps | **faster-whisper** (option: AI4Bharat IndicWhisper for Indian-accented English) | Gemini STT | Accent accuracy, exact pause/WPM from timestamps, $0 |
| Delivery metrics | **Parselmouth (Praat)**: pitch stability, jitter/shimmer, intensity; pauses/WPM from timestamps | Gemini estimates | Deterministic — same audio, same score; repetition progress is trustworthy |
| Confidence signal | **audEERING wav2vec2** emotion model → arousal / valence / **dominance** | Gemini's impression | Published, reproducible method |
| Coaching text | **Ollama** (Qwen 2.5 7B / Llama 3.1 8B; structured outputs w/ JSON schema) — plumbing already exists via `AI_PROVIDER=local` | Gemini Flash | $0, offline |

Marginal cost per attempt: **$0**. Gemini remains as automatic fallback (burst load / service down).

Honest framing for scores: the system measures **acoustic markers of confident vs. nervous delivery** (pace, pauses, pitch stability, fillers, trailing intonation) — it does not claim to read emotions.

---

## 5. V3 — Parked: conversational mock interviewer

Free-form Q&A where the AI asks follow-ups based on what the candidate said. Requires streaming (Gemini Live API to pilot; Pipecat/LiveKit + local stack if self-hosting later). Out of scope until reading practice is adopted.

---

## 6. Build order (V1)

1. `useAnswerRecorder` hook + recording UI states (testable without AI: play back own recording)
2. `/api/ai/analyze-reading` endpoint + `responseSchema` (testable via curl with a sample clip)
3. Feedback card + repetition loop in InterviewSession
4. `reading_attempts` table + persist call + session-complete stats
5. Polish: missed-word pronunciation chips, attempt-history display, error states

### Natural delivery coaching

The live and saved report starts with a speaking-coach panel: one supplied strength, at most two supplied improvements, coaching notes, and a suggested sentence exercise. Candidates can choose up to three emphasis words and toggle punctuation-based phrase cues. These choices are practice guidance, not detected errors. The model-example button in a live session sends the unchanged authorised reference sentence to existing playback. Preparation offers the same exercise before recording; model playback is unavailable during the microphone sample.

New verified analyses preserve a versioned `delivery_coaching` exercise in existing feedback JSON, without a schema migration. Historical reports lacking an exercise show general guidance. Full-passage retries retain existing saving and recording behaviour; sentence rehearsals are not separately recorded or scored. Guidance does not claim naturalness, confidence, technical understanding, or improvement from text alone. Prompts distinguish audio evidence from text-based phrasing suggestions, including the inability to locate pauses using aggregate counts.
