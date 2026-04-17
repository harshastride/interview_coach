import express from "express";
import { pgPool } from "../db/pool.ts";

// ── Types ──────────────────────────────────────────────────────────────
export interface DbUser {
  id: number;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  is_allowed: number;
}

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
export async function audit(
  userId: number,
  action: string,
  target: string,
  detail?: object
) {
  await pgPool.query(
    "INSERT INTO audit_log (performed_by, action, target, detail) VALUES ($1, $2, $3, $4)",
    [userId, action, target, detail ? JSON.stringify(detail) : null]
  );
}

// ── Middleware ──────────────────────────────────────────────────────────
export function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const u = req.user as DbUser;
  if (!u.is_allowed) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

export function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if ((req.user as DbUser).role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

export function requireUploader(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const role = (req.user as DbUser).role;
  if (role !== "admin" && role !== "manager") {
    return res.status(403).json({ error: "Admin or manager only" });
  }
  next();
}

// ── Phase 1.5: CSRF Protection ────────────────────────────────────────
export function csrfProtection(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Skip for OAuth redirect routes
  if (req.path.startsWith("/auth/")) {
    return next();
  }

  const method = req.method.toUpperCase();
  if (method === "POST" || method === "PATCH" || method === "DELETE") {
    const contentTypeHeader = req.headers["content-type"];
    const requestedWithHeader = req.headers["x-requested-with"];
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0] ?? ""
      : contentTypeHeader ?? "";
    const xRequestedWith = Array.isArray(requestedWithHeader)
      ? requestedWithHeader[0] ?? ""
      : requestedWithHeader ?? "";

    if (
      !contentType.includes("application/json") ||
      xRequestedWith.toLowerCase() !== "xmlhttprequest"
    ) {
      return res.status(403).json({ error: "CSRF validation failed" });
    }
  }

  next();
}
