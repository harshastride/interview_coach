"""
Local reading-analysis service (V2 of the reading-practice pipeline).

POST /analyze — same request/response contract as the Node route
/api/ai/analyze-reading (see docs/reading-practice-spec.md §3.3), so the
Express server can proxy here via ANALYSIS_URL with zero frontend changes.

Pipeline:
  audio → ffmpeg (16 kHz wav) → faster-whisper (verbatim transcript + word
  timestamps) → deterministic metrics (alignment, WPM, pauses, fillers,
  Praat prosody) → optional audEERING emotion model → Ollama coaching text
  (template fallback when Ollama is unavailable).

Scores are deterministic: the same audio always produces the same numbers,
so repetition progress reflects the candidate, not model noise.
"""

import base64
import difflib
import json
import os
import re
import subprocess
import tempfile

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="interview-coach-analysis")

FILLER_WORDS = {"um", "umm", "uh", "uhh", "er", "erm", "ah", "ahh", "hmm", "mmm"}
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
    "with", "that", "this", "these", "those", "is", "are", "was", "were", "be",
    "been", "it", "its", "as", "by", "from", "we", "you", "they", "our", "your",
    "their", "can", "will", "would", "should", "have", "has", "had", "not",
    "which", "when", "where", "what", "how", "into", "also", "than", "then",
    "them", "there", "here", "such", "each", "other", "more", "most", "some",
    "very", "just", "about", "over", "using", "used", "use",
}
LONG_PAUSE_SEC = 2.0
MAX_EMOTION_SEC = 60  # cap emotion-model input to bound CPU time


class AnalyzeRequest(BaseModel):
    audio: str
    mimeType: str
    referenceText: str
    question: str = ""
    durationSec: float = 0.0
    coaching: bool = True


# ── Model loading (lazy, cached) ─────────────────────────────────────────

_whisper = None


def get_whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(
            os.getenv("WHISPER_MODEL", "small"),
            device="cpu",
            compute_type="int8",
        )
    return _whisper


# ── Audio handling ───────────────────────────────────────────────────────

EXT_BY_MIME = {
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
}


def decode_to_wav(audio_b64: str, mime_type: str, workdir: str) -> str:
    try:
        raw = base64.b64decode(audio_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="audio is not valid base64")
    if not raw:
        raise HTTPException(status_code=400, detail="audio is empty")

    in_path = os.path.join(workdir, "input" + EXT_BY_MIME.get(mime_type, ".webm"))
    wav_path = os.path.join(workdir, "audio.wav")
    with open(in_path, "wb") as f:
        f.write(raw)

    result = subprocess.run(
        ["ffmpeg", "-y", "-i", in_path, "-ac", "1", "-ar", "16000", wav_path],
        capture_output=True,
    )
    if result.returncode != 0 or not os.path.exists(wav_path):
        raise HTTPException(status_code=400, detail="could not decode audio")
    return wav_path


# ── Transcription ────────────────────────────────────────────────────────

def transcribe(wav_path: str):
    """Verbatim transcript + word timings. The initial_prompt biases whisper
    to keep filler sounds it would otherwise clean up."""
    segments, _info = get_whisper().transcribe(
        wav_path,
        language="en",
        word_timestamps=True,
        initial_prompt=(
            "Um, uh, er... so, um, transcribe every filler word, "
            "hesitation and repeated word exactly as spoken."
        ),
    )
    words = []
    texts = []
    for seg in segments:
        texts.append(seg.text.strip())
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
    return " ".join(t for t in texts if t), words


# ── Deterministic metrics ────────────────────────────────────────────────

def norm_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def align(reference: str, transcript: str):
    ref = norm_words(reference)
    spoken_all = norm_words(transcript)
    spoken = [w for w in spoken_all if w not in FILLER_WORDS]

    sm = difflib.SequenceMatcher(None, ref, spoken, autojunk=False)
    blocks = sm.get_matching_blocks()
    matched = sum(b.size for b in blocks)

    completeness = round(100 * matched / max(len(ref), 1))
    accuracy = round(100 * matched / max(len(spoken), 1)) if spoken else 0

    matched_ref = set()
    for b in blocks:
        matched_ref.update(range(b.a, b.a + b.size))
    missed, seen = [], set()
    for i, w in enumerate(ref):
        if i not in matched_ref and len(w) > 3 and w not in STOP_WORDS and w not in seen:
            missed.append(w)
            seen.add(w)

    restarts = sum(1 for i in range(len(spoken_all) - 1) if spoken_all[i] == spoken_all[i + 1])
    return accuracy, completeness, missed[:8], restarts, spoken_all


