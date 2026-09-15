import React, { useState } from 'react';
import type { ReadingAnalysis } from '../hooks/useAnswerRecorder';

export default function ReadingNextStep({ feedback, onListen, onRepeat }: {
  feedback: Partial<ReadingAnalysis>;
  onListen?: (word: string) => void;
  onRepeat?: () => void;
}) {
  const [rehearsed, setRehearsed] = useState<string[]>([]);
  const words = [...new Set((feedback.missed_words ?? []).map(w => w.trim()).filter(Boolean))].slice(0, 3);
  const focus = (feedback.improvements ?? []).filter(Boolean).slice(0, 2);
  return <section aria-label="Next reading exercise" className="rounded-xl bg-[var(--stint-primary)]/5 p-4 space-y-3">
    <h3 className="text-sm font-semibold">Your next reading exercise</h3>
    <ol className="list-decimal pl-4 text-sm space-y-2">{(focus.length ? focus : ['Read one sentence in natural phrases, then repeat it at a comfortable pace.']).map((point, i) => <li key={i}>{point}</li>)}</ol>
    {words.length > 0 ? <div><p className="text-xs text-[var(--stint-text-muted)]">Say each word slowly, then in its sentence. Tick it when rehearsed; this is a practice checklist, not an assessment.</p><div className="mt-3 space-y-2">{words.map(word => <div key={word} className="flex flex-wrap items-center gap-2 text-sm"><label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={rehearsed.includes(word)} onChange={e => setRehearsed(prev => e.target.checked ? [...prev, word] : prev.filter(w => w !== word))} /><span className="break-all">{word}</span></label>{onListen && <button className="text-xs font-semibold text-[var(--stint-primary)]" onClick={() => onListen(word)} aria-label={`Listen to ${word}`}>Listen</button>}</div>)}</div><p className="mt-2 text-xs" aria-live="polite">{rehearsed.length} of {words.length} words rehearsed</p></div> : <p className="text-xs text-[var(--stint-text-muted)]">No specific words were flagged. Rehearse one sentence using the feedback above.</p>}
    <p className="text-xs text-[var(--stint-text-muted)]">Read the same passage again and focus on one change. A higher score alone does not prove improvement across different assessment methods.</p>
    {onRepeat && <button onClick={onRepeat} className="rounded-lg bg-[var(--stint-primary)] px-3 py-2 text-sm font-semibold text-white">Read this passage again</button>}
  </section>;
}
