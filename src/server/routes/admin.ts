import express from "express";
import { pgPool } from "../db/pool.ts";
import {
  requireAdmin,
  requireUploader,
  audit,
  type DbUser,
} from "../middleware/auth.ts";
import { invalidateContentCache } from "./content.ts";

const router = express.Router();

// Invalidate content cache after any admin write operation
router.use((req, _res, next) => {
  if (req.method !== 'GET') {
    const origJson = _res.json.bind(_res);
    _res.json = (body: any) => {
      if (body?.ok) invalidateContentCache();
      return origJson(body);
    };
  }
  next();
});

export const VALID_LEVELS = [2, 3, 4, 5];

// ── Users ──────────────────────────────────────────────────────────────
router.get("/users", requireAdmin, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT id, email, name, avatar_url, role, is_allowed, created_at, last_login FROM users ORDER BY created_at"
  );
  res.json(result.rows);
});

router.patch("/users/:id", requireAdmin, async (req, res) => {
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

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === (req.user as DbUser).id) {
    return res.status(400).json({ error: "Cannot remove your own account" });
  }
  await pgPool.query("UPDATE users SET is_allowed = 0 WHERE id = $1", [id]);
  await audit((req.user as DbUser).id, "revoke_access", String(id));
  res.json({ ok: true });
});

// ── Allowlist ──────────────────────────────────────────────────────────
router.get("/allowlist", requireAdmin, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT email, added_at FROM email_allowlist ORDER BY added_at"
  );
  res.json(result.rows);
});

router.post("/allowlist", requireAdmin, async (req, res) => {
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

router.delete("/allowlist/:email", requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  await pgPool.query("DELETE FROM email_allowlist WHERE email = $1", [email]);
  await pgPool.query("UPDATE users SET is_allowed = 0 WHERE email = $1", [email]);
  await audit((req.user as DbUser).id, "allowlist_remove", email);
  res.json({ ok: true });
});

// ── Access requests ────────────────────────────────────────────────────
router.get("/requests", requireAdmin, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT * FROM access_requests WHERE status = 'pending' ORDER BY requested_at"
  );
  res.json(result.rows);
});

router.post("/requests/:id/approve", requireAdmin, async (req, res) => {
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
  await pgPool.query("UPDATE users SET is_allowed = 1 WHERE email = $1", [row.email]);
  await pgPool.query(
    "UPDATE access_requests SET status = 'approved' WHERE id = $1",
    [id]
  );
  await audit((req.user as DbUser).id, "approve_access_request", row.email);
  res.json({ ok: true });
});

router.post("/requests/:id/reject", requireAdmin, async (req, res) => {
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

// ── Audit log ──────────────────────────────────────────────────────────
router.get("/audit", requireAdmin, async (_req, res) => {
  const result = await pgPool.query(
    `SELECT a.id, a.action, a.target, a.detail, a.created_at, u.email as actor_email
     FROM audit_log a LEFT JOIN users u ON a.performed_by = u.id
     ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

// ── Progress dashboard ─────────────────────────────────────────────────
router.get("/progress", requireUploader, async (_req, res) => {
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

// ── Terms CRUD ─────────────────────────────────────────────────────────
router.post("/terms", requireUploader, async (req, res) => {
  const { t, d, l, c } = req.body;
  if (!t?.trim() || !d?.trim() || !c?.trim()) {
    return res.status(400).json({ error: "term, definition, category required" });
  }
  const level = Number(l);
  if (!VALID_LEVELS.includes(level)) {
    return res.status(400).json({ error: "level must be 2, 3, 4, or 5" });
  }
  const category = c.trim();
  await pgPool.query(
    "INSERT INTO uploaded_terms (t, d, l, c, added_by) VALUES ($1, $2, $3, $4, $5)",
    [t.trim(), d.trim(), level, category, (req.user as DbUser).id]
  );
  await audit((req.user as DbUser).id, "upload_term", t.trim());
  res.json({ ok: true });
});

// Phase 1.4 + Phase 3.1: Bulk terms with transaction and multi-value INSERT
router.post("/terms/bulk", requireUploader, async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries array required" });
  }
  const userId = (req.user as DbUser).id;
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    // Filter valid entries first
    const valid = entries.filter(
      ({ t, d, l, c }: { t?: string; d?: string; l?: number; c?: string }) =>
        t?.trim() && d?.trim() && VALID_LEVELS.includes(Number(l)) && c?.trim()
    );

    if (valid.length > 0) {
      // Phase 3.1: Multi-value INSERT instead of one-by-one loop
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const { t, d, l, c } of valid) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        values.push(t.trim(), d.trim(), Number(l), (c as string).trim(), userId);
        idx += 5;
      }
      await client.query(
        `INSERT INTO uploaded_terms (t, d, l, c, added_by) VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
    await audit(userId, "upload_terms_bulk", String(entries.length));
    res.json({ ok: true, imported: valid.length });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/terms", requireUploader, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT id, t, d, l, c, added_at FROM uploaded_terms ORDER BY added_at DESC"
  );
  res.json(result.rows);
});

router.delete("/terms/:id", requireUploader, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rowRes = await pgPool.query("SELECT t FROM uploaded_terms WHERE id = $1", [id]);
  const row = rowRes.rows[0] as { t: string } | undefined;
  if (!row) return res.status(404).json({ error: "Not found" });
  await pgPool.query("DELETE FROM uploaded_terms WHERE id = $1", [id]);
  await audit((req.user as DbUser).id, "delete_term", row.t);
  res.json({ ok: true });
});

router.post("/terms/bulk-delete", requireUploader, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  const numIds = ids.map(Number).filter((n) => !isNaN(n));
  const result = await pgPool.query(
    "DELETE FROM uploaded_terms WHERE id = ANY($1::int[]) RETURNING t",
    [numIds]
  );
  const deleted = result.rowCount ?? 0;
  await audit((req.user as DbUser).id, "bulk_delete_terms", `${deleted} terms`);
  res.json({ ok: true, deleted });
});