def pause_stats(words: list[dict]) -> int:
    long_pauses = 0
    for prev, cur in zip(words, words[1:]):
        if cur["start"] - prev["end"] > LONG_PAUSE_SEC:
            long_pauses += 1
    return long_pauses


def _pitch_stats_numpy(wav_path: str) -> dict:
    """Autocorrelation pitch tracker — fallback for platforms without a
    parselmouth wheel (e.g. linux/arm64). 40 ms frames, 60-350 Hz range."""
    import wave

    with wave.open(wav_path, "rb") as w:
        rate = w.getframerate()
        signal = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

    frame = int(0.04 * rate)
    hop = int(0.02 * rate)
    lag_lo, lag_hi = int(rate / 350), int(rate / 60)
    if len(signal) < frame or lag_hi <= lag_lo:
        return {}

    f0s = []
    for start in range(0, len(signal) - frame, hop):
        x = signal[start : start + frame]
        if np.sqrt(np.mean(x**2)) < 0.02:  # silence
            continue
        x = x - np.mean(x)
        ac = np.correlate(x, x, mode="full")[frame - 1 :]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        seg = ac[lag_lo : min(lag_hi, len(ac))]
        if seg.size == 0:
            continue
        peak = int(np.argmax(seg))
        if seg[peak] < 0.3:  # unvoiced
            continue
        f0s.append(rate / (lag_lo + peak))

    if len(f0s) < 10:
        return {}
    arr = np.array(f0s)
    mean = float(np.mean(arr))
    cv = float(np.std(arr) / mean) if mean > 0 else 0.0
    return {"pitch_mean_hz": round(mean, 1), "pitch_cv": round(cv, 3)}


def prosody(wav_path: str) -> dict:
    """Pitch statistics — coefficient of variation separates monotone
    (< 0.10) from expressive delivery; very high values suggest unsteadiness.
    Uses Praat when available, numpy autocorrelation otherwise."""
    try:
        import parselmouth
    except Exception:
        try:
            return _pitch_stats_numpy(wav_path)
        except Exception:
            return {}
    try:
        snd = parselmouth.Sound(wav_path)
        pitch = snd.to_pitch()
        freqs = pitch.selected_array["frequency"]
        voiced = freqs[freqs > 0]
        if len(voiced) < 10:
            return {}
        mean = float(np.mean(voiced))
        cv = float(np.std(voiced) / mean) if mean > 0 else 0.0
        return {"pitch_mean_hz": round(mean, 1), "pitch_cv": round(cv, 3)}
    except Exception:
        return {}


def emotion(wav_path: str) -> dict | None:
    if os.getenv("ENABLE_EMOTION") != "1":
        return None
    try:
        from emotion_model import analyze_emotion

        return analyze_emotion(wav_path, max_sec=MAX_EMOTION_SEC)
    except Exception:
        return None


def clamp100(v: float) -> int:
    return max(0, min(100, round(v)))


def pace_of(wpm: int) -> str:
    return "slow" if wpm < 120 else "fast" if wpm > 170 else "good"


def build_confidence_note(wpm: int, long_pauses: int, fillers: int, pros: dict, emo: dict | None) -> str:
    parts = []
    if emo is not None:
        dom = emo.get("dominance", 0.5)
        if dom >= 0.6:
            parts.append("The delivery sounds assured")
        elif dom <= 0.4:
            parts.append("The delivery sounds hesitant")
        else:
            parts.append("The delivery sounds fairly steady")
    cv = pros.get("pitch_cv")
    if cv is not None:
        if cv < 0.10:
            parts.append("fairly monotone — add some vocal variety")
        elif cv > 0.40:
            parts.append("pitch is unsteady — one calm breath before starting helps")
    if long_pauses >= 3:
        parts.append(f"{long_pauses} long pauses broke the flow")
    if fillers >= 5:
        parts.append(f"{fillers} filler sounds crept in")
    if wpm > 170:
        parts.append("the pace was rushed")
    elif wpm and wpm < 120:
        parts.append("the pace was slow")
    if not parts:
        return "Steady, confident delivery — keep it up."
    return "; ".join(parts) + "."


# ── Coaching (Ollama with deterministic fallback) ────────────────────────

COACH_SCHEMA = {
    "type": "object",
    "properties": {
        "strengths": {"type": "array", "items": {"type": "string"}},
        "improvements": {"type": "array", "items": {"type": "string"}},
        "coaching": {"type": "string"},
    },
    "required": ["strengths", "improvements", "coaching"],
}


