import express from "express";
import { pgPool } from "../db/pool.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = express.Router();

router.get("/:term", requireAuth, async (req, res) => {
  try {
    const term = decodeURIComponent(req.params.term).toLowerCase().trim();
    const result = await pgPool.query(
      "SELECT audio_data FROM tts_cache WHERE term = $1",
      [term]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    const audioBuffer: Buffer = result.rows[0].audio_data;
    return res.json({ audio: audioBuffer.toString("base64") });
  } catch (e) {
    console.error("TTS GET error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { term, audio } = req.body;
  if (!term || !audio) {
    return res.status(400).json({ error: "Missing term or audio" });
  }
  const normalized = String(term).toLowerCase().trim();
  try {
    const pcmBuffer = Buffer.from(audio, "base64");
    await pgPool.query(
      `INSERT INTO tts_cache (term, audio_data) VALUES ($1, $2)
       ON CONFLICT (term) DO UPDATE SET audio_data = $2, created_at = NOW()`,
      [normalized, pcmBuffer]
    );
    return res.json({ status: "ok" });
  } catch (e) {
    console.error("TTS save error:", e);
    return res.status(500).json({ error: "Failed to save" });
  }
});

export default router;
