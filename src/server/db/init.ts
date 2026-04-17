import { pgPool } from "./pool.ts";

export async function initPg() {
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tts_cache (
        term TEXT PRIMARY KEY,
        audio_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        google_id  TEXT UNIQUE NOT NULL,
        email      TEXT UNIQUE NOT NULL,
        name       TEXT NOT NULL,
        avatar_url TEXT,
        role       TEXT NOT NULL DEFAULT 'viewer',
        is_allowed INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_allowlist (
        email      TEXT PRIMARY KEY,
        added_by   INTEGER REFERENCES users(id),
        added_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS uploaded_terms (
        id         SERIAL PRIMARY KEY,
        t          TEXT NOT NULL,
        d          TEXT NOT NULL,
        l          INTEGER NOT NULL,
        c          TEXT NOT NULL,
        added_by   INTEGER REFERENCES users(id),
        added_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS uploaded_interview (
        id           SERIAL PRIMARY KEY,
        question     TEXT NOT NULL,
        ideal_answer TEXT NOT NULL,
        role         TEXT NOT NULL,
        company      TEXT NOT NULL,
        category     TEXT NOT NULL DEFAULT 'General',
        added_by     INTEGER REFERENCES users(id),
        added_at     TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS access_requests (
        id           SERIAL PRIMARY KEY,
        email        TEXT NOT NULL,
        name         TEXT NOT NULL,
        reason       TEXT,
        status       TEXT DEFAULT 'pending',
        requested_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id           SERIAL PRIMARY KEY,
        performed_by INTEGER REFERENCES users(id),
        action       TEXT NOT NULL,
        target       TEXT,
        detail       TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_progress (
        user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        module             TEXT NOT NULL DEFAULT 'home',
        total_terms        INTEGER NOT NULL DEFAULT 0,
        completed_terms    INTEGER NOT NULL DEFAULT 0,
        quiz_correct       INTEGER NOT NULL DEFAULT 0,
        quiz_incorrect     INTEGER NOT NULL DEFAULT 0,
        interview_total    INTEGER NOT NULL DEFAULT 0,
        interview_answered INTEGER NOT NULL DEFAULT 0,
        updated_at         TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS card_reviews (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        term_slug  TEXT NOT NULL,
        ease_factor REAL NOT NULL DEFAULT 2.5,
        interval_days INTEGER NOT NULL DEFAULT 0,
        repetitions INTEGER NOT NULL DEFAULT 0,
        next_review DATE NOT NULL DEFAULT CURRENT_DATE,
        last_rating INTEGER,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, term_slug)
      );

      CREATE TABLE IF NOT EXISTS daily_activity (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        cards_studied INTEGER NOT NULL DEFAULT 0,
        quiz_answered INTEGER NOT NULL DEFAULT 0,
        time_spent_sec INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, activity_date)
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        term_slug  TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, term_slug)
      );

      CREATE TABLE IF NOT EXISTS session_state (
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module        TEXT NOT NULL,
        state_json    JSONB NOT NULL DEFAULT '{}',
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(user_id, module)
      );
    `);

    // Add category column for existing DBs that had uploaded_interview before
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'uploaded_interview' AND column_name = 'category') THEN
          ALTER TABLE uploaded_interview ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
        END IF;
      END $$;
    `);

    // Phase 3: Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_uploaded_terms_cat_level ON uploaded_terms (c, l);
      CREATE INDEX IF NOT EXISTS idx_uploaded_interview_category ON uploaded_interview (category);
      CREATE INDEX IF NOT EXISTS idx_uploaded_interview_role_company ON uploaded_interview (role, company);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status, requested_at);
      CREATE INDEX IF NOT EXISTS idx_user_progress_updated ON user_progress (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_card_reviews_user_next ON card_reviews (user_id, next_review);
      CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity (user_id, activity_date DESC);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks (user_id);
    `);

    // Phase 3: TTS cache cleanup – remove entries older than 90 days
    await client.query(`
      DELETE FROM tts_cache WHERE created_at < NOW() - INTERVAL '90 days';
    `);
  } finally {
    client.release();
  }
}
