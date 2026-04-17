import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = express.Router();

router.get("/terms", requireAuth, async (_req, res) => {
  const result = await pgPool.query("SELECT t, d, l, c FROM uploaded_terms");
  res.json(result.rows);
});

router.get("/interview", requireAuth, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT question, ideal_answer, role, company, category FROM uploaded_interview"
  );
  res.json(result.rows);
});

export default router;
