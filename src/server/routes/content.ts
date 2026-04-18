import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = express.Router();

// In-memory cache — avoids hitting Supabase on every page load
const cache: { terms?: { data: any[]; ts: number }; interview?: { data: any[]; ts: number } } = {};
const CACHE_TTL = 60_000; // 1 minute

export function invalidateContentCache() {
  delete cache.terms;
  delete cache.interview;
}

router.get("/terms", requireAuth, async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=60');
  if (cache.terms && Date.now() - cache.terms.ts < CACHE_TTL) {
    return res.json(cache.terms.data);
  }
  const result = await pgPool.query("SELECT t, d, l, c FROM uploaded_terms");
  cache.terms = { data: result.rows, ts: Date.now() };
  res.json(result.rows);
});

router.get("/interview", requireAuth, async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=60');
  if (cache.interview && Date.now() - cache.interview.ts < CACHE_TTL) {
    return res.json(cache.interview.data);
  }
  const result = await pgPool.query(
    "SELECT question, ideal_answer, role, company, category FROM uploaded_interview"
  );
  cache.interview = { data: result.rows, ts: Date.now() };
  res.json(result.rows);
});

export default router;