// ── Interview CRUD ─────────────────────────────────────────────────────
router.post("/interview", requireUploader, async (req, res) => {
  const { question, ideal_answer, role, company, category } = req.body;
  if (!question?.trim() || !ideal_answer?.trim() || !role?.trim() || !company?.trim()) {
    return res.status(400).json({
      error: "question, ideal_answer, role, company required",
    });
  }
  const cat = (category != null && String(category).trim()) ? String(category).trim() : "General";
  await pgPool.query(
    "INSERT INTO uploaded_interview (question, ideal_answer, role, company, category, added_by) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      question.trim(),
      ideal_answer.trim(),
      role.trim(),
      company.trim(),
      cat,
      (req.user as DbUser).id,
    ]
  );
  await audit((req.user as DbUser).id, "upload_interview", question.trim().slice(0, 50));
  res.json({ ok: true });
});

// Phase 1.4 + Phase 3.1: Bulk interview with transaction and multi-value INSERT
router.post("/interview/bulk", requireUploader, async (req, res) => {
  const { entries, role, company, category } = req.body;
  if (!Array.isArray(entries) || !role?.trim() || !company?.trim()) {
    return res.status(400).json({ error: "entries, role, company required" });
  }

  // Duplicate check (outside transaction – read-only)
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
  const cat = (category != null && String(category).trim()) ? String(category).trim() : "General";
  const userId = (req.user as DbUser).id;

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    // Filter valid entries
    const valid = entries.filter(
      ({ question: q, ideal_answer: a }: { question?: string; ideal_answer?: string }) =>
        q?.trim() && a?.trim()
    );

    if (valid.length > 0) {
      // Phase 3.1: Multi-value INSERT
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const { question: q, ideal_answer: a } of valid) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
        values.push(q.trim(), a.trim(), r, c, cat, userId);
        idx += 6;
      }
      await client.query(
        `INSERT INTO uploaded_interview (question, ideal_answer, role, company, category, added_by) VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
    await audit(userId, "upload_interview_bulk", String(entries.length));
    res.json({ ok: true, imported: entries.length });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/interview", requireUploader, async (_req, res) => {
  const result = await pgPool.query(
    "SELECT id, question, ideal_answer, role, company, category, added_at FROM uploaded_interview ORDER BY added_at DESC"
  );
  res.json(result.rows);
});

router.delete("/interview/:id", requireUploader, async (req, res) => {
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

router.post("/interview/bulk-delete", requireUploader, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  const numIds = ids.map(Number).filter((n) => !isNaN(n));
  const result = await pgPool.query(
    "DELETE FROM uploaded_interview WHERE id = ANY($1::int[]) RETURNING id",
    [numIds]
  );
  const deleted = result.rowCount ?? 0;
  await audit((req.user as DbUser).id, "bulk_delete_interview", `${deleted} Q&As`);
  res.json({ ok: true, deleted });
});

export default router;
