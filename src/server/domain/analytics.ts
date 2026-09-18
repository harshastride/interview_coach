import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireUploader, requireAdmin } from "../middleware/auth.ts";
import { id, wrap } from "./access.ts";
export const dayIST = (value: string | Date) =>
  new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);
export function period(days: number, now = new Date()) {
  const today = dayIST(now);
  const end = new Date(`${today}T00:00:00+05:30`).getTime() + 86400000;
  return {
    start: new Date(end - days * 86400000).toISOString(),
    end: new Date(end).toISOString(),
  };
}
export function readingTrend(rows: any[]) {
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const a = r.feedback?.assessment;
    if (
      !r.content_id ||
      !r.content_hash ||
      !a?.version ||
      !a.locale ||
      !a.provider ||
      r.overall_score == null
    )
      continue;
    const key = JSON.stringify([
      r.user_id,
      r.content_id,
      r.content_hash,
      a.provider,
      a.version,
      a.locale,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => {
      g.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
          a.id - b.id,
      );
      return {
        question: g[0].question_ref,
        provider: g[0].feedback.assessment.provider,
        version: g[0].feedback.assessment.version,
        locale: g[0].feedback.assessment.locale,
        first: g[0].overall_score,
        latest: g.at(-1).overall_score,
        count: g.length,
      };
    });
}
const router = express.Router();
router.use(requireUploader, (_q, r, n) => {
  r.set("Cache-Control", "no-store");
  n();
});
router.get(
  "/analytics",
  wrap(async (req, res) => {
    const days = req.query.days === "7" ? 7 : 30,
      domain = req.query.domainId ? id(req.query.domainId) : null;
    const { start, end } = period(days);
    const [users, readings, activity, latest, unassigned, passages] = await Promise.all([
      pgPool.query(
        "SELECT u.id,u.name,u.email,u.is_allowed,u.domain_id,u.approved_at,d.name AS domain_name FROM users u LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.role='viewer' AND u.google_id<>'local-development-bypass' ORDER BY u.name",
      ),
      pgPool.query(
        `SELECT id,user_id,domain_id,content_id,question_ref,overall_score,created_at,feedback->'missed_words' AS missed_words FROM reading_attempts WHERE created_at >= $1 AND created_at < $2 AND ($3::int IS NULL OR domain_id=$3)`,
        [start, end, domain],
      ),
      pgPool.query(
        `SELECT user_id,domain_id,created_at,cards,quizzes FROM domain_activity WHERE created_at >= $1 AND created_at < $2 AND ($3::int IS NULL OR domain_id=$3)`,
        [start, end, domain],
      ),
      pgPool.query(
        `SELECT user_id,MAX(created_at) AS last_practice FROM (SELECT user_id,created_at,domain_id FROM reading_attempts UNION ALL SELECT user_id,created_at,domain_id FROM domain_activity WHERE cards>0 OR quizzes>0) a WHERE ($1::int IS NULL OR domain_id=$1) GROUP BY user_id`,
        [domain],
      ),
      pgPool.query(
        "SELECT COUNT(*)::int AS n FROM reading_attempts a JOIN users u ON u.id=a.user_id WHERE a.domain_id IS NULL AND u.role='viewer' AND u.google_id<>'local-development-bypass'",
      ),
      pgPool.query("SELECT id, question FROM uploaded_interview"),
    ]);
    // Attempts recorded before content_id was tracked (or without a selected
    // passage) only have question_ref text — fall back to matching that
    // text to a passage so legacy readings still attribute to a passage.
    const questionToId = new Map(
      passages.rows.map((p) => [p.question, p.id]),
    );
    const resolveId = (r: { content_id: number | null; question_ref: string }) =>
      r.content_id ?? questionToId.get(r.question_ref) ?? null;
    const candidates = users.rows.filter(
      (u) => !domain || u.domain_id === domain,
    );
    const candidateIds = new Set(users.rows.map((u) => u.id));
    const rr = readings.rows.filter((r) => candidateIds.has(r.user_id)),
      aa = activity.rows.filter((r) => candidateIds.has(r.user_id));
    const active = new Set(
      [...rr, ...aa.filter((a) => a.cards > 0 || a.quizzes > 0)].map(
        (r) => r.user_id,
      ),
    );
    const readingDays = new Map<number, Set<string>>();
    for (const r of rr) {
      if (!readingDays.has(r.user_id)) readingDays.set(r.user_id, new Set());
      readingDays.get(r.user_id)!.add(dayIST(r.created_at));
    }
    const last = new Map(latest.rows.map((r) => [r.user_id, r.last_practice]));
    const mapped = candidates.map((u) => {
      const attempts = rr.filter((r) => r.user_id === u.id);
      const attemptPassages = new Set(
        attempts.map((r) => resolveId(r) ?? r.question_ref),
      );
      return {
        ...u,
        last_practice: last.get(u.id) ?? null,
        reading_count: attempts.length,
        repeat_count: attempts.length - attemptPassages.size,
      };
    });
    const cutoff = Date.now() - 7 * 86400000;
    const attention = mapped.filter(
      (u) =>
        u.is_allowed &&
        (u.last_practice
          ? new Date(u.last_practice).getTime() < cutoff
          : u.approved_at && new Date(u.approved_at).getTime() < cutoff),
    );
    const chart = Array.from({ length: days }, (_, i) => {
      const date = dayIST(new Date(new Date(start).getTime() + i * 86400000));
      return {
        date,
        readings: rr.filter((r) => dayIST(r.created_at) === date).length,
        cards: aa
          .filter((r) => dayIST(r.created_at) === date)
          .reduce((s, r) => s + r.cards, 0),
        quizzes: aa
          .filter((r) => dayIST(r.created_at) === date)
          .reduce((s, r) => s + r.quizzes, 0),
      };
    });
    const byPassage = new Map<string, any>();
    for (const r of rr) {
      const resolvedId = resolveId(r);
      const key = String(resolvedId ?? `legacy:${r.question_ref}`);
      if (!byPassage.has(key))
        byPassage.set(key, {
          id: resolvedId,
          question: r.question_ref,
          attempts: 0,
          readers: new Set(),
          words: new Map(),
        });
      const p = byPassage.get(key);
      p.attempts++;
      p.readers.add(r.user_id);
      for (const w of Array.isArray(r.missed_words) ? r.missed_words : [])
        if (typeof w === "string") p.words.set(w, (p.words.get(w) ?? 0) + 1);
    }
    res.json({
      days,
      summary: {
        approved: candidates.filter((u) => u.is_allowed).length,
        active: active.size,
        readings: rr.length,
        returning: [...readingDays.values()].filter((s) => s.size >= 2).length,
      },
      candidates: mapped,
      attention,
      chart,
      content: [...byPassage.values()]
        .map((p) => ({
          ...p,
          readers: p.readers.size,
          repeats: p.attempts - p.readers.size,
          words: [...p.words.entries()]
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 8),
        }))
        .sort((a, b) => b.attempts - a.attempts),
      unassigned: unassigned.rows[0].n,
    });
  }),
);
router.get(
  "/candidates/:id/reports",
  wrap(async (req, res) => {
    const user = id(req.params.id);
    const domain = req.query.domainId ? id(req.query.domainId) : null;
    const r = await pgPool.query(
      "SELECT a.* FROM reading_attempts a JOIN users u ON u.id=a.user_id WHERE u.role='viewer' AND a.user_id=$1 AND ($2::int IS NULL OR a.domain_id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 50",
      [user, domain],
    );
    const candidate = (
      await pgPool.query(
        "SELECT u.id,u.name,u.email,d.name AS domain_name FROM users u LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.id=$1 AND u.role='viewer'",
        [user],
      )
    ).rows[0];
    if (!candidate)
      return res.status(404).json({ error: "Candidate not found." });
    res.json({ candidate, attempts: r.rows, trends: readingTrend(r.rows) });
  }),
);
router.get(
  "/reports/:id",
  wrap(async (req, res) => {
    const r = await pgPool.query(
      "SELECT a.* FROM reading_attempts a JOIN users u ON u.id=a.user_id WHERE a.id=$1 AND u.role='viewer'",
      [id(req.params.id)],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Report not found." });
    res.json(r.rows[0]);
  }),
);
router.get(
  "/usage",
  requireAdmin,
  wrap(async (req, res) => {
    const month = req.query.month ?? new Date().toISOString().slice(0, 7);
    if (typeof month !== "string" || !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month))
      return res.status(400).json({ error: "Choose a valid month (YYYY-MM)." });
    const r = await pgPool.query(
      `SELECT u.id,u.name,COALESCE(SUM(j.azure_seconds),0)::int AS reserved_seconds,GREATEST(0,1800-COALESCE(SUM(j.azure_seconds),0))::int AS remaining_seconds,COUNT(j.id) FILTER(WHERE j.status='complete' AND j.result->'assessment'->>'provider'='azure')::int AS azure_success,COUNT(j.id) FILTER(WHERE j.status='failed')::int AS failed,COUNT(j.id) FILTER(WHERE j.status='pending')::int AS pending,COUNT(j.id) FILTER(WHERE j.azure_seconds>0 AND j.result->'assessment'->>'provider'='local')::int AS fallbacks FROM users u LEFT JOIN reading_analysis_jobs j ON j.user_id=u.id AND j.month=$1::date GROUP BY u.id ORDER BY reserved_seconds DESC, LOWER(u.name) ASC NULLS LAST, u.id ASC`,
      [month + "-01"],
    );
    res.json({ month, users: r.rows });
  }),
);
export default router;
