import express from "express";
import { GoogleGenAI } from "@google/genai";
import { pgPool } from "../db/pool.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = express.Router();

function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

// ── POST /tts – Generate TTS via Gemini (cache-first) ──────────────────
router.post("/tts", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    const normalized = String(text).toLowerCase().trim();

    // Check cache first
    const cached = await pgPool.query(
      "SELECT audio_data FROM tts_cache WHERE term = $1",
      [normalized]
    );
    if (cached.rows.length > 0) {
      const audioBuffer: Buffer = cached.rows[0].audio_data;
      return res.json({ audio: audioBuffer.toString("base64") });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Generate a clear, professional text-to-speech audio pronunciation for the following term. Only pronounce the term itself, nothing else: "${text.trim()}"`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(
      (p: Record<string, unknown>) => p.inlineData
    );
    if (!audioPart || !audioPart.inlineData?.data) {
      return res.status(500).json({ error: "No audio generated" });
    }

    const audioBase64 = audioPart.inlineData.data;

    // Cache the result
    const pcmBuffer = Buffer.from(audioBase64, "base64");
    await pgPool.query(
      `INSERT INTO tts_cache (term, audio_data) VALUES ($1, $2)
       ON CONFLICT (term) DO UPDATE SET audio_data = $2, created_at = NOW()`,
      [normalized, pcmBuffer]
    );

    return res.json({ audio: audioBase64 });
  } catch (e) {
    console.error("AI TTS error:", e);
    return res.status(500).json({ error: "TTS generation failed" });
  }
});

// Helper: get all unique text items that need TTS (terms, definitions, interview Q&A)
const ALL_CONTENT_QUERY = `
  SELECT DISTINCT item FROM (
    SELECT LOWER(TRIM(t)) AS item FROM uploaded_terms
    UNION
    SELECT LOWER(TRIM(d)) AS item FROM uploaded_terms
    UNION
    SELECT LOWER(TRIM(question)) AS item FROM uploaded_interview
    UNION
    SELECT LOWER(TRIM(ideal_answer)) AS item FROM uploaded_interview
  ) sub
  WHERE item IS NOT NULL AND item <> ''
`;

// ── GET /tts/stats – How many content items have cached TTS ─────────────
router.get("/tts/stats", requireAuth, async (_req, res) => {
  try {
    const totalResult = await pgPool.query(
      `SELECT COUNT(*) AS total FROM (${ALL_CONTENT_QUERY}) t`
    );
    const cachedResult = await pgPool.query(
      `SELECT COUNT(*) AS cached FROM tts_cache
       WHERE term IN (${ALL_CONTENT_QUERY})`
    );
    const total = Number(totalResult.rows[0]?.total ?? 0);
    const cached = Number(cachedResult.rows[0]?.cached ?? 0);
    return res.json({ total, cached, missing: total - cached });
  } catch (e) {
    console.error("TTS stats error:", e);
    return res.status(500).json({ error: "Failed to get TTS stats" });
  }
});

// ── Background TTS job state ─────────────────────────────────────────────
let ttsJob: {
  running: boolean;
  generated: number;
  failed: number;
  total: number;
  current: string;
  startedAt: number;
} = { running: false, generated: 0, failed: 0, total: 0, current: "", startedAt: 0 };

async function runTtsJob(ai: GoogleGenAI) {
  const MAX_RETRIES = 2;
  const RATE_LIMIT_DELAY = 7000;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const result = await pgPool.query(
    `SELECT item AS term FROM (${ALL_CONTENT_QUERY}) sub
     WHERE item NOT IN (SELECT term FROM tts_cache)`
  );
  const uncachedTerms: string[] = result.rows.map(
    (r: { term: string }) => r.term
  );

  ttsJob.total = uncachedTerms.length;
  ttsJob.generated = 0;
  ttsJob.failed = 0;

  if (uncachedTerms.length === 0) {
    ttsJob.running = false;
    return;
  }

  for (let i = 0; i < uncachedTerms.length; i++) {
    if (!ttsJob.running) break; // cancelled

    const term = uncachedTerms[i];
    ttsJob.current = term;
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Read the following text aloud clearly and professionally. Only speak the text, nothing else: "${term}"`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
          },
        });

        const audioPart = response.candidates?.[0]?.content?.parts?.find(
          (p: Record<string, unknown>) => p.inlineData
        );
        if (audioPart?.inlineData?.data) {
          const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
          await pgPool.query(
            `INSERT INTO tts_cache (term, audio_data) VALUES ($1, $2)
             ON CONFLICT (term) DO UPDATE SET audio_data = $2, created_at = NOW()`,
            [term, pcmBuffer]
          );
          ttsJob.generated++;
          success = true;
          break;
        } else {
          break;
        }
      } catch (err: unknown) {
        const isRateLimit = err instanceof Error && err.message?.includes("429");
        if (isRateLimit && attempt < MAX_RETRIES) {
          console.log(`TTS bulk: rate limited for "${term}", retrying in 15s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await delay(15000);
          continue;
        }
        console.error(`TTS bulk: failed for "${term}":`, err);
        break;
      }
    }

    if (!success) ttsJob.failed++;

    // Rate limit between requests
    if (i < uncachedTerms.length - 1 && ttsJob.running) {
      await delay(RATE_LIMIT_DELAY);
    }
  }

  ttsJob.running = false;
  ttsJob.current = "";
  console.log(`TTS bulk done: ${ttsJob.generated} generated, ${ttsJob.failed} failed out of ${ttsJob.total}`);
}

// ── POST /tts/bulk-generate – Kick off background TTS generation ─────────
router.post("/tts/bulk-generate", requireAuth, async (req, res) => {
  try {
    const user = (req as unknown as { user?: { role?: string } }).user;
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return res.status(403).json({ error: "Admin or manager role required" });
    }

    if (ttsJob.running) {
      return res.json({ message: "Already running", ...ttsJob });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    // Start background job
    ttsJob = { running: true, generated: 0, failed: 0, total: 0, current: "starting...", startedAt: Date.now() };
    runTtsJob(ai).catch((e) => {
      console.error("TTS background job error:", e);
      ttsJob.running = false;
    });

    return res.json({ message: "Started", running: true });
  } catch (e) {
    console.error("TTS bulk-generate error:", e);
    return res.status(500).json({ error: "Bulk TTS generation failed" });
  }
});

// ── GET /tts/job – Get background job status ─────────────────────────────
router.get("/tts/job", requireAuth, async (_req, res) => {
  return res.json({ ...ttsJob });
});

// ── POST /tts/cancel – Cancel running background job ─────────────────────
router.post("/tts/cancel", requireAuth, async (req, res) => {
  const user = (req as unknown as { user?: { role?: string } }).user;
  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return res.status(403).json({ error: "Admin or manager role required" });
  }
  ttsJob.running = false;
  return res.json({ message: "Cancelled" });
});

// ── DELETE /tts/cache – Clear all cached TTS audio ────────────────────────
router.delete("/tts/cache", requireAuth, async (req, res) => {
  try {
    const user = (req as unknown as { user?: { role?: string } }).user;
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return res.status(403).json({ error: "Admin or manager role required" });
    }

    const result = await pgPool.query("DELETE FROM tts_cache");
    const deleted = result.rowCount ?? 0;
    return res.json({ deleted, message: `Deleted ${deleted} cached TTS entries` });
  } catch (e) {
    console.error("TTS cache delete error:", e);
    return res.status(500).json({ error: "Failed to delete TTS cache" });
  }
});

// ── POST /explain – Generate quiz explanation ───────────────────────────
router.post("/explain", requireAuth, async (req, res) => {
  try {
    const { term, definition, selectedOption } = req.body;
    if (!term || !definition || !selectedOption) {
      return res.status(400).json({ error: "term, definition, and selectedOption are required" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a helpful Azure data engineering tutor. A student was quizzed on this term:

Term: ${term}
Correct Definition: ${definition}
Student's Answer: ${selectedOption}

Explain briefly (2-3 sentences) why the correct answer is right and, if the student chose incorrectly, why their answer was wrong. Be encouraging and educational.`,
            },
          ],
        },
      ],
    });

    const explanation = response.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate explanation.";
    return res.json({ explanation });
  } catch (e) {
    console.error("AI explain error:", e);
    return res.status(500).json({ error: "Explanation generation failed" });
  }
});