def ollama_coach(metrics: dict) -> dict | None:
    url = os.getenv("OLLAMA_URL")
    if not url:
        return None
    prompt = f"""You are an encouraging speech coach for interview preparation.
A candidate just read a technical answer aloud as practice. Their measured results:

{json.dumps(metrics, indent=2)}

Write feedback for their NEXT repetition:
- strengths: 1-2 things they did well (grounded in the numbers)
- improvements: 2-3 specific, actionable tips (mention concrete words/numbers from the data)
- coaching: one encouraging sentence

Respond as JSON."""
    try:
        r = requests.post(
            f"{url.rstrip('/')}/api/generate",
            json={
                "model": os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
                "prompt": prompt,
                "stream": False,
                "format": COACH_SCHEMA,
                "options": {"temperature": 0.4},
            },
            timeout=90,
        )
        r.raise_for_status()
        out = json.loads(r.json().get("response", "{}"))
        if out.get("coaching") and isinstance(out.get("improvements"), list):
            return {
                "strengths": [str(s) for s in out.get("strengths", [])][:2],
                "improvements": [str(s) for s in out["improvements"]][:3],
                "coaching": str(out["coaching"]),
            }
    except Exception:
        pass
    return None


def template_coach(m: dict) -> dict:
    strengths, improvements = [], []
    if m["scores"]["completeness"] >= 85:
        strengths.append("You read the full answer through — great commitment.")
    if m["scores"]["accuracy"] >= 85:
        strengths.append("Your wording stayed very close to the text.")
    if m["delivery"]["pace"] == "good":
        strengths.append(f"Nice steady pace at {m['delivery']['wpm']} wpm.")
    if not strengths:
        strengths.append("You completed a full practice attempt — that is how progress starts.")

    if m["missed_words"]:
        improvements.append(
            "Practice these words before the next attempt: " + ", ".join(m["missed_words"][:4]) + "."
        )
    if m["delivery"]["filler_count"] >= 3:
        improvements.append(
            f"You used {m['delivery']['filler_count']} filler sounds — pause silently instead of saying 'um'."
        )
    if m["delivery"]["long_pauses"] >= 2:
        improvements.append("Scan the next sentence with your eyes while finishing the current one to avoid long stops.")
    if m["delivery"]["pace"] == "fast":
        improvements.append(f"Slow down — {m['delivery']['wpm']} wpm is rushed; aim for 140-160.")
    elif m["delivery"]["pace"] == "slow":
        improvements.append(f"Pick up the pace a little — {m['delivery']['wpm']} wpm; aim for 140-160.")
    if m["scores"]["completeness"] < 70:
        improvements.append("Part of the answer was skipped — read it to the end next time.")
    if not improvements:
        improvements.append("Polish the delivery: vary your tone slightly on key terms for emphasis.")

    return {
        "strengths": strengths[:2],
        "improvements": improvements[:3],
        "coaching": "Every repetition builds fluency — go again and beat this score.",
    }


# ── Endpoint ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.audio or not req.referenceText:
        raise HTTPException(status_code=400, detail="audio and referenceText are required")

    with tempfile.TemporaryDirectory() as workdir:
        wav_path = decode_to_wav(req.audio, req.mimeType, workdir)
        transcript, words = transcribe(wav_path)

        duration = max(req.durationSec, words[-1]["end"] if words else 0.0, 1.0)
        word_count = len(norm_words(transcript))
        wpm = round(word_count / duration * 60)

        accuracy, completeness, missed, restarts, spoken_all = align(req.referenceText, transcript)
        filler_count = sum(1 for w in spoken_all if w in FILLER_WORDS)
        long_pauses = pause_stats(words)
        pros = prosody(wav_path)
        emo = emotion(wav_path)

    pace = pace_of(wpm)
    fluency = clamp100(
        100
        - 8 * long_pauses
        - 4 * filler_count
        - 5 * restarts
        - (10 if wpm < 100 or wpm > 190 else 5 if pace != "good" else 0)
    )
    overall = clamp100(0.4 * accuracy + 0.3 * fluency + 0.3 * completeness)

    delivery = {
        "wpm": wpm,
        "filler_count": filler_count,
        "long_pauses": long_pauses,
        "pace": pace,
        "confidence_note": build_confidence_note(wpm, long_pauses, filler_count, pros, emo),
    }

    metrics = {
        "scores": {"overall": overall, "accuracy": accuracy, "fluency": fluency, "completeness": completeness},
        "missed_words": missed,
        "delivery": delivery,
        "restarts": restarts,
        "prosody": pros,
        "emotion_dims": emo,
        "question": req.question,
    }
    coach = (ollama_coach(metrics) if req.coaching else None) or template_coach(metrics)

    return {
        "transcript": transcript,
        "scores": metrics["scores"],
        "missed_words": missed,
        "delivery": delivery,
        "strengths": coach["strengths"],
        "improvements": coach["improvements"],
        "coaching": coach["coaching"],
    }
