import "dotenv/config";
import dotenv from "dotenv";
// Load .env.local so AI Studio / local dev can set GEMINI_API_KEY there
dotenv.config({ path: ".env.local", override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import rateLimit from "express-rate-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pgPool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://flashcards:flashcards@localhost:5432/flashcards",
});

const PgSession = connectPgSimple(session);

async function initPg() {
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
    `);
  } finally {
    client.release();
  }
}

// Types for request user
interface DbUser {
  id: number;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  is_allowed: number;
}
declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

async function audit(
  userId: number,
  action: string,
  target: string,
  detail?: object
) {
  await pgPool.query(
    "INSERT INTO audit_log (performed_by, action, target, detail) VALUES ($1, $2, $3, $4)",
    [userId, action, target, detail ? JSON.stringify(detail) : null]
  );
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const u = req.user as DbUser;
  if (!u.is_allowed) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if ((req.user as DbUser).role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

function requireUploader(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const role = (req.user as DbUser).role;
  if (role !== "admin" && role !== "manager") {
    return res.status(403).json({ error: "Admin or manager only" });
  }
  next();
}

const ALL_CATEGORIES = [
  "Cloud & Internet Basics", "Azure Basics", "Data Basics", "SQL Fundamentals",
  "Python Basics", "File Formats", "Python Intermediate", "Python Key Libraries",
  "Azure Data Services", "ETL & Data Integration", "Apache Spark Core",
  "Spark Streaming", "Delta Lake", "Azure Databricks", "Data Architecture Concepts",
  "SQL Advanced", "Streaming & Messaging", "dbt & Orchestration",
  "Data Quality & Governance", "Security & Access", "DevOps & Version Control",
  "Monitoring & Observability", "Networking & Protocols", "Power BI & Reporting",
];
const VALID_LEVELS = [2, 3, 4, 5];

async function startServer() {
  await initPg().catch((err) => {
    console.error("Failed to init PostgreSQL:", err);
    process.exit(1);
  });

  const app = express();
  app.set("trust proxy", 1);
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
  });
  app.use("/auth/", authLimiter);

  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    standardHeaders: true,
  });
  app.use("/api/admin/", uploadLimiter);

  const sessionStore = new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
  });

  const sessionSecret = process.env.SESSION_SECRET || "local-dev-session-secret";
  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET not set; using local development secret.");
  }

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.APP_URL?.startsWith("https") === true,
        sameSite: "lax",
      },
    })
  );

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.APP_URL || "http://localhost:3000"}/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value ?? "";
            const name = profile.displayName ?? "User";
            const avatarUrl = profile.photos?.[0]?.value ?? null;

            const userRes = await pgPool.query(
              "SELECT * FROM users WHERE google_id = $1",
              [googleId]
            );
            let user = userRes.rows[0] as DbUser | undefined;
            const countRes = await pgPool.query("SELECT COUNT(*) as c FROM users");
            const countRow = countRes.rows[0] as { c: number | string };
            const count = parseInt(String(countRow.c), 10);

            if (!user) {
              const allowRes = await pgPool.query(
                "SELECT 1 FROM email_allowlist WHERE email = $1",
                [email]
              );
              const allowRow = allowRes.rows[0];
              const role = count === 0 ? "admin" : "viewer";
              const isAllowed = count === 0 ? 1 : allowRow ? 1 : 0;
              await pgPool.query(
                `INSERT INTO users (google_id, email, name, avatar_url, role, is_allowed, last_login)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [googleId, email, name, avatarUrl, role, isAllowed]
              );
              const newUserRes = await pgPool.query(
                "SELECT * FROM users WHERE google_id = $1",
                [googleId]
              );
              user = newUserRes.rows[0] as DbUser;
            } else {
              const allowRes = await pgPool.query(
                "SELECT 1 FROM email_allowlist WHERE email = $1",
                [email]
              );
              const isAllowed = user.is_allowed ? 1 : allowRes.rows[0] ? 1 : 0;
              await pgPool.query(
                "UPDATE users SET name = $1, avatar_url = $2, last_login = NOW(), is_allowed = $3 WHERE id = $4",
                [name, avatarUrl, isAllowed, user.id]
              );
              const upRes = await pgPool.query(
                "SELECT * FROM users WHERE google_id = $1",
                [googleId]
              );
              user = upRes.rows[0] as DbUser;
            }
            done(null, user);
          } catch (err) {
            done(err as Error, undefined);
          }
        }
      )
    );
  } else {
    console.warn("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set; OAuth login disabled.");
  }

  passport.serializeUser((user: Express.User, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [id]);
      const user = (res.rows[0] as DbUser | undefined) || null;
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
  app.use(passport.initialize());
  app.use(passport.session());

  // —— Auth routes ——
  app.get("/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).send("OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env");
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });
  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { session: true }),
    (req, res, next) => {
      const u = req.user as DbUser;
      req.session.save((err) => {
        if (err) return next(err);
        if (u?.is_allowed) {
          res.redirect("/");
        } else {
          res.redirect("/access-denied");
        }
      });
    }
  );

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated?.()) {
      return res.json({ authenticated: false });
    }
    const u = req.user as DbUser;
    res.json({
      authenticated: true,
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        avatar_url: u.avatar_url,
        role: u.role,
        isAllowed: !!u.is_allowed,
      },
    });
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  // —— User progress snapshot (auth required) ——
  app.post("/api/progress", requireAuth, async (req, res) => {
    const userId = (req.user as DbUser).id;
    const {
      module,
      total_terms,
      completed_terms,
      quiz_correct,
      quiz_incorrect,
      interview_total,
      interview_answered,
    } = req.body ?? {};

    const asNonNegInt = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.floor(n));
    };

    const normalizedModule = String(module || "home").slice(0, 32);
    const totalTerms = asNonNegInt(total_terms);
    const completedTerms = Math.min(asNonNegInt(completed_terms), totalTerms);
    const quizCorrect = asNonNegInt(quiz_correct);
    const quizIncorrect = asNonNegInt(quiz_incorrect);
    const interviewTotal = asNonNegInt(interview_total);
    const interviewAnswered = Math.min(asNonNegInt(interview_answered), interviewTotal);

    await pgPool.query(
      `INSERT INTO user_progress
        (user_id, module, total_terms, completed_terms, quiz_correct, quiz_incorrect, interview_total, interview_answered, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         module = EXCLUDED.module,
         total_terms = EXCLUDED.total_terms,
         completed_terms = EXCLUDED.completed_terms,
         quiz_correct = EXCLUDED.quiz_correct,
         quiz_incorrect = EXCLUDED.quiz_incorrect,
         interview_total = EXCLUDED.interview_total,
         interview_answered = EXCLUDED.interview_answered,
         updated_at = NOW()`,
      [
        userId,
        normalizedModule,
        totalTerms,
        completedTerms,
        quizCorrect,
        quizIncorrect,
        interviewTotal,
        interviewAnswered,
      ]
    );
    res.json({ ok: true });
  });

  // —— Content (merged at runtime) ——
  app.get("/api/content/terms", requireAuth, async (req, res) => {
    const result = await pgPool.query("SELECT t, d, l, c FROM uploaded_terms");
    res.json(result.rows);
  });
  app.get("/api/content/interview", requireAuth, async (req, res) => {
    const result = await pgPool.query(
      "SELECT question, ideal_answer, role, company FROM uploaded_interview"
    );
    res.json(result.rows);
  });

  // —— TTS (auth required, PostgreSQL storage) ——
  app.get("/api/tts/:term", requireAuth, async (req, res) => {
    try {
      const term = decodeURIComponent(req.params.term).toLowerCase().trim();
      const result = await pgPool.query(
        "SELECT audio_data FROM tts_cache WHERE term = $1",
        [term]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Not found" });
      }
      const audioBuffer: Buffer = result.rows[0].audio_data;
      return res.json({ audio: audioBuffer.toString("base64") });
    } catch (e) {
      console.error("TTS GET error:", e);
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/tts", requireAuth, async (req, res) => {
    const { term, audio } = req.body;
    if (!term || !audio) {
      return res.status(400).json({ error: "Missing term or audio" });
    }
    const normalized = String(term).toLowerCase().trim();
    try {
      const pcmBuffer = Buffer.from(audio, "base64");
      await pgPool.query(
        `INSERT INTO tts_cache (term, audio_data) VALUES ($1, $2)
         ON CONFLICT (term) DO UPDATE SET audio_data = $2, created_at = NOW()`,
        [normalized, pcmBuffer]
      );
      return res.json({ status: "ok" });
    } catch (e) {
      console.error("TTS save error:", e);
      return res.status(500).json({ error: "Failed to save" });
    }
  });

  // —— Access request (signed-in but not allowed) ——
  app.post("/api/access-request", async (req, res) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { name, reason } = req.body;
    const email = (req.user as DbUser).email;
    if (!name?.trim()) {
      return res.status(400).json({ error: "Name required" });
    }
    await pgPool.query(
      "INSERT INTO access_requests (email, name, reason, status) VALUES ($1, $2, $3, 'pending')",
      [email, String(name).trim(), reason ? String(reason).trim() : null]
    );
    res.json({ ok: true });
  });

  // —— Admin: users ——
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const result = await pgPool.query(
      "SELECT id, email, name, avatar_url, role, is_allowed, created_at, last_login FROM users ORDER BY created_at"
    );
    res.json(result.rows);
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (id === (req.user as DbUser).id) {
      return res.status(400).json({ error: "Cannot modify your own account" });
    }
    const { role, is_allowed } = req.body;
    if (role !== undefined) {
      if (!["admin", "manager", "viewer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      await pgPool.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
      await audit((req.user as DbUser).id, "change_role", String(id), { role });
    }
    if (is_allowed !== undefined) {
      await pgPool.query("UPDATE users SET is_allowed = $1 WHERE id = $2", [
        is_allowed ? 1 : 0,
        id,
      ]);
      await audit(
        (req.user as DbUser).id,
        is_allowed ? "grant_access" : "revoke_access",
        String(id)
      );
    }
    res.json({ ok: true });
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (id === (req.user as DbUser).id) {
      return res.status(400).json({ error: "Cannot remove your own account" });
    }
    await pgPool.query("UPDATE users SET is_allowed = 0 WHERE id = $1", [id]);
    await audit((req.user as DbUser).id, "revoke_access", String(id));
    res.json({ ok: true });
  });

  // —— Admin: allowlist ——
  app.get("/api/admin/allowlist", requireAdmin, async (req, res) => {
    const result = await pgPool.query(
      "SELECT email, added_at FROM email_allowlist ORDER BY added_at"
    );
    res.json(result.rows);
  });

  app.post("/api/admin/allowlist", requireAdmin, async (req, res) => {
    const { email } = req.body;
    if (!email?.trim()) {
      return res.status(400).json({ error: "Email required" });
    }
    const e = String(email).trim().toLowerCase();
    await pgPool.query(
      `INSERT INTO email_allowlist (email, added_by, added_at) VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET added_by = $2, added_at = NOW()`,
      [e, (req.user as DbUser).id]
    );
    await pgPool.query("UPDATE users SET is_allowed = 1 WHERE email = $1", [e]);
    await audit((req.user as DbUser).id, "allowlist_add", e);
    res.json({ ok: true });
  });

  app.delete("/api/admin/allowlist/:email", requireAdmin, async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    await pgPool.query("DELETE FROM email_allowlist WHERE email = $1", [email]);
    await pgPool.query("UPDATE users SET is_allowed = 0 WHERE email = $1", [
      email,
    ]);
    await audit((req.user as DbUser).id, "allowlist_remove", email);
    res.json({ ok: true });
  });

  // —— Admin: access requests ——
  app.get("/api/admin/requests", requireAdmin, async (req, res) => {
    const result = await pgPool.query(
      "SELECT * FROM access_requests WHERE status = 'pending' ORDER BY requested_at"
    );
    res.json(result.rows);
  });

  app.post("/api/admin/requests/:id/approve", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rowRes = await pgPool.query(
      "SELECT * FROM access_requests WHERE id = $1 AND status = 'pending'",
      [id]
    );
    const row = rowRes.rows[0] as { id: number; email: string } | undefined;
    if (!row) {
      return res.status(404).json({ error: "Request not found" });
    }
    await pgPool.query(
      `INSERT INTO email_allowlist (email, added_by, added_at) VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET added_by = $2, added_at = NOW()`,
      [row.email, (req.user as DbUser).id]
    );
    await pgPool.query("UPDATE users SET is_allowed = 1 WHERE email = $1", [
      row.email,
    ]);
    await pgPool.query(
      "UPDATE access_requests SET status = 'approved' WHERE id = $1",
      [id]
    );
    await audit((req.user as DbUser).id, "approve_access_request", row.email);
    res.json({ ok: true });
  });

  app.post("/api/admin/requests/:id/reject", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rowRes = await pgPool.query(
      "SELECT * FROM access_requests WHERE id = $1 AND status = 'pending'",
      [id]
    );
    const row = rowRes.rows[0] as { email: string } | undefined;
    if (!row) return res.status(404).json({ error: "Request not found" });
    await pgPool.query(
      "UPDATE access_requests SET status = 'rejected' WHERE id = $1",
      [id]
    );
    await audit((req.user as DbUser).id, "reject_access_request", row.email);
    res.json({ ok: true });
  });

  // —— Admin: audit log ——
  app.get("/api/admin/audit", requireAdmin, async (req, res) => {
    const result = await pgPool.query(
      `SELECT a.id, a.action, a.target, a.detail, a.created_at, u.email as actor_email
       FROM audit_log a LEFT JOIN users u ON a.performed_by = u.id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  });

  // —— Admin/Manager: progress dashboard ——
  app.get("/api/admin/progress", requireUploader, async (req, res) => {
    const result = await pgPool.query(
      `SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.is_allowed,
          u.last_login,
          p.module,
          p.total_terms,
          p.completed_terms,
          p.quiz_correct,
          p.quiz_incorrect,
          p.interview_total,
          p.interview_answered,
          p.updated_at,
          CASE
            WHEN COALESCE(p.total_terms, 0) > 0
              THEN ROUND((p.completed_terms::numeric * 100.0) / p.total_terms, 1)
            ELSE 0
          END AS flashcard_completion_pct,
          CASE
            WHEN COALESCE(p.interview_total, 0) > 0
              THEN ROUND((p.interview_answered::numeric * 100.0) / p.interview_total, 1)
            ELSE 0
          END AS interview_completion_pct
       FROM users u
       LEFT JOIN user_progress p ON p.user_id = u.id
       ORDER BY COALESCE(p.updated_at, u.last_login, u.created_at) DESC`
    );
    res.json(result.rows);
  });

  // —— Upload: single term ——
  app.post("/api/admin/terms", requireUploader, async (req, res) => {
    const { t, d, l, c } = req.body;
    if (!t?.trim() || !d?.trim() || !c?.trim()) {
      return res.status(400).json({ error: "term, definition, category required" });
    }
    const level = Number(l);
    if (!VALID_LEVELS.includes(level)) {
      return res.status(400).json({ error: "level must be 2, 3, 4, or 5" });
    }
    if (!ALL_CATEGORIES.includes(c.trim())) {
      return res.status(400).json({ error: "Invalid category" });
    }
    await pgPool.query(
      "INSERT INTO uploaded_terms (t, d, l, c, added_by) VALUES ($1, $2, $3, $4, $5)",
      [t.trim(), d.trim(), level, c.trim(), (req.user as DbUser).id]
    );
    await audit((req.user as DbUser).id, "upload_term", t.trim());
    res.json({ ok: true });
  });

  // —— Upload: bulk terms ——
  app.post("/api/admin/terms/bulk", requireUploader, async (req, res) => {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" });
    }
    const userId = (req.user as DbUser).id;
    let imported = 0;
    for (const { t, d, l, c } of entries) {
      if (!t?.trim() || !d?.trim() || !VALID_LEVELS.includes(Number(l)) || !c?.trim())
        continue;
      await pgPool.query(
        "INSERT INTO uploaded_terms (t, d, l, c, added_by) VALUES ($1, $2, $3, $4, $5)",
        [t.trim(), d.trim(), Number(l), (c as string).trim(), userId]
      );
      imported++;
    }
    await audit((req.user as DbUser).id, "upload_terms_bulk", String(entries.length));
    res.json({ ok: true, imported });
  });

  app.get("/api/admin/terms", requireUploader, async (req, res) => {
    const result = await pgPool.query(
      "SELECT id, t, d, l, c, added_at FROM uploaded_terms ORDER BY added_at DESC"
    );
    res.json(result.rows);
  });

  app.delete("/api/admin/terms/:id", requireUploader, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rowRes = await pgPool.query("SELECT t FROM uploaded_terms WHERE id = $1", [
      id,
    ]);
    const row = rowRes.rows[0] as { t: string } | undefined;
    if (!row) return res.status(404).json({ error: "Not found" });
    await pgPool.query("DELETE FROM uploaded_terms WHERE id = $1", [id]);
    await audit((req.user as DbUser).id, "delete_term", row.t);
    res.json({ ok: true });
  });

  // —— Upload: single interview ——
  app.post("/api/admin/interview", requireUploader, async (req, res) => {
    const { question, ideal_answer, role, company } = req.body;
    if (!question?.trim() || !ideal_answer?.trim() || !role?.trim() || !company?.trim()) {
      return res.status(400).json({
        error: "question, ideal_answer, role, company required",
      });
    }
    await pgPool.query(
      "INSERT INTO uploaded_interview (question, ideal_answer, role, company, added_by) VALUES ($1, $2, $3, $4, $5)",
      [
        question.trim(),
        ideal_answer.trim(),
        role.trim(),
        company.trim(),
        (req.user as DbUser).id,
      ]
    );
    await audit((req.user as DbUser).id, "upload_interview", question.trim().slice(0, 50));
    res.json({ ok: true });
  });

  // —— Upload: bulk interview (with duplicate check) ——
  app.post("/api/admin/interview/bulk", requireUploader, async (req, res) => {
    const { entries, role, company } = req.body;
    if (!Array.isArray(entries) || !role?.trim() || !company?.trim()) {
      return res.status(400).json({ error: "entries, role, company required" });
    }
    const existingRes = await pgPool.query(
      "SELECT question FROM uploaded_interview"
    );
    const existing = new Set(
      (existingRes.rows as { question: string }[]).map((r) =>
        r.question.toLowerCase().trim()
      )
    );
    const duplicates = entries.filter(
      (e: { question?: string }) =>
        e.question && existing.has(String(e.question).toLowerCase().trim())
    );
    if (duplicates.length > 0) {
      return res.status(409).json({
        error: "Duplicates found",
        duplicates: duplicates.map((d: { question?: string }) => d.question),
      });
    }
    const r = role.trim();
    const c = company.trim();
    const userId = (req.user as DbUser).id;
    for (const { question: q, ideal_answer: a } of entries) {
      if (!q?.trim() || !a?.trim()) continue;
      await pgPool.query(
        "INSERT INTO uploaded_interview (question, ideal_answer, role, company, added_by) VALUES ($1, $2, $3, $4, $5)",
        [q.trim(), a.trim(), r, c, userId]
      );
    }
    await audit((req.user as DbUser).id, "upload_interview_bulk", String(entries.length));
    res.json({ ok: true, imported: entries.length });
  });

  app.get("/api/admin/interview", requireUploader, async (req, res) => {
    const result = await pgPool.query(
      "SELECT id, question, ideal_answer, role, company, added_at FROM uploaded_interview ORDER BY added_at DESC"
    );
    res.json(result.rows);
  });

  app.delete("/api/admin/interview/:id", requireUploader, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rowRes = await pgPool.query(
      "SELECT question FROM uploaded_interview WHERE id = $1",
      [id]
    );
    const row = rowRes.rows[0] as { question: string } | undefined;
    if (!row) return res.status(404).json({ error: "Not found" });
    await pgPool.query("DELETE FROM uploaded_interview WHERE id = $1", [id]);
    await audit(
      (req.user as DbUser).id,
      "delete_interview",
      row.question.slice(0, 50)
    );
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
