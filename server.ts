import "dotenv/config";
import dotenv from "dotenv";
// Load .env.local so AI Studio / local dev can set GEMINI_API_KEY there
dotenv.config({ path: ".env.local", override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import rateLimit from "express-rate-limit";

import { pgPool } from "./src/server/db/pool.ts";
import { initPg } from "./src/server/db/init.ts";
import { csrfProtection } from "./src/server/middleware/auth.ts";
import authRouter, { apiAuthRouter } from "./src/server/routes/auth.ts";
import contentRouter from "./src/server/routes/content.ts";
import ttsRouter from "./src/server/routes/tts.ts";
import adminRouter from "./src/server/routes/admin.ts";
import aiRouter from "./src/server/routes/ai.ts";
import miscRouter from "./src/server/routes/misc.ts";
import studyRouter from "./src/server/routes/study.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PgSession = connectPgSimple(session);

async function startServer() {
  // Phase 1.6: Fail if SESSION_SECRET is missing in production
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.error("SESSION_SECRET is required in production");
    process.exit(1);
  }

  await initPg().catch((err) => {
    console.error("Failed to init PostgreSQL:", err);
    process.exit(1);
  });

  const app = express();
  app.set("trust proxy", 1);
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
  });
  app.use("/auth/", authLimiter);

  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3000,
    standardHeaders: true,
  });
  app.use("/api/admin/", uploadLimiter);

  const sessionStore = new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
  });

  const sessionSecret = process.env.SESSION_SECRET || "local-dev-session-secret";
  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET not set; using local development secret.");
  }

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.APP_URL?.startsWith("https") === true,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Phase 1.5: Apply CSRF protection globally (after session/passport init)
  app.use(csrfProtection);

  // ── Mount routes ────────────────────────────────────────────────────
  app.use("/auth", authRouter);
  app.use("/api/auth", apiAuthRouter);
  app.use("/api/content", contentRouter);
  app.use("/api/tts", ttsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api", miscRouter);
  app.use("/api/study", studyRouter);

  // Phase 1.3: Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // ── Vite dev or static serving ──────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
