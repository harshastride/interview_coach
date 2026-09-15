import React from 'react';
import type { ReadingAnalysis } from '../hooks/useAnswerRecorder';
export default function ReadingAssessmentDetails({ assessment }: { assessment?: ReadingAnalysis['assessment'] }) {
  if (!assessment) return null;
  return <section aria-label="Assessment details" className="space-y-3 rounded-xl border border-[var(--stint-border)] p-4">
    <div><h4 className="text-sm font-semibold">{assessment.kind === 'detailed' ? 'Detailed pronunciation assessment' : 'Practice feedback'}</h4><p className="mt-1 text-xs text-[var(--stint-text-muted)]">{assessment.locale} · {new Date(assessment.assessed_at).toLocaleString()}</p></div>
    {assessment.notice && <p role="status" className="text-xs text-amber-600 dark:text-amber-400">{assessment.notice}</p>}
    <p className="text-xs leading-relaxed text-[var(--stint-text-muted)]">{assessment.score_note}</p>
    {!!assessment.words?.length && <div className="max-h-64 space-y-2 overflow-y-auto"><h5 className="text-xs font-semibold">Word and sound accuracy</h5>{assessment.words.map((word, i) => <div key={i} className="rounded-lg bg-[var(--stint-bg)] p-2 text-xs"><div className="flex justify-between gap-2"><span>{word.word} · {word.start.toFixed(1)}s</span><strong>{word.accuracy ?? '—'}/100</strong></div><div className="mt-1 flex flex-wrap gap-2 text-[var(--stint-text-muted)]">{word.phonemes.map((p, j) => <span key={j}>{p.phoneme}: {p.accuracy ?? '—'}</span>)}</div></div>)}</div>}
  </section>;
}
