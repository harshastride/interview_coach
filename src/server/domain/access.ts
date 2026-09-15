import type { Request, Response, NextFunction } from "express";
import { pgPool } from "../db/pool.ts";
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const staff = (user: { role: string }) =>
  ["admin", "manager"].includes(user.role);
export function id(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647)
    throw new DomainError(400, "A valid ID is required.");
  return n;
}
export const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export async function scope(user: Express.User) {
  const r = await pgPool.query(
    `SELECT u.domain_id,u.access_version,d.name,d.active,s.enforced FROM users u CROSS JOIN domain_settings s LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.id=$1`,
    [user.id],
  );
  return r.rows[0] ?? { domain_id: null, access_version: 1, enforced: false };
}
export async function content(user: Express.User, kind: "terms" | "interview") {
  const s = await scope(user);
  const table = kind === "terms" ? "uploaded_terms" : "uploaded_interview";
  const map = kind === "terms" ? "term_domains" : "interview_domains";
  const restrict = s.enforced && !staff(user);
  const r = await pgPool.query(
    `SELECT c.* FROM ${table} c WHERE NOT c.archived AND ($1::boolean=false OR EXISTS(SELECT 1 FROM ${map} m JOIN learning_domains d ON d.id=m.domain_id AND d.active WHERE m.content_id=c.id AND m.domain_id=$2)) ORDER BY c.id`,
    [restrict, s.domain_id],
  );
  return r.rows;
}
export async function resolveContent(
  user: Express.User,
  kind: "terms" | "interview",
  value: unknown,
) {
  const n = id(value);
  const rows = await content(user, kind);
  const row = rows.find((r) => r.id === n);
  if (!row)
    throw new DomainError(404, "Content is unavailable in your domain.");
  return row;
}
// Runs after Passport. Validates stale clients before any content-specific action.
export async function domainGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await (async () => {
      if (!req.user) return;
      const s = await scope(req.user);
      res.locals.domain = s;
      res.set("Cache-Control", "no-store");
      const expected = `${req.user.id}:${s.domain_id ?? "none"}:${s.access_version}:${s.enforced}`;
      res.set("X-Access-Scope", expected);
      if (
        !req.path.startsWith("/auth/") &&
        req.headers["x-access-scope"] &&
        req.headers["x-access-scope"] !== expected
      )
        throw new DomainError(409, "Your access changed. Refresh to continue.");
      if (s.enforced && req.user.role === "admin") {
        if (req.path === "/admin/allowlist" && req.method === "POST") {
          const target = (
            await pgPool.query(
              "SELECT u.id FROM users u JOIN learning_domains d ON d.id=u.domain_id AND d.active WHERE lower(u.email)=lower($1)",
              [String(req.body?.email ?? "")],
            )
          ).rows[0];
          if (!target)
            throw new DomainError(
              409,
              "Assign the candidate an active domain before granting access.",
            );
        }
        if (/^\/admin\/users\/\d+$/.test(req.path) && req.method === "PATCH") {
          const target = (
            await pgPool.query(
              "SELECT u.*,d.active FROM users u LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.id=$1",
              [Number(req.path.split("/").at(-1))],
            )
          ).rows[0];
          if (
            target &&
            (req.body?.role ?? target.role) === "viewer" &&
            (req.body?.is_allowed ?? target.is_allowed) &&
            !target.active
          )
            throw new DomainError(
              409,
              "Assign an active domain before granting candidate access.",
            );
        }
      }
      if (!req.user.is_allowed || staff(req.user)) return;
      if (
        s.enforced &&
        (!s.domain_id || !s.active) &&
        !/^\/(auth|access-request|domains|staff)/.test(req.path)
      )
        throw new DomainError(403, "Your domain access needs staff review.");
    })();
    next();
  } catch (error) {
    next(error);
  }
}
