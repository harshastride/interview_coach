import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireUploader, requireAdmin } from "../middleware/auth.ts";
import { DomainError, id, scope, staff, wrap } from "./access.ts";
const router = express.Router();
const transaction = async (fn: (c: any) => Promise<any>) => {
  const c = await pgPool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(98127)");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
};
const log = (
  c: any,
  user: number,
  action: string,
  target: string,
  detail: any,
) =>
  c.query(
    "INSERT INTO audit_log(performed_by,action,target,detail) VALUES($1,$2,$3,$4)",
    [user, action, target, JSON.stringify(detail)],
  );
async function validDomain(c: any, value: unknown) {
  const n = id(value);
  if (
    !(
      await c.query("SELECT id FROM learning_domains WHERE id=$1 AND active", [
        n,
      ])
    ).rows.length
  )
    throw new DomainError(400, "Choose an active domain.");
  return n;
}
router.get(
  "/domains",
  wrap(async (req, res) => {
    if (!req.user) throw new DomainError(401, "Sign in first.");
    res.json(
      (
        await pgPool.query(
          "SELECT id,name,active FROM learning_domains WHERE active ORDER BY name",
        )
      ).rows,
    );
  }),
);
router.get(
  "/access-request",
  wrap(async (req, res) => {
    if (!req.user) throw new DomainError(401, "Sign in first.");
    res.json(
      (
        await pgPool.query(
          "SELECT r.*,d.name AS domain_name FROM access_requests r LEFT JOIN learning_domains d ON d.id=r.domain_id WHERE email=$1 ORDER BY r.id DESC LIMIT 1",
          [req.user.email],
        )
      ).rows[0] ?? null,
    );
  }),
);
router.post(
  "/access-request",
  wrap(async (req, res) => {
    if (!req.user) throw new DomainError(401, "Sign in first.");
    if (req.user.is_allowed)
      throw new DomainError(
        409,
        "Your account already has access. Contact staff to change domain.",
      );
    const { name, reason, domainId } = req.body ?? {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 200 ||
      (reason !== undefined &&
        (typeof reason !== "string" || reason.length > 2000))
    )
      throw new DomainError(
        400,
        "Enter a name and a reason of up to 2,000 characters.",
      );
    const result = await transaction(async (c) => {
      const existing = (
        await c.query(
          "SELECT * FROM access_requests WHERE email=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [req.user!.email],
        )
      ).rows[0];
      if (existing && existing.status !== "rejected")
        throw new DomainError(409, "Your request has already been submitted.");
      if (
        existing &&
        domainId !== undefined &&
        Number(domainId) !== existing.domain_id
      )
        throw new DomainError(
          403,
          "Only staff can change your requested domain.",
        );
      const domain = await validDomain(
        c,
        existing ? existing.domain_id : domainId,
      );
      if (existing) {
        await c.query(
          "UPDATE access_requests SET status='pending',name=$1,reason=$2,requested_at=NOW() WHERE id=$3",
          [name.trim(), reason ?? null, existing.id],
        );
        return existing.id;
      }
      return (
        await c.query(
          "INSERT INTO access_requests(email,name,reason,status,domain_id,user_id) VALUES($1,$2,$3,'pending',$4,$5) RETURNING id",
          [req.user!.email, name.trim(), reason ?? null, domain, req.user!.id],
        )
      ).rows[0].id;
    });
    res.json({ ok: true, id: result });
  }),
);
router.use("/staff", requireUploader, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get(
  "/staff/domains",
  wrap(async (_req, res) => {
    res.json(
      (await pgPool.query("SELECT d.*, (SELECT COUNT(*)::int FROM users u WHERE u.domain_id=d.id AND u.role='viewer' AND u.is_allowed=1) AS candidate_count, ((SELECT COUNT(*) FROM term_domains td JOIN uploaded_terms t ON t.id=td.content_id WHERE td.domain_id=d.id AND NOT t.archived)+(SELECT COUNT(*) FROM interview_domains pd JOIN uploaded_interview p ON p.id=pd.content_id WHERE pd.domain_id=d.id AND NOT p.archived))::int AS content_count FROM learning_domains d ORDER BY d.name")).rows,
    );
  }),
);
router.post(
  "/staff/domains",
  requireAdmin,
  wrap(async (req, res) => {
    const name = String(req.body.name ?? "").trim();
    if (!name || name.length > 100)
      throw new DomainError(400, "Enter a domain name up to 100 characters.");
    await transaction(async (c) => {
      const d = (
        await c.query(
          "INSERT INTO learning_domains(slug,name) VALUES($1,$2) RETURNING id",
          [
            `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
            name,
          ],
        )
      ).rows[0];
      await log(c, req.user!.id, "domain_create", String(d.id), { name });
    });
    res.json({ ok: true });
  }),
);
router.patch(
  "/staff/domains/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const domain = id(req.params.id);
    const name = req.body.name;
    const active = req.body.active;
    if (
      (name !== undefined &&
        (typeof name !== "string" || !name.trim() || name.length > 100)) ||
      (active !== undefined && typeof active !== "boolean")
    )
      throw new DomainError(400, "Invalid domain settings.");
    await transaction(async (c) => {
      if (active === false) {
        const used = (
          await c.query(
            `SELECT (SELECT COUNT(*) FROM users WHERE domain_id=$1 AND is_allowed=1)+(SELECT COUNT(*) FROM access_requests WHERE domain_id=$1 AND status='pending') AS n`,
            [domain],
          )
        ).rows[0];
        if (Number(used.n))
          throw new DomainError(
            409,
            "Reassign candidates and pending requests before deactivating this domain.",
          );
      }
      const r = await c.query(
        "UPDATE learning_domains SET name=COALESCE($2,name),active=COALESCE($3,active) WHERE id=$1 RETURNING id",
        [domain, name?.trim(), active],
      );
      if (!r.rows.length) throw new DomainError(404, "Domain not found.");
      const check = await readiness(c);
      if (check.enforced && check.terms + check.passages > 0)
        throw new DomainError(
          409,
          "Reclassify content before deactivating its only domain.",
        );
      await c.query(
        "UPDATE users SET access_version=access_version+1 WHERE role='viewer' AND google_id<>'local-development-bypass'",
      );
      await log(c, req.user!.id, "domain_update", String(domain), {
        name,
        active,
      });
    });
    res.json({ ok: true });
  }),
);
router.get(
  "/staff/requests",
  wrap(async (_req, res) => {
    res.json(
      (
        await pgPool.query(
          "SELECT r.*,d.name AS domain_name FROM access_requests r LEFT JOIN learning_domains d ON d.id=r.domain_id ORDER BY requested_at DESC,id DESC",
        )
      ).rows,
    );
  }),
);
router.patch(
  "/staff/requests/:id/domain",
  wrap(async (req, res) => {
    await transaction(async (c) => {
      const domain = await validDomain(c, req.body.domainId);
      const r = await c.query(
        "UPDATE access_requests SET domain_id=$2 WHERE id=$1 AND status<>'approved' RETURNING id",
        [id(req.params.id), domain],
      );
      if (!r.rows.length) throw new DomainError(404, "Request not found.");
      await log(c, req.user!.id, "request_domain", req.params.id, {
        domainId: domain,
      });
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/staff/requests/:id/:decision",
  wrap(async (req, res) => {
    const request = id(req.params.id),
      decision = req.params.decision;
    if (!["approve", "reject"].includes(decision))
      throw new DomainError(400, "Invalid decision.");
    await transaction(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM access_requests WHERE id=$1 AND status='pending' FOR UPDATE",
          [request],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(409, "This request is no longer pending.");
      const u = (
        await c.query("SELECT * FROM users WHERE email=$1 FOR UPDATE", [
          row.email,
        ])
      ).rows[0];
      if (!u || u.role !== "viewer")
        throw new DomainError(
          409,
          "Only candidate requests can be approved here.",
        );
      if (decision === "approve") {
        const domain = await validDomain(c, row.domain_id);
        await c.query(
          "UPDATE users SET is_allowed=1,domain_id=$2,approved_at=NOW(),access_version=access_version+1 WHERE id=$1",
          [u.id, domain],
        );
        await c.query(
          "INSERT INTO email_allowlist(email,added_by) VALUES($1,$2) ON CONFLICT(email) DO NOTHING",
          [u.email, req.user!.id],
        );
        await c.query("DELETE FROM session_state WHERE user_id=$1", [u.id]);
      }
      await c.query("UPDATE access_requests SET status=$2 WHERE id=$1", [
        request,
        decision === "approve" ? "approved" : "rejected",
      ]);
      await log(c, req.user!.id, `access_${decision}`, String(u.id), {
        requestId: request,
        domainId: row.domain_id,
      });
    });
    res.json({ ok: true });
  }),
);
router.patch(
  "/staff/candidates/:id/domain",
  wrap(async (req, res) => {
    await transaction(async (c) => {
      const domain = await validDomain(c, req.body.domainId);
      const user = id(req.params.id);
      const r = await c.query(
        "UPDATE users SET domain_id=$2,access_version=access_version+1 WHERE id=$1 AND role='viewer' RETURNING id",
        [user, domain],
      );
      if (!r.rows.length) throw new DomainError(404, "Candidate not found.");
      await c.query("DELETE FROM session_state WHERE user_id=$1", [user]);
      await log(c, req.user!.id, "candidate_domain", String(user), {
        domainId: domain,
      });
    });
    res.json({ ok: true });
  }),
);
export async function readiness(c: any = pgPool) {
  const r = await c.query(`SELECT
 (SELECT COUNT(*) FROM users u LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.role='viewer' AND u.is_allowed=1 AND (d.id IS NULL OR NOT d.active))::int AS candidates,
 (SELECT COUNT(*) FROM access_requests r LEFT JOIN learning_domains d ON d.id=r.domain_id WHERE r.status='pending' AND (d.id IS NULL OR NOT d.active))::int AS requests,
 (SELECT COUNT(*) FROM uploaded_terms t WHERE NOT archived AND NOT EXISTS(SELECT 1 FROM term_domains m JOIN learning_domains d ON d.id=m.domain_id AND d.active WHERE m.content_id=t.id))::int AS terms,
 (SELECT COUNT(*) FROM uploaded_interview t WHERE NOT archived AND NOT EXISTS(SELECT 1 FROM interview_domains m JOIN learning_domains d ON d.id=m.domain_id AND d.active WHERE m.content_id=t.id))::int AS passages,
 (SELECT enforced FROM domain_settings WHERE id=1) AS enforced`);
  return r.rows[0];
}
router.get(
  "/staff/readiness",
  wrap(async (_req, res) => res.json(await readiness())),
);
router.post(
  "/staff/enforce",
  requireAdmin,
  wrap(async (req, res) => {
    await transaction(async (c) => {
      const r = await readiness(c);
      if (r.candidates + r.requests + r.terms + r.passages > 0)
        throw new DomainError(409, "Complete the readiness checklist first.");
      await c.query("UPDATE domain_settings SET enforced=true WHERE id=1");
      await c.query(
        "UPDATE users SET access_version=access_version+1 WHERE role='viewer' AND google_id<>'local-development-bypass'",
      );
      await c.query("DELETE FROM session_state");
      await log(c, req.user!.id, "domain_enforcement", "all", {
        enabled: true,
      });
    });
    res.json({ ok: true });
  }),
);
router.get(
  "/staff/content",
  wrap(async (req, res) => {
    const kind = req.query.kind === "terms" ? "terms" : "interview",
      table = kind === "terms" ? "uploaded_terms" : "uploaded_interview",
      map = kind === "terms" ? "term_domains" : "interview_domains";
    res.json(
      (
        await pgPool.query(
          `SELECT t.*,COALESCE((SELECT json_agg(domain_id) FROM ${map} WHERE content_id=t.id),'[]') AS domain_ids FROM ${table} t ORDER BY t.id DESC`,
        )
      ).rows,
    );
  }),
);
router.patch(
  "/staff/content/:kind",
  wrap(async (req, res) => {
    const kind = req.params.kind;
    if (!["terms", "interview"].includes(kind))
      throw new DomainError(400, "Invalid content type.");
    const ids = req.body.ids,
      domains = req.body.domainIds,
      archived = req.body.archived;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      (domains !== undefined && !Array.isArray(domains)) ||
      (archived !== undefined && typeof archived !== "boolean")
    )
      throw new DomainError(400, "Select up to 500 items and valid domains.");
    const selected = ids.map(id);
    const table = kind === "terms" ? "uploaded_terms" : "uploaded_interview",
      map = kind === "terms" ? "term_domains" : "interview_domains";
    await transaction(async (c) => {
      const assigned =
        domains === undefined
          ? undefined
          : await Promise.all(
              [...new Set(domains)].map((d) => validDomain(c, d)),
            );
      const rows = (
        await c.query(
          `SELECT id FROM ${table} WHERE id=ANY($1::int[]) FOR UPDATE`,
          [selected],
        )
      ).rows;
      if (rows.length !== new Set(selected).size)
        throw new DomainError(404, "Content not found.");
      if (assigned) {
        await c.query(`DELETE FROM ${map} WHERE content_id=ANY($1::int[])`, [
          selected,
        ]);
        for (const d of assigned)
          await c.query(
            `INSERT INTO ${map}(content_id,domain_id) SELECT unnest($1::int[]),$2`,
            [selected, d],
          );
      }
      if (archived !== undefined)
        await c.query(
          `UPDATE ${table} SET archived=$2 WHERE id=ANY($1::int[])`,
          [selected, archived],
        );
      const r = await readiness(c);
      if (r.enforced && r.terms + r.passages > 0)
        throw new DomainError(
          409,
          "Active content must have an active domain.",
        );
      await c.query(
        "UPDATE users SET access_version=access_version+1 WHERE role='viewer' AND google_id<>'local-development-bypass'",
      );
      await c.query("DELETE FROM session_state");
      await log(c, req.user!.id, "content_domains", kind, {
        ids: selected,
        domainIds: assigned,
        archived,
      });
    });
    res.json({ ok: true });
  }),
);

// Existing upload URLs remain compatible; domains are committed with content.
for (const kind of ["terms", "interview"] as const)
  for (const suffix of ["", "/bulk"])
    router.post(
      "/admin/" + kind + suffix,
      requireUploader,
      wrap(async (req, res) => {
        const raw = suffix ? req.body.entries : [req.body];
        if (!Array.isArray(raw) || !raw.length || raw.length > 5000)
          throw new DomainError(400, "Supply between 1 and 5,000 entries.");
        const ds = req.body.domainIds;
        if (!Array.isArray(ds) || !ds.length)
          throw new DomainError(
            400,
            "Select at least one learning domain for this upload.",
          );
        await transaction(async (c) => {
          const domains = await Promise.all(
            [...new Set(ds)].map((d) => validDomain(c, d)),
          );
          for (const value of raw) {
            const row = { ...req.body, ...value };
            let inserted;
            if (kind === "terms") {
              if (
                !["t", "d", "c"].every(
                  (k) => typeof row[k] === "string" && row[k].trim(),
                ) ||
                ![2, 3, 4, 5].includes(Number(row.l))
              )
                throw new DomainError(
                  400,
                  "Every term requires a definition, category and level 2–5.",
                );
              inserted = await c.query(
                "INSERT INTO uploaded_terms(t,d,l,c,added_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
                [
                  row.t.trim(),
                  row.d.trim(),
                  Number(row.l),
                  row.c.trim(),
                  req.user!.id,
                ],
              );
            } else {
              if (
                !["question", "ideal_answer", "role", "company"].every(
                  (k) => typeof row[k] === "string" && row[k].trim(),
                )
              )
                throw new DomainError(
                  400,
                  "Every passage requires a question, answer, role and company.",
                );
              if (
                suffix &&
                (
                  await c.query(
                    "SELECT id FROM uploaded_interview WHERE lower(trim(question))=lower(trim($1))",
                    [row.question],
                  )
                ).rows.length
              )
                throw new DomainError(
                  409,
                  "This question already exists. Edit its domain assignments to share it.",
                );
              inserted = await c.query(
                "INSERT INTO uploaded_interview(question,ideal_answer,role,company,category,added_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
                [
                  row.question.trim(),
                  row.ideal_answer.trim(),
                  row.role.trim(),
                  row.company.trim(),
                  row.category?.trim() || "General",
                  req.user!.id,
                ],
              );
            }
            for (const d of domains)
              await c.query(
                `INSERT INTO ${kind === "terms" ? "term_domains" : "interview_domains"}(content_id,domain_id) VALUES($1,$2)`,
                [inserted.rows[0].id, d],
              );
          }
          await log(c, req.user!.id, "domain_content_upload", kind, {
            count: raw.length,
            domainIds: domains,
          });
        });
        res.json({ ok: true, imported: raw.length });
      }),
    );
router.patch(
  "/staff/content/:kind/:id",
  wrap(async (req, res) => {
    const kind = req.params.kind;
    if (!["terms", "interview"].includes(kind))
      throw new DomainError(400, "Invalid content type.");
    const fields =
      kind === "terms"
        ? ["t", "d", "c"]
        : ["question", "ideal_answer", "role", "company", "category"];
    if (
      !fields.every(
        (k) => typeof req.body[k] === "string" && req.body[k].trim(),
      )
    )
      throw new DomainError(400, "Complete all content fields.");
    if (kind === "terms" && ![2, 3, 4, 5].includes(Number(req.body.l)))
      throw new DomainError(400, "Choose level 2–5.");
    await transaction(async (c) => {
      const values = fields.map((k) => req.body[k].trim());
      if (kind === "terms") {
        fields.push("l");
        values.push(Number(req.body.l));
      }
      values.push(id(req.params.id));
      const r = await c.query(
        `UPDATE ${kind === "terms" ? "uploaded_terms" : "uploaded_interview"} SET ${fields.map((k, i) => k + "=$" + (i + 1)).join(",")} WHERE id=$${values.length} RETURNING id`,
        values,
      );
      if (!r.rows.length) throw new DomainError(404, "Content not found.");
      await c.query(
        "UPDATE users SET access_version=access_version+1 WHERE role='viewer' AND google_id<>'local-development-bypass'",
      );
      await c.query("DELETE FROM session_state");
      await log(c, req.user!.id, "content_edit", kind, {
        id: Number(req.params.id),
      });
    });
    res.json({ ok: true });
  }),
);
export default router;
