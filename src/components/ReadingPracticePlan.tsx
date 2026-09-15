import { buildRevisionQueue } from '../lib/readingRevision';
import React from 'react';
import { Link } from 'react-router-dom';
import type { InterviewEntry } from '../constants';
import type { Attempt } from './ReadingReport';

export const readingDay = (date: string | Date) => new Date(new Date(date).getTime() + 19800000).toISOString().slice(0, 10);
export function buildReadingPlan(attempts: Attempt[], passages: InterviewEntry[], now = new Date()) {
  const allowed = passages.filter(p => p.id);
  const today = attempts.filter(a => readingDay(a.created_at) === readingDay(now));
  const ordered = [...attempts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const last = ordered.find(a => allowed.some(p => p.id === a.content_id));
  const suggestion = buildRevisionQueue(attempts, allowed)[0];
  const passage = suggestion?.passage;
  return { today: today.length, passage, last, suggestion };
}
export function passageState(passage: InterviewEntry) {
  return { sessionQuestions: [passage], selectedRole: passage.role, candidateName: 'Candidate' };
}
export default function ReadingPracticePlan({ attempts, passages }: { attempts: Attempt[]; passages: InterviewEntry[] }) {
  const { today, passage, suggestion } = buildReadingPlan(attempts, passages);
  return <section aria-label="Daily reading plan" className="rounded-2xl border border-[var(--stint-primary)]/30 bg-[var(--stint-primary)]/5 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--stint-primary)]">Your daily reading plan</p><h3 className="mt-1 text-lg font-semibold">One passage. Two purposeful readings.</h3></div><span className="text-sm font-semibold">{Math.min(today, 2)} / 2 readings saved today</span></div>
    <p className="text-xs text-[var(--stint-text-muted)]">Reading goal · India time · Based on your latest 50 saved readings. Separate from your cards & quiz goal.</p>
    {today >= 2 && <p className="text-sm text-emerald-600">Daily reading goal complete. You can keep practising at your own pace.</p>}
    <ol className="grid gap-3 sm:grid-cols-3 text-sm"><li><strong>1. Read aloud</strong><p className="mt-1 text-[var(--stint-text-muted)]">Record one comfortable reading.</p></li><li><strong>2. Rehearse</strong><p className="mt-1 text-[var(--stint-text-muted)]">Review two feedback points and up to three words.</p></li><li><strong>3. Read again</strong><p className="mt-1 text-[var(--stint-text-muted)]">Apply one change in a second recording.</p></li></ol>
    {passage ? <div className="flex flex-col items-stretch gap-3 border-t border-[var(--stint-border)] pt-4"><div className="min-w-0 flex-1"><p className="text-xs text-[var(--stint-text-muted)]">{suggestion?.reason ?? 'Start with this passage'}</p><p className="mt-1 text-sm font-medium break-words">{passage.question}</p></div><div className="flex flex-wrap gap-2">{suggestion?.words.slice(0,3).map(word=><span key={word} className="max-w-full break-all rounded-lg bg-amber-500/10 px-2 py-1 text-sm">{word}</span>)}</div><Link className="self-start rounded-xl bg-[var(--stint-primary)] px-4 py-2.5 text-sm font-semibold text-white" to="/interview/session" state={{...passageState(passage), revisionFocus: { words: suggestion?.words.slice(0,3) ?? [], improvements: suggestion?.focus ?? [] }}}>Start reading practice</Link><Link className="text-sm text-[var(--stint-primary)]" to="/reading/revision">View my revision queue →</Link><Link className="text-sm text-[var(--stint-primary)]" to="/interview">Choose another passage</Link></div> : <p className="text-sm">No reading passages are available for your current access yet.</p>}
  </section>;
}
