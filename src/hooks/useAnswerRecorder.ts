import { useState, useRef, useCallback, useEffect } from 'react';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

/** Hard cap on a single reading recording (spec: 3 minutes) */
export const MAX_RECORDING_SEC = 180;

export interface ReadingDelivery {
  wpm: number;
  filler_count: number;
  long_pauses: number;
  pace: 'slow' | 'good' | 'fast';
  confidence_note: string;
}

export interface ReadingAnalysis {
  receiptId?: string;
  delivery_coaching?: import('../lib/readingCoaching').DeliveryCoachingPlan;
  assessment?: {
    provider: string; version: string; locale: string; kind: string; assessed_at: string;
    score_note: string; notice?: string;
    words?: { word: string; start: number; duration: number; accuracy: number | null; error: string; phonemes: { phoneme: string; accuracy: number | null }[] }[];
  };
  local_metrics?: { version?: string; transcript: string; scores: ReadingAnalysis['scores']; delivery: ReadingDelivery; missed_words: string[] };
  transcript: string;
  scores: { overall: number; accuracy: number; fluency: number; completeness: number };
  missed_words: string[];
  delivery: ReadingDelivery;
  strengths: string[];
  improvements: string[];
  coaching: string;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/**
 * Records the candidate's read-aloud attempt via MediaRecorder.
 * Both manual stop() and the auto-stop at MAX_RECORDING_SEC deliver the
 * finished recording through onComplete; cancel() discards it.
 */
export function useAnswerRecorder(onComplete: (rec: RecordingResult) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const generationRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const isSupported = !!pickMimeType();

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    clearTimer();
    cancelledRef.current = true;
    stop();
    setIsRecording(false);
  }, [stop]);

  const start = useCallback(async (existingStream?: MediaStream | null) => {
    if (recorderRef.current && recorderRef.current.state === 'recording') return;
    const generation = ++generationRef.current;
    const complete = onCompleteRef.current;
    const mimeType = pickMimeType();
    if (!mimeType) throw new Error('Recording is not supported in this browser');

    let stream = existingStream ?? null;
    let ownsStream = false;
    if (!stream || !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ownsStream = true;
    }
    if (generation !== generationRef.current) {
      if (ownsStream) stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const sourceStream = stream;
    // MediaRecorder must not receive the camera track
    const audioStream = new MediaStream(sourceStream.getAudioTracks());

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(audioStream, { mimeType });
    } catch (error) {
      if (ownsStream) sourceStream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    const chunks: Blob[] = [];
    cancelledRef.current = false;
    startedAtRef.current = performance.now();

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (ownsStream) sourceStream.getTracks().forEach((t) => t.stop());
      if (generation !== generationRef.current) return;
      clearTimer();
      setIsRecording(false);
      recorderRef.current = null;
      const durationSec = (performance.now() - startedAtRef.current) / 1000;
      if (cancelledRef.current) return;
      const blob = new Blob(chunks, { type: mimeType });
      complete({ blob, mimeType: mimeType.split(';')[0], durationSec });
    };

    try {
      recorder.start();
    } catch (error) {
      if (ownsStream) sourceStream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    recorderRef.current = recorder;
    setElapsedSec(0);
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      const sec = Math.floor((performance.now() - startedAtRef.current) / 1000);
      setElapsedSec(sec);
      if (sec >= MAX_RECORDING_SEC) stop();
    }, 1000);
  }, [stop]);

  useEffect(() => () => {
    generationRef.current += 1;
    cancelledRef.current = true;
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, []);

  return { isRecording, elapsedSec, isSupported, start, stop, cancel };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Send a recorded reading to the analysis endpoint. Returns null on failure. */
export async function analyzeReading(
  rec: RecordingResult,
  referenceText: string,
  question: string,
  contentId?: number,
): Promise<ReadingAnalysis | null> {
  try {
    const audio = await blobToBase64(rec.blob);
    const response = await fetch('/api/ai/analyze-reading', {
      method: 'POST',
      credentials: 'include',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(240000),
      body: JSON.stringify({
        audio,
        mimeType: rec.mimeType,
        referenceText,
        contentId,
        question,
        durationSec: rec.durationSec,
      }),
    });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Analysis failed. Please try again.'); }
    return await response.json();
  } catch (error) {
    throw error;
  }
}

/** Persist a completed attempt; callers retain the submission ID for safe retries. */
export async function saveReadingAttempt(payload: {
  submissionId?: string;
  question_ref: string;
  contentId?: number;
  role: string;
  attempt_no: number;
  analysis: ReadingAnalysis;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/reading-attempt', {
      method: 'POST',
      credentials: 'include',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        question_ref: payload.question_ref,
        receiptId: payload.analysis.receiptId,
        contentId:payload.contentId, submissionId:payload.submissionId ?? crypto.randomUUID(),
        role: payload.role,
        attempt_no: payload.attempt_no,
        scores: payload.analysis.scores,
        wpm: payload.analysis.delivery.wpm,
        filler_count: payload.analysis.delivery.filler_count,
        transcript: payload.analysis.transcript,
        feedback: payload.analysis,
      }),
    });
  } catch {
    // Network error or timeout — surface as a retryable save failure
    // instead of leaving the caller waiting on a promise that never settles.
    throw new Error('Your report could not be saved. Please retry.');
  }
  if (!response.ok) throw new Error('Your report could not be saved. Please retry.');
}
