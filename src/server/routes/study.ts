import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth, type DbUser } from "../middleware/auth.ts";

const router = express.Router();

// ── GET /api/study/due-cards ──
router.get("/due-cards", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  res.set('Cache-Control', 'private, max-age=30');
  const result = await pgPool.query(
    `SELECT term_slug, ease_factor, interval_days, repetitions, next_review, last_rating
     FROM card_reviews
     WHERE user_id = $1 AND next_review <= CURRENT_DATE
     ORDER BY next_review ASC`,
    [userId]
  );
  res.json(result.rows);
});

// ── GET /api/study/all-reviews ──
router.get("/all-reviews", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  res.set('Cache-Control', 'private, max-age=30');
  const result = await pgPool.query(
    `SELECT term_slug, ease_factor, interval_days, repetitions, next_review, last_rating
     FROM card_reviews WHERE user_id = $1`,
    [userId]
  );
  res.json(result.rows);
});

// ── POST /api/study/review — SM-2 update (single UPSERT, no pre-read) ──
router.post("/review", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { term_slug, rating } = req.body;
  if (!term_slug || typeof rating !== "number" || rating < 1 || rating > 4) {
    return res.status(400).json({ error: "term_slug and rating (1-4) required" });
  }

  // Single query: fetch + compute + upsert using a CTE
  const qualityMap: Record<number, number> = { 1: 0, 2: 2, 3: 3, 4: 5 };
  const q = qualityMap[rating];

  const result = await pgPool.query(
    `WITH existing AS (
       SELECT ease_factor, interval_days, repetitions
       FROM card_reviews WHERE user_id = $1 AND term_slug = $2
     ),
     defaults AS (
       SELECT
         COALESCE((SELECT ease_factor FROM existing), 2.5) as ef,
         COALESCE((SELECT interval_days FROM existing), 0) as iv,
         COALESCE((SELECT repetitions FROM existing), 0) as reps
     ),
     computed AS (
       SELECT
         CASE WHEN $3 < 3 THEN 0 ELSE reps + 1 END as new_reps,
         CASE
           WHEN $3 < 3 THEN 0
           WHEN reps = 0 THEN 1
           WHEN reps = 1 THEN 6
           ELSE ROUND(iv * ef)
         END as new_interval,
         GREATEST(1.3, ef + (0.1 - (5 - $3) * (0.08 + (5 - $3) * 0.02))) as new_ef
       FROM defaults
     )
     INSERT INTO card_reviews (user_id, term_slug, ease_factor, interval_days, repetitions, next_review, last_rating, updated_at)
     SELECT $1, $2, new_ef, new_interval, new_reps,
            CURRENT_DATE + GREATEST(new_interval, CASE WHEN $4 = 1 THEN 0 ELSE 1 END)::int,
            $4, NOW()
     FROM computed
     ON CONFLICT (user_id, term_slug) DO UPDATE SET
       ease_factor = EXCLUDED.ease_factor,
       interval_days = EXCLUDED.interval_days,
       repetitions = EXCLUDED.repetitions,
       next_review = EXCLUDED.next_review,
       last_rating = EXCLUDED.last_rating,
       updated_at = NOW()
     RETURNING next_review, interval_days, ease_factor`,
    [userId, term_slug, q, rating]
  );

  const row = result.rows[0];
  res.json({ ok: true, next_review: row?.next_review, interval: row?.interval_days, ease_factor: row?.ease_factor });
});

// ── GET /api/study/streaks — Streak computed in SQL (not Node.js) ──
router.get("/streaks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  res.set('Cache-Control', 'private, max-age=30');

  // Single query: streak + today's data + recent activity
  const result = await pgPool.query(
    `WITH activity AS (
       SELECT activity_date, cards_studied, quiz_answered, time_spent_sec
       FROM daily_activity
       WHERE user_id = $1 AND activity_date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY activity_date DESC
     ),
     streak AS (
       SELECT COUNT(*) as current_streak FROM (
         SELECT activity_date,
                activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int AS grp
         FROM daily_activity
         WHERE user_id = $1
           AND activity_date >= CURRENT_DATE - INTERVAL '365 days'
           AND (cards_studied > 0 OR quiz_answered > 0)
         ORDER BY activity_date DESC
       ) s
       WHERE grp = (
         SELECT activity_date - 1::int FROM daily_activity
         WHERE user_id = $1 AND activity_date = CURRENT_DATE AND (cards_studied > 0 OR quiz_answered > 0)
         UNION ALL
         SELECT activity_date FROM daily_activity
         WHERE user_id = $1 AND activity_date = CURRENT_DATE - 1 AND (cards_studied > 0 OR quiz_answered > 0)
         LIMIT 1
       )
     ),
     today AS (
       SELECT cards_studied, quiz_answered, time_spent_sec
       FROM daily_activity
       WHERE user_id = $1 AND activity_date = CURRENT_DATE
     )
     SELECT
       COALESCE((SELECT current_streak FROM streak), 0) as current_streak,
       COALESCE((SELECT cards_studied FROM today), 0) as today_cards,
       COALESCE((SELECT quiz_answered FROM today), 0) as today_quiz,
       COALESCE((SELECT time_spent_sec FROM today), 0) as today_time_sec,
       (SELECT json_agg(row_to_json(a)) FROM activity a) as recent_activity`,
    [userId]
  );

  const row = result.rows[0];
  res.json({
    current_streak: Number(row?.current_streak) || 0,
    today_cards: Number(row?.today_cards) || 0,
    today_quiz: Number(row?.today_quiz) || 0,
    today_time_sec: Number(row?.today_time_sec) || 0,
    recent_activity: row?.recent_activity || [],
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

// ── GET /api/study/bookmarks ──
router.get("/bookmarks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  res.set('Cache-Control', 'private, max-age=15');
  const result = await pgPool.query(
    "SELECT term_slug, created_at FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  res.json(result.rows);
});

// ── POST /api/study/bookmarks — Toggle (single query) ──
router.post("/bookmarks", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const { term_slug } = req.body;
  if (!term_slug?.trim()) {
    return res.status(400).json({ error: "term_slug required" });
  }

  // Single query: delete if exists, insert if not
  const deleted = await pgPool.query(
    "DELETE FROM bookmarks WHERE user_id = $1 AND term_slug = $2 RETURNING id",
    [userId, term_slug]
  );

  if (deleted.rowCount && deleted.rowCount > 0) {
    res.json({ bookmarked: false });
  } else {
    await pgPool.query(
      "INSERT INTO bookmarks (user_id, term_slug) VALUES ($1, $2)",
      [userId, term_slug]
    );
    res.json({ bookmarked: true });
  }
});

// ── GET /api/study/session-state/:module ──
router.get("/session-state/:module", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const module = String(req.params.module).slice(0, 32);
  const result = await pgPool.query(
    "SELECT state_json FROM session_state WHERE user_id = $1 AND module = $2",
    [userId, module]
  );
  res.json(result.rows[0]?.state_json ?? null);
});

// ── PUT /api/study/session-state/:module ──
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
     ON CONFLICT (user_id, module) DO UPDATE SET state_json = $3, updated_at = NOW()`,
    [userId, module, JSON.stringify(stateJson)]
  );
  res.json({ ok: true });
});

// ── DELETE /api/study/session-state/:module ──
router.delete("/session-state/:module", requireAuth, async (req, res) => {
  const userId = (req.user as DbUser).id;
  const module = String(req.params.module).slice(0, 32);
  await pgPool.query("DELETE FROM session_state WHERE user_id = $1 AND module = $2", [userId, module]);
  res.json({ ok: true });
});

export default router;
