import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pgPool } from "../db/pool.ts";
import type { DbUser } from "../middleware/auth.ts";

const router = express.Router();

// ── Passport configuration ─────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.APP_URL || "http://localhost:3000"}/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName ?? "User";
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          // Single query: check user + count + allowlist in parallel
          const [userRes, countRes, allowRes] = await Promise.all([
            pgPool.query("SELECT * FROM users WHERE google_id = $1", [googleId]),
            pgPool.query("SELECT COUNT(*) as c FROM users"),
            pgPool.query("SELECT 1 FROM email_allowlist WHERE email = $1", [email]),
          ]);

          let user = userRes.rows[0] as DbUser | undefined;
          const count = parseInt(String((countRes.rows[0] as any).c), 10);
          const onAllowlist = !!allowRes.rows[0];

          if (!user) {
            const role = count === 0 ? "admin" : "viewer";
            const isAllowed = count === 0 ? 1 : onAllowlist ? 1 : 0;
            // INSERT RETURNING — no need for a separate SELECT
            const insertRes = await pgPool.query(
              `INSERT INTO users (google_id, email, name, avatar_url, role, is_allowed, last_login)
               VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
              [googleId, email, name, avatarUrl, role, isAllowed]
            );
            user = insertRes.rows[0] as DbUser;
          } else {
            const isAllowed = user.is_allowed ? 1 : onAllowlist ? 1 : 0;
            // UPDATE RETURNING — no need for a separate SELECT
            const updateRes = await pgPool.query(
              `UPDATE users SET name = $1, avatar_url = $2, last_login = NOW(), is_allowed = $3
               WHERE id = $4 RETURNING *`,
              [name, avatarUrl, isAllowed, user.id]
            );
            user = updateRes.rows[0] as DbUser;
          }
          done(null, user);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    )
  );
} else {
  console.warn("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set; OAuth login disabled.");
}

passport.serializeUser((user: Express.User, done) => done(null, user.id));
passport.deserializeUser(async (id: number, done) => {
  try {
    const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = (res.rows[0] as DbUser | undefined) || null;
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ── OAuth routes (mounted at /auth) ────────────────────────────────────
router.get("/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send("OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env");
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", { session: true }),
  (req, res, next) => {
    const u = req.user as DbUser;
    req.session.save((err) => {
      if (err) return next(err);
      if (u?.is_allowed) {
        res.redirect("/");
      } else {
        res.redirect("/access-denied");
      }
    });
  }
);

// ── API auth routes (mounted at /api/auth) ─────────────────────────────
export const apiAuthRouter = express.Router();

apiAuthRouter.get("/me", (req, res) => {
  if (!req.isAuthenticated?.()) {
    return res.json({ authenticated: false });
  }
  const u = req.user as DbUser;
  res.json({
    authenticated: true,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      avatar_url: u.avatar_url,
      role: u.role,
      isAllowed: !!u.is_allowed,
    },
  });
});

// Combined bootstrap — auth + content in one round trip
apiAuthRouter.get("/bootstrap", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    return res.json({ authenticated: false });
  }
  const u = req.user as DbUser;
  const user = {
    id: u.id, email: u.email, name: u.name,
    avatar_url: u.avatar_url, role: u.role, isAllowed: !!u.is_allowed,
  };

  if (!u.is_allowed) {
    return res.json({ authenticated: true, user, terms: [], interview: [] });
  }

  // Fetch content in parallel
  const [terms, interview] = await Promise.all([
    pgPool.query("SELECT t, d, l, c FROM uploaded_terms"),
    pgPool.query("SELECT question, ideal_answer, role, company, category FROM uploaded_interview"),
  ]);

  res.json({
    authenticated: true,
    user,
    terms: terms.rows,
    interview: interview.rows,
  });
});

apiAuthRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

export default router;
