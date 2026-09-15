import { safeRouter } from '../safeRouter.ts';
import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth, type DbUser } from "../middleware/auth.ts";

const router = safeRouter();

// Reading history always belongs to the authenticated candidate.
router.get("/reading-attempts", requireAuth, async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT id, content_id, question_ref, role, overall_score, accuracy, fluency,
              completeness, wpm, filler_count, transcript, feedback, created_at
       FROM reading_attempts WHERE user_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 50`,
      [(req.user as DbUser).id]
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ attempts: result.rows });
  } catch {
    res.status(500).json({ error: "Reading history could not be loaded" });
  }
});

router.get("/reading-attempts/:attemptId", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const rawId = req.params.attemptId;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) > 2147483647) {
    return res.status(400).json({ error: "Invalid reading attempt ID" });
  }
  try {
    const result = await pgPool.query(
      `SELECT id, content_id, question_ref, role, overall_score, accuracy, fluency,
              completeness, wpm, filler_count, transcript, feedback, created_at
       FROM reading_attempts WHERE user_id = $1 AND id = $2`,
      [(req.user as DbUser).id, Number(rawId)]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Reading report not found" });
    res.json({ attempt: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Reading report could not be loaded" });
  }
});

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
  await pgPool.query(`INSERT INTO domain_progress(user_id,domain_id,module,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,domain_key,module) DO UPDATE SET snapshot=EXCLUDED.snapshot,updated_at=NOW()`,[userId,res.locals.domain?.domain_id??null,normalizedModule,JSON.stringify({total_terms:asNonNegInt(total_terms),completed_terms:asNonNegInt(completed_terms),quiz_correct:asNonNegInt(quiz_correct),quiz_incorrect:asNonNegInt(quiz_incorrect),interview_total:asNonNegInt(interview_total),interview_answered:asNonNegInt(interview_answered)})]);

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

// ── Reading practice attempt (POST /api/reading-attempt) ───────────────
router.post("/reading-attempt", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { question_ref, role, attempt_no } = req.body ?? {};
  const receiptId = req.body?.receiptId;
  if (typeof receiptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId)) return res.status(400).json({error:'A verified analysis is required. Make a new recording.'});
  const receipt = (await pgPool.query('SELECT result FROM reading_receipts WHERE id=$1 AND user_id=$2 AND content_id IS NOT DISTINCT FROM $3 AND domain_id IS NOT DISTINCT FROM $4 AND reference_hash IS NOT DISTINCT FROM $5',[receiptId,userId,res.locals.contentId??null,res.locals.domain?.domain_id??null,res.locals.contentHash??null])).rows[0];
  if (!receipt) return res.status(409).json({error:'This analysis does not match your current passage or access. Make a new recording.'});
  const feedback=receipt.result, scores=feedback.scores, wpm=feedback.delivery.wpm, filler_count=feedback.delivery.filler_count, transcript=feedback.transcript;
  if (!question_ref || !scores) {
    return res.status(400).json({ error: "question_ref and scores are required" });
  }

  const asScore = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };
  const asCount = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  };

  await pgPool.query(
    `WITH saved AS (INSERT INTO reading_attempts
      (user_id, question_ref, role, attempt_no, overall_score, accuracy, fluency, completeness, wpm, filler_count, transcript, feedback, domain_id,content_id,submission_id,content_hash,receipt_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING RETURNING id,user_id,content_id,domain_id,created_at,receipt_id)
     UPDATE reading_assignments a SET status='completed',completed_at=s.created_at,completed_attempt_id=s.id
     FROM saved s,users u,reading_receipts proof WHERE proof.id=s.receipt_id AND proof.created_at>=a.created_at AND a.candidate_id=s.user_id AND u.id=s.user_id AND u.domain_id=a.domain_id AND a.content_id=s.content_id AND a.domain_id=s.domain_id AND a.status='pending' AND a.created_at<=s.created_at`,
    [
      userId,
      String(question_ref).slice(0, 2000),
      role ? String(role).slice(0, 128) : null,
      Math.max(1, Math.floor(Number(attempt_no)) || 1),
      asScore(scores.overall),
      asScore(scores.accuracy),
      asScore(scores.fluency),
      asScore(scores.completeness),
      asCount(wpm),
      asCount(filler_count),
      transcript ? String(transcript).slice(0, 10000) : null,
      feedback ? JSON.stringify(feedback) : null,
      res.locals.domain?.domain_id??null, res.locals.contentId??null, typeof req.body.submissionId==='string'?req.body.submissionId.slice(0,100):null, res.locals.contentHash??null, receiptId,
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
