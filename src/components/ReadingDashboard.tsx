import ReadingRevisionQueue from './ReadingRevisionQueue';
import ReadingPracticePlan from './ReadingPracticePlan';
import type { InterviewEntry } from '../constants';
import React, { useEffect, useState } from 'react';
import { BookOpen, RefreshCw, AudioLines } from 'lucide-react';
import { apiGet } from '../lib/api';

import { Link } from 'react-router-dom';
import type { Attempt } from './ReadingReport';
const panel = 'rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)]';

export default function ReadingDashboard({ history = false, revision = false, passages }: { history?: boolean; revision?: boolean; passages?: InterviewEntry[] }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    apiGet<{ attempts: Attempt[] }>('/api/reading-attempts').then((data) => {
      if (!active) return;
      setAttempts(data.attempts); setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [refresh]);
  const latest = attempts[0];
  return <section aria-label="Reading practice dashboard" className="space-y-5">
    {!revision && <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{history ? 'Reading history' : 'Your reading overview'}</h2><p className="mt-1 text-xs text-[var(--stint-text-muted)]">Counts cover your latest 50 saved attempts.</p></div>{!history && <Link to="/reading/history" className="text-sm font-semibold text-[var(--stint-primary)] hover:underline">View reading history →</Link>}</div>}
    {status === 'loading' ? <p role="status" className={`${panel} p-6 text-sm`}>Loading your reading history…</p> : status === 'error' ? <div role="alert" className={`${panel} flex items-center justify-between gap-4 p-6 text-sm`}><p>We couldn’t load your reading history.</p><button onClick={() => setRefresh(value => value + 1)} className="flex items-center gap-2 text-[var(--stint-primary)]"><RefreshCw size={15} />Try again</button></div> : revision ? <ReadingRevisionQueue attempts={attempts} passages={passages ?? []} /> : <>
      {!history && passages && <ReadingPracticePlan attempts={attempts} passages={passages} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Saved readings', attempts.length === 50 ? '50 most recent' : String(attempts.length), 'Your recent practice history'],
          ['Passages practised', String(new Set(attempts.map(a => a.question_ref)).size), 'Across the readings shown'],
          ['Latest reading score', latest?.overall_score == null ? '—' : `${latest.overall_score}/100`, 'An estimate for one attempt'],
          ['Latest reading pace', latest?.wpm == null ? '—' : `${latest.wpm} wpm`, 'Speed is only part of fluency'],
        ].map(([label, value, description]) => <div key={label} className={`${panel} p-4 md:p-5`}><p className="text-xs text-[var(--stint-text-muted)]">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-[11px] text-[var(--stint-text-muted)]">{description}</p></div>)}
      </div>
      {!attempts.length ? <div className={`${panel} p-8 text-center`}><BookOpen className="mx-auto text-[var(--stint-primary)]" size={28} /><h3 className="mt-4 text-lg font-semibold">Your first reading starts the story</h3><p className="mx-auto mt-2 max-w-md text-sm text-[var(--stint-text-muted)]">Complete a recording to see your transcript, reading scores, strengths, and suggestions here.</p></div> : <div className={`${panel} overflow-hidden`}>
        <h3 className="border-b border-[var(--stint-border)] p-4 font-semibold">{history ? 'Saved readings' : 'Recent readings'}</h3>
        {(history ? attempts : attempts.slice(0, 3)).map(a => <Link key={a.id} to={`/reading/reports/${a.id}`} className="flex items-center gap-3 border-b border-[var(--stint-border)] p-4 transition-colors hover:bg-[var(--stint-bg)]">
          <AudioLines size={18} className="shrink-0 text-[var(--stint-primary)]" />
          <div className="min-w-0 flex-1"><p className="line-clamp-2 break-words text-sm font-medium">{a.question_ref}</p><p className="mt-1 text-xs text-[var(--stint-text-muted)]">{new Date(a.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p></div>
          <div className="shrink-0 text-right"><p className="text-sm font-semibold">{a.overall_score ?? '—'}<span className="text-xs font-normal text-[var(--stint-text-muted)]"> / 100</span></p><span className="text-xs text-[var(--stint-primary)]">View report →</span></div>
        </Link>)}
      </div>}
    </>}
  </section>;
}
