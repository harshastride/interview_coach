import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth, type DbUser } from "../middleware/auth.ts";

const router = express.Router();

// ── User progress snapshot (POST /api/progress) ────────────────────────
router.post("/progress", requireAuth, async (req, res) => {
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
     ON CONFLICT (user_id, module) DO UPDATE SET
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

// ── Access request (POST /api/access-request) ──────────────────────────
router.post("/access-request", async (req, res) => {
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

export default router;
