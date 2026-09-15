import ReadingDeliveryCoach from './ReadingDeliveryCoach';
import React from 'react';
import ReadingAssessmentDetails from './ReadingAssessmentDetails';
import type { ReadingAnalysis } from '../hooks/useAnswerRecorder';
export type Attempt = {
  id: number; content_id?: number | null; question_ref: string; role: string | null; created_at: string;
  overall_score: number | null; accuracy: number | null; fluency: number | null;
  completeness: number | null; wpm: number | null; filler_count: number | null;
  transcript: string | null; feedback: Partial<ReadingAnalysis> | null;
};
const panel = 'rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)]';

export default function ReadingReport({ report, onRepeat }: { report: Attempt; onRepeat?: () => void }) {
  const improvements = report.feedback?.improvements ?? [];
  return <article aria-label="Saved reading report" className={`${panel} space-y-5 p-5 md:p-6`}>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--stint-primary)]">Reading report</p><h1 className="mt-2 text-lg font-semibold">{report.question_ref}</h1><p className="mt-2 text-xs text-[var(--stint-text-muted)]">{new Date(report.created_at).toLocaleString()} · {report.role || 'Reading practice'} · Scores describe this recording, not interview readiness.</p></div>
          <ReadingDeliveryCoach key={report.id} feedback={report.feedback ?? {}} onRepeat={onRepeat} />
          <ReadingAssessmentDetails assessment={report.feedback?.assessment} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['Overall', report.overall_score], ['Accuracy', report.accuracy], ['Fluency', report.fluency], ['Coverage', report.completeness]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--stint-bg)] p-3"><p className="text-[11px] text-[var(--stint-text-muted)]">{label}</p><p className="mt-1 text-xl font-semibold">{value ?? '—'}</p></div>)}</div>
          {!!report.feedback?.strengths?.length && <div className="rounded-xl bg-emerald-500/10 p-4"><h4 className="text-sm font-semibold">What went well</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-sm">{report.feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {!!improvements.length && <div><h4 className="text-sm font-semibold">Focus for your next reading</h4><ol className="mt-2 list-decimal space-y-2 pl-4 text-sm text-[var(--stint-text-muted)]">{improvements.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}
          {report.feedback?.coaching && <p className="rounded-xl border border-[var(--stint-border)] p-4 text-sm leading-relaxed">{report.feedback.coaching}</p>}
          {!!report.feedback?.missed_words?.length && <div><h4 className="text-sm font-semibold">Words to revisit</h4><div className="mt-2 flex flex-wrap gap-2">{report.feedback.missed_words.map((word, i) => <span key={i} className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs">{word}</span>)}</div></div>}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--stint-text-muted)]"><span>Pace: {report.wpm ?? '—'} wpm</span><span>Fillers: {report.filler_count ?? '—'}</span><span>Long pauses: {report.feedback?.delivery?.long_pauses ?? '—'}</span></div>
          <div className="border-t border-[var(--stint-border)] pt-4"><h4 className="text-sm font-semibold">Your transcript</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--stint-text-muted)]">{report.transcript || 'No transcript saved for this attempt.'}</p></div>
        </article>;
}
