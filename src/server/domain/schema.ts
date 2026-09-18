// Additive startup migration, alongside the existing application's schema initializer.
export const domainSchema = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE email_allowlist ADD COLUMN IF NOT EXISTS added_by INTEGER REFERENCES users(id);
ALTER TABLE email_allowlist ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS performed_by INTEGER REFERENCES users(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target TEXT;
UPDATE audit_log SET performed_by=user_id WHERE performed_by IS NULL AND user_id IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookmarks' AND column_name='term_id') THEN
    DROP TABLE bookmarks;
    CREATE TABLE bookmarks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term_slug TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, term_slug)
    );
  END IF;
END $$;
ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS time_spent_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE access_requests r SET email=u.email FROM users u WHERE r.user_id=u.id AND r.email IS NULL;
UPDATE access_requests r SET user_id=u.id FROM users u WHERE r.email=u.email AND r.user_id IS NULL;
CREATE TABLE IF NOT EXISTS learning_domains (id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
INSERT INTO learning_domains(slug,name) VALUES ('python-development','Python Development'),('java-development','Java Development'),('azure-data-engineering','Azure Data Engineering'),('aws-data-engineering','AWS Data Engineering') ON CONFLICT(slug) DO NOTHING;
CREATE TABLE IF NOT EXISTS domain_settings (id INTEGER PRIMARY KEY CHECK(id=1), enforced BOOLEAN NOT NULL DEFAULT false);
INSERT INTO domain_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS domain_id INTEGER REFERENCES learning_domains(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
UPDATE users SET approved_at=NOW() WHERE is_allowed=1 AND approved_at IS NULL;
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS domain_id INTEGER REFERENCES learning_domains(id);
ALTER TABLE uploaded_terms ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE uploaded_interview ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS term_domains (content_id INTEGER REFERENCES uploaded_terms(id) ON DELETE CASCADE, domain_id INTEGER REFERENCES learning_domains(id), PRIMARY KEY(content_id,domain_id));
CREATE TABLE IF NOT EXISTS interview_domains (content_id INTEGER REFERENCES uploaded_interview(id) ON DELETE CASCADE, domain_id INTEGER REFERENCES learning_domains(id), PRIMARY KEY(content_id,domain_id));
ALTER TABLE reading_attempts ADD COLUMN IF NOT EXISTS domain_id INTEGER REFERENCES learning_domains(id);
ALTER TABLE reading_attempts ADD COLUMN IF NOT EXISTS content_id INTEGER REFERENCES uploaded_interview(id) ON DELETE SET NULL;
ALTER TABLE reading_attempts ADD COLUMN IF NOT EXISTS submission_id TEXT;
ALTER TABLE reading_attempts ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS reading_submission ON reading_attempts(user_id,submission_id) WHERE submission_id IS NOT NULL;
ALTER TABLE reading_analysis_jobs ADD COLUMN IF NOT EXISTS domain_id INTEGER REFERENCES learning_domains(id);
CREATE TABLE IF NOT EXISTS domain_activity (id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,domain_id INTEGER REFERENCES learning_domains(id),cards INTEGER NOT NULL,quizzes INTEGER NOT NULL,submission_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,submission_id));
ALTER TABLE domain_settings ADD COLUMN IF NOT EXISTS legacy_activity_imported BOOLEAN NOT NULL DEFAULT false;
INSERT INTO domain_activity(user_id,domain_id,cards,quizzes,submission_id,created_at)
SELECT user_id,NULL,cards_studied,quiz_answered,'legacy:'||user_id||':'||activity_date,activity_date::timestamp AT TIME ZONE 'Asia/Kolkata'
FROM daily_activity WHERE (cards_studied>0 OR quiz_answered>0) AND NOT (SELECT legacy_activity_imported FROM domain_settings WHERE id=1)
ON CONFLICT(user_id,submission_id) DO NOTHING;
UPDATE domain_settings SET legacy_activity_imported=true WHERE id=1;
CREATE TABLE IF NOT EXISTS domain_progress (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 domain_id INTEGER REFERENCES learning_domains(id),domain_key INTEGER GENERATED ALWAYS AS (COALESCE(domain_id,0)) STORED,
 module TEXT NOT NULL,snapshot JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,domain_key,module)
);
CREATE INDEX IF NOT EXISTS domain_activity_date ON domain_activity(domain_id,created_at);
CREATE INDEX IF NOT EXISTS reading_domain_date ON reading_attempts(domain_id,created_at);
CREATE TABLE IF NOT EXISTS reading_receipts (
 id UUID PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content_id INTEGER REFERENCES uploaded_interview(id) ON DELETE SET NULL,domain_id INTEGER REFERENCES learning_domains(id),
 reference_hash TEXT,fingerprint TEXT NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,fingerprint)
);
ALTER TABLE reading_attempts ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES reading_receipts(id);
CREATE UNIQUE INDEX IF NOT EXISTS reading_attempt_receipt ON reading_attempts(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS reading_assignments (
 id SERIAL PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 assigned_by INTEGER NOT NULL REFERENCES users(id), domain_id INTEGER NOT NULL REFERENCES learning_domains(id),
 content_id INTEGER REFERENCES uploaded_interview(id) ON DELETE SET NULL, question TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
 completed_attempt_id INTEGER REFERENCES reading_attempts(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reading_assignment_pending ON reading_assignments(candidate_id,content_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS reading_assignment_candidate ON reading_assignments(candidate_id,status,created_at DESC);
DO $$ DECLARE t TEXT; r TEXT; BEGIN
FOREACH t IN ARRAY ARRAY['reading_receipts','reading_assignments','learning_domains','domain_settings','term_domains','interview_domains','domain_activity','domain_progress','uploaded_terms','uploaded_interview','access_requests','reading_attempts','users','email_allowlist','audit_log','session_state','user_progress','card_reviews','daily_activity'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,r); END IF;
 END LOOP;
END LOOP; END $$;
`;
