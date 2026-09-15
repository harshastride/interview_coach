import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
export class ReadingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function normalizeAudio(audio: string) {
  if (typeof audio !== 'string' || audio.length > 16_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    throw new ReadingError(400, 'Invalid or oversized audio recording.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'reading-'));
  try {
    const input = join(dir, 'input');
    const output = join(dir, 'audio.pcm');
    await writeFile(input, Buffer.from(audio, 'base64'));
    // Decode at most 181 seconds so malformed metadata cannot bypass the cap.
    await exec('ffmpeg', ['-nostdin', '-v', 'error', '-i', input, '-t', '181', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', output], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const pcm = await readFile(output);
    const duration = pcm.length / 32000;
    if (duration < 2 || duration > 180.5) throw new ReadingError(400, 'Record between 2 seconds and 3 minutes.');
    return { pcm, duration };
  } catch (error) {
    if (error instanceof ReadingError) throw error;
    throw new ReadingError(400, 'Audio could not be decoded. Check the recording format and server ffmpeg installation.');
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export type AzureWord = {
  Word: string; Offset: number; Duration: number;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Phonemes?: { Phoneme: string; PronunciationAssessment?: { AccuracyScore?: number } }[];
};
export type AzureSegment = { Words: AzureWord[]; PronunciationAssessment: { AccuracyScore: number; FluencyScore: number }; Display: string };
const score = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

// Levenshtein alignment preserves repeated words and marks omissions/insertions
// across segment boundaries (EnableMiscue is unsupported in continuous mode).
export function alignReading(reference: string, spoken: string) {
  const a = tokens(reference), b = tokens(spoken);
  const matrix = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
  }
  let i = a.length, j = b.length, matched = 0;
  const omitted: string[] = [], inserted: string[] = [], substituted: string[] = [];
  while (i || j) {
    if (i && j && matrix[i][j] === matrix[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1])) {
      if (a[i - 1] === b[j - 1]) matched++; else substituted.push(a[i - 1]);
      i--; j--;
    } else if (i && matrix[i][j] === matrix[i - 1][j] + 1) { omitted.push(a[--i]); }
    else { inserted.push(b[--j]); }
  }
  return { completeness: score(100 * matched / Math.max(1, a.length)), omitted: omitted.reverse(), inserted: inserted.reverse(), substituted: substituted.reverse() };
}
export function summarizeAzure(segments: AzureSegment[], reference: string, locale: string) {
  const words = segments.flatMap(s => s.Words ?? []);
  if (!words.length) throw new ReadingError(422, 'No speech was recognised. Check your microphone and read again.');
  const transcript = words.map(w => w.Word).join(' ');
  const alignment = alignReading(reference, transcript);
  const weights = segments.map(s => Math.max(1, (s.Words ?? []).reduce((sum, w) => sum + w.Duration, 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  for (const segment of segments) {
    if (!Number.isFinite(segment.PronunciationAssessment?.AccuracyScore) || !Number.isFinite(segment.PronunciationAssessment?.FluencyScore)) {
      throw new ReadingError(502, 'Speech assessment returned incomplete scores. Please try again.');
    }
  }
  const accuracy = score(segments.reduce((sum, s, i) => sum + s.PronunciationAssessment.AccuracyScore * weights[i], 0) / total);
  const fluency = score(segments.reduce((sum, s, i) => sum + s.PronunciationAssessment.FluencyScore * weights[i], 0) / total);
  const overall = score(.4 * accuracy + .3 * fluency + .3 * alignment.completeness);
  const elapsed = (words.at(-1)!.Offset + words.at(-1)!.Duration - words[0].Offset) / 1e7;
  const wpm = Math.round(tokens(transcript).length / Math.max(1, elapsed) * 60);
  const longPauses = words.slice(1).filter((w, i) => (w.Offset - words[i].Offset - words[i].Duration) / 1e7 > 2).length;
  const unclear = words.filter(w => w.PronunciationAssessment?.ErrorType === 'Mispronunciation').map(w => w.Word);
  return {
    transcript, scores: { overall, accuracy, fluency, completeness: alignment.completeness },
    missed_words: [...new Set([...alignment.omitted, ...alignment.substituted, ...unclear])].slice(0, 8),
    delivery: { wpm, filler_count: (transcript.match(/\b(um+|uh+|er+|ah+|hmm+|mmm+)\b/gi) ?? []).length, long_pauses: longPauses, pace: wpm < 120 ? 'slow' : wpm > 170 ? 'fast' : 'good', confidence_note: '' },
    strengths: [] as string[], improvements: [] as string[], coaching: '',
    assessment: { provider: 'azure', version: 'azure-continuous-v1', locale, assessed_at: new Date().toISOString(), kind: 'detailed', score_note: 'Pronunciation and fluency are duration-weighted Azure segment scores. Coverage uses transcript alignment; overall is an app composite (40% accuracy, 30% fluency, 30% coverage).', words: words.map(w => ({ word: w.Word, start: w.Offset / 1e7, duration: w.Duration / 1e7, accuracy: w.PronunciationAssessment?.AccuracyScore ?? null, error: w.PronunciationAssessment?.ErrorType ?? 'None', phonemes: (w.Phonemes ?? []).map(p => ({ phoneme: p.Phoneme, accuracy: p.PronunciationAssessment?.AccuracyScore ?? null })) })), alignment },
  };
}
export async function assessAzure(pcm: Buffer, reference: string, locale: string) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new ReadingError(503, 'Azure Speech is not configured on the server.');
  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechRecognitionLanguage = locale;
  config.outputFormat = sdk.OutputFormat.Detailed;
  const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
  const audio = sdk.AudioConfig.fromStreamInput(stream);
  const recognizer = new sdk.SpeechRecognizer(config, audio);
  const assessment = new sdk.PronunciationAssessmentConfig(reference, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, false);
  assessment.applyTo(recognizer);
  try {
    const segments = await new Promise<AzureSegment[]>((resolve, reject) => {
      const found: AzureSegment[] = [];
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        if (error) reject(error); else resolve(found);
      };
      const timer = setTimeout(() => finish(new ReadingError(504, 'Speech assessment timed out.')), 240000);
      recognizer.recognized = (_sender, event) => {
        if (finished || event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
        try {
          const raw = JSON.parse(event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult));
          if (raw.NBest?.[0]) found.push(raw.NBest[0]);
        } catch { finish(new ReadingError(502, 'Speech assessment returned an invalid result.')); }
      };
      recognizer.canceled = (_sender, event) => {
        if (event.reason === sdk.CancellationReason.Error) finish(new ReadingError(502, 'Azure Speech could not assess this recording. Check the resource key, region, and access.'));
      };
      recognizer.sessionStopped = () => finish();
      recognizer.startContinuousRecognitionAsync(() => {
        stream.write(Uint8Array.from(pcm).buffer); stream.close();
      }, () => finish(new ReadingError(502, 'Could not start Azure Speech assessment.')));
    });
    return summarizeAzure(segments, reference, locale);
  } finally { recognizer.close(); audio.close(); stream.close(); }
}
