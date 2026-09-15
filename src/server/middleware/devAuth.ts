import type { RequestHandler } from "express";
import type { DbUser } from "./auth.ts";

export const DEV_GOOGLE_ID = "local-development-bypass";

export function devAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_AUTH_BYPASS === "true" &&
    (env.NODE_ENV === undefined || env.NODE_ENV === "development");
}

// Request-only identity: never serialize the bypass into a login session.
export function devAuth(user: DbUser): RequestHandler {
  return (req, _res, next) => {
    const address = req.socket.remoteAddress;
    if (devAuthEnabled() &&
        (address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1")) {
      req.user = { ...user, role: "admin", is_allowed: 1 };
    }
    next();
  };
}
