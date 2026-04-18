import { pgPool } from "./pool.ts";

export async function initPg() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required and should point to your Supabase Postgres instance.");
  }

  const client = await pgPool.connect();
  try {
    // Quick check — if users table exists, skip full init (already done)
    const check = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
    `);
    if (check.rows.length > 0) {
      return; // Tables already exist, skip init
    }

    // First-time setup: create all tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS tts_cache (
        term TEXT PRIMARY KEY,
        audio_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        google_id     TEXT UNIQUE NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        avatar_url    TEXT,
        role          TEXT NOT NULL DEFAULT 'viewer',
        is_allowed    INTEGER DEFAULT 0,
        last_login    TIMESTAMPTZ DEFAULT NOW()
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
        id            SERIAL PRIMARY KEY,
        question      TEXT NOT NULL,
        ideal_answer  TEXT NOT NULL,
        role          TEXT NOT NULL,
        company       TEXT NOT NULL,
        category      TEXT NOT NULL DEFAULT 'General',
        added_by      INTEGER REFERENCES users(id),
        added_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_allowlist (
        email TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id),
        action      TEXT NOT NULL,
        detail      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS access_requests (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id),
        name         TEXT NOT NULL,
        reason       TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_progress (
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        module        TEXT NOT NULL DEFAULT 'global',
        total_terms   INTEGER DEFAULT 0,
        completed_terms INTEGER DEFAULT 0,
        quiz_correct  INTEGER DEFAULT 0,
        quiz_incorrect INTEGER DEFAULT 0,
        interview_total INTEGER DEFAULT 0,
        interview_answered INTEGER DEFAULT 0,
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(user_id, module)
      );

      CREATE TABLE IF NOT EXISTS card_reviews (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        term_id     INTEGER NOT NULL REFERENCES uploaded_terms(id) ON DELETE CASCADE,
        ease_factor REAL NOT NULL DEFAULT 2.5,
        interval_d  REAL NOT NULL DEFAULT 0,
        repetitions INTEGER NOT NULL DEFAULT 0,
        next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_review TIMESTAMPTZ,
        UNIQUE(user_id, term_id)
      );

      CREATE TABLE IF NOT EXISTS daily_activity (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        cards_studied INTEGER NOT NULL DEFAULT 0,
        quiz_answered INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, activity_date)
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id        SERIAL PRIMARY KEY,
        user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        term_id   INTEGER NOT NULL REFERENCES uploaded_terms(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, term_id)
      );

      CREATE TABLE IF NOT EXISTS session_state (
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module        TEXT NOT NULL,
        state_json    JSONB NOT NULL DEFAULT '{}',
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(user_id, module)
      );

      -- Indexes
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
  } finally {
    client.release();
  }
}
