import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { content, resolveContent, staff, DomainError } from "./access.ts";
import { slug } from "../../lib/slug.ts";
// A single boundary covers alternative AI, cached-audio and study endpoints.
export async function practiceGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.is_allowed) return next();
    const s = res.locals.domain;
    const strict = s?.enforced && !staff(req.user);
    const body = req.body ?? {};
    if (
      [
        "/ai/analyze-reading",
        "/ai/evaluate-answer",
        "/reading-attempt",
      ].includes(req.path) &&
      req.method === "POST"
    ) {
      if (body.contentId != null) {
        const row = await resolveContent(req.user, "interview", body.contentId);
        body.referenceText = row.ideal_answer;
        body.idealAnswer = row.ideal_answer;
        body.question = row.question;
        body.question_ref = row.question;
        body.role = row.role;
        res.locals.contentId = row.id;
        res.locals.contentHash = createHash("sha256")
          .update(row.ideal_answer)
          .digest("hex");
      } else if (strict)
        throw new DomainError(
          400,
          "Select a passage from your domain before recording.",
        );
    }
    if (strict) {
      if (
        [
          "/ai/tts/stats",
          "/ai/tts/job",
          "/ai/tts/bulk-generate",
          "/ai/tts/cancel",
        ].includes(req.path)
      )
        throw new DomainError(403, "Staff access required.");
      if (
        req.path.startsWith("/study/") ||
        ["/ai/explain", "/ai/compare"].includes(req.path)
      ) {
        const terms = await content(req.user, "terms");
        const termKey = body.term_slug ?? body.term ?? body.correctTerm;
        if (termKey != null) {
          const match = terms.find(
            (t) => `term-${t.id}` === termKey || t.t === termKey,
          );
          if (!match)
            throw new DomainError(404, "Term unavailable in your domain.");
          if (req.path === "/ai/explain") {
            body.term = match.t;
            body.definition = match.d;
          }
        }
      }
      if (req.path.startsWith("/tts/") || req.path === "/ai/tts") {
        const text = String(
          body.text ?? body.term ?? decodeURIComponent(req.path.slice(5)),
        )
          .trim()
          .toLowerCase();
        const [terms, passages] = await Promise.all([
          content(req.user, "terms"),
          content(req.user, "interview"),
        ]);
        const allowed = [
          ...terms.flatMap((t) => [t.t, t.d]),
          ...passages.flatMap((p) => [p.question, p.ideal_answer]),
        ].some(
          (t) =>
            String(t).trim().toLowerCase() === text ||
            (String(t).match(/[^.!?]+[.!?]*/g) ?? []).some(sentence => sentence.trim().toLowerCase() === text) ||
            (!text.includes(" ") &&
              String(t).toLowerCase().split(/\W+/).includes(text)),
        );
        if (!allowed)
          throw new DomainError(404, "Audio unavailable in your domain.");
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}
