import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth, type DbUser } from "../middleware/auth.ts";

const router = express.Router();

// ── GET /api/study/due-cards — Get cards due for spaced repetition review ──
router.get("/due-cards", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const result = await pgPool.query(
    `SELECT term_slug, ease_factor, interval_days, repetitions, next_review, last_rating
     FROM card_reviews
     WHERE user_id = $1 AND next_review <= CURRENT_DATE
     ORDER BY next_review ASC`,
    [userId]
  );
  res.json(result.rows);
});

// ── GET /api/study/all-reviews — Get all card review data for a user ──
router.get("/all-reviews", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const result = await pgPool.query(
    `SELECT term_slug, ease_factor, interval_days, repetitions, next_review, last_rating
     FROM card_reviews WHERE user_id = $1`,
    [userId]
  );
  res.json(result.rows);
});

// ── POST /api/study/review — Record a card review (SM-2 update) ──
router.post("/review", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { term_slug, rating } = req.body;
  // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  if (!term_slug || typeof rating !== "number" || rating < 1 || rating > 4) {
    return res.status(400).json({ error: "term_slug and rating (1-4) required" });
  }

  // Fetch current review state (or defaults)
  const existing = await pgPool.query(
    "SELECT ease_factor, interval_days, repetitions FROM card_reviews WHERE user_id = $1 AND term_slug = $2",
    [userId, term_slug]
  );

  let ef = existing.rows[0]?.ease_factor ?? 2.5;
  let interval = existing.rows[0]?.interval_days ?? 0;
  let reps = existing.rows[0]?.repetitions ?? 0;

  // SM-2 algorithm
  // Map rating to quality: 1→0, 2→2, 3→3, 4→5
  const qualityMap: Record<number, number> = { 1: 0, 2: 2, 3: 3, 4: 5 };
  const q = qualityMap[rating];

  if (q < 3) {
    // Failed: reset repetitions
    reps = 0;
    interval = 0;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }

  // Update ease factor
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + Math.max(interval, rating === 1 ? 0 : 1));
  const nextReviewStr = nextReview.toISOString().split("T")[0];

  await pgPool.query(
    `INSERT INTO card_reviews (user_id, term_slug, ease_factor, interval_days, repetitions, next_review, last_rating, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, term_slug) DO UPDATE SET
       ease_factor = $3, interval_days = $4, repetitions = $5,
       next_review = $6, last_rating = $7, updated_at = NOW()`,
    [userId, term_slug, ef, interval, reps, nextReviewStr, rating]
  );

  res.json({ ok: true, next_review: nextReviewStr, interval, ease_factor: ef });
});

// ── GET /api/study/streaks — Get streak and daily activity data ──
router.get("/streaks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;

  // Get last 30 days of activity
  const activity = await pgPool.query(
    `SELECT activity_date, cards_studied, quiz_answered, time_spent_sec
     FROM daily_activity
     WHERE user_id = $1 AND activity_date >= CURRENT_DATE - INTERVAL '30 days'
     ORDER BY activity_date DESC`,
    [userId]
  );

  // Calculate current streak
  const dates = activity.rows.map((r: any) => r.activity_date.toISOString().split("T")[0]);
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split("T")[0];
    if (dates.includes(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
    // If today has no activity yet, that's ok (streak doesn't break until end of day)
  }

  // Total cards studied today
  const todayRow = activity.rows.find((r: any) =>
    r.activity_date.toISOString().split("T")[0] === today.toISOString().split("T")[0]
  );

  res.json({
    current_streak: streak,
    today_cards: todayRow?.cards_studied ?? 0,
    today_quiz: todayRow?.quiz_answered ?? 0,
    today_time_sec: todayRow?.time_spent_sec ?? 0,
    recent_activity: activity.rows,
  });
});

// ── POST /api/study/activity — Record daily activity (upsert) ──
router.post("/activity", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { cards_studied, quiz_answered, time_spent_sec } = req.body;

  const cards = Math.max(0, Math.floor(Number(cards_studied) || 0));
  const quiz = Math.max(0, Math.floor(Number(quiz_answered) || 0));
  const time = Math.max(0, Math.floor(Number(time_spent_sec) || 0));

  await pgPool.query(
    `INSERT INTO daily_activity (user_id, activity_date, cards_studied, quiz_answered, time_spent_sec)
     VALUES ($1, CURRENT_DATE, $2, $3, $4)
     ON CONFLICT (user_id, activity_date) DO UPDATE SET
       cards_studied = daily_activity.cards_studied + $2,
       quiz_answered = daily_activity.quiz_answered + $3,
       time_spent_sec = daily_activity.time_spent_sec + $4`,
    [userId, cards, quiz, time]
  );

  res.json({ ok: true });
});

// ── GET /api/study/bookmarks — Get user's bookmarked terms ──
router.get("/bookmarks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const result = await pgPool.query(
    "SELECT term_slug, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  res.json(result.rows);
});

// ── POST /api/study/bookmarks — Toggle bookmark ──
router.post("/bookmarks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { term_slug } = req.body;
  if (!term_slug?.trim()) {
    return res.status(400).json({ error: "term_slug required" });
  }

  // Check if already bookmarked → toggle
  const existing = await pgPool.query(
    "SELECT id FROM bookmarks WHERE user_id = $1 AND term_slug = $2",
    [userId, term_slug]
  );

  if (existing.rows.length > 0) {
    await pgPool.query("DELETE FROM bookmarks WHERE user_id = $1 AND term_slug = $2", [userId, term_slug]);
    res.json({ bookmarked: false });
  } else {
    await pgPool.query(
      "INSERT INTO bookmarks (user_id, term_slug) VALUES ($1, $2)",
      [userId, term_slug]
    );
    res.json({ bookmarked: true });
  }
});

// ── GET /api/study/session-state/:module — Get persisted session state ──
router.get("/session-state/:module", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const module = String(req.params.module).slice(0, 32);
  const result = await pgPool.query(
    "SELECT state_json FROM session_state WHERE user_id = $1 AND module = $2",
    [userId, module]
  );
  res.json(result.rows[0]?.state_json ?? null);
});

// ── PUT /api/study/session-state/:module — Save session state ──
router.put("/session-state/:module", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const module = String(req.params.module).slice(0, 32);
  const stateJson = req.body;

  if (!stateJson || typeof stateJson !== "object") {
    return res.status(400).json({ error: "JSON body required" });
  }

  await pgPool.query(
    `INSERT INTO session_state (user_id, module, state_json, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, module) DO UPDATE SET
       state_json = $3, updated_at = NOW()`,
    [userId, module, JSON.stringify(stateJson)]
  );

  res.json({ ok: true });
});

// ── DELETE /api/study/session-state/:module — Clear session state ──
router.delete("/session-state/:module", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const module = String(req.params.module).slice(0, 32);
  await pgPool.query("DELETE FROM session_state WHERE user_id = $1 AND module = $2", [userId, module]);
  res.json({ ok: true });
});

export default router;