// ── POST /compare – Compare spoken answer ───────────────────────────────
router.post("/compare", requireAuth, async (req, res) => {
  try {
    const { transcription, correctTerm } = req.body;
    if (!transcription || !correctTerm) {
      return res.status(400).json({ error: "transcription and correctTerm are required" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Compare the following spoken transcription to the correct term and score the pronunciation accuracy.

Spoken transcription: "${transcription}"
Correct term: "${correctTerm}"

Respond with JSON only (no markdown): { "score": <number 0-100>, "feedback": "<brief feedback>", "isMatch": <boolean> }
Score 80+ means it's a match. Consider phonetic similarity, not just exact text match.`,
            },
          ],
        },
      ],
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Strip potential markdown code fences
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return res.json({
        score: Number(parsed.score) || 0,
        feedback: String(parsed.feedback || ""),
        isMatch: Boolean(parsed.isMatch),
      });
    } catch {
      return res.json({ score: 0, feedback: "Could not parse comparison result.", isMatch: false });
    }
  } catch (e) {
    console.error("AI compare error:", e);
    return res.status(500).json({ error: "Comparison failed" });
  }
});

// ── POST /transcribe – Transcribe audio via Gemini ──────────────────────
router.post("/transcribe", requireAuth, async (req, res) => {
  try {
    const { audio, mimeType, context } = req.body;
    if (!audio || !mimeType) {
      return res.status(400).json({ error: "audio and mimeType are required" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    const contextHint = context ? ` The speaker is likely saying a term related to: ${context}.` : "";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: audio,
              },
            },
            {
              text: `Transcribe this audio recording exactly as spoken. Return only the transcription text, nothing else.${contextHint}`,
            },
          ],
        },
      ],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.json({ text: text.trim() });
  } catch (e) {
    console.error("AI transcribe error:", e);
    return res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
