import PracticeAssignments from '../components/PracticeAssignments';
import type { InterviewEntry } from '../constants';
import { passageState } from '../components/ReadingPracticePlan';
import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/GlobalNav';
import { useNavigate } from 'react-router-dom';
import { useBottomNav } from './shared';
import ReadingDashboard from '../components/ReadingDashboard';
import ReadingReport, { type Attempt } from '../components/ReadingReport';
import { apiGet, ApiError } from '../lib/api';

export default function ReadingPages({ passages = [] }: { passages?: InterviewEntry[] }) {
  const assignments = useLocation().pathname === "/reading/assignments";
  const revision = useLocation().pathname === "/reading/revision";
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<{ id: string; attempt: Attempt } | null>(null);
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const bottomNav = useBottomNav('home');
  useEffect(() => {
    if (!attemptId) return;
    let active = true;
    setStatus('loading');
    setResult(null);
    apiGet<{ attempt: Attempt }>(`/api/reading-attempts/${encodeURIComponent(attemptId)}`).then(data => {
      if (active) { setResult({ id: attemptId, attempt: data.attempt }); setStatus('ready'); }
    }).catch(error => {
      if (active) setStatus(error instanceof ApiError && [400, 404].includes(error.status) ? 'missing' : 'error');
    });
    return () => { active = false; };
  }, [attemptId, retry]);
  const passage = passages.find(p => p.id && p.id === result?.attempt.content_id);
  const back = attemptId ? '/reading/history' : '/';
  return <AppLayout topBar={{ sectionLabel: attemptId ? 'Reading report' : assignments ? 'Assigned practice' : revision ? 'Revision queue' : 'Reading history', showBack: true, onBack: () => navigate(back), onHome: () => navigate('/') }} bottomNav={bottomNav}>
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8">
      <Link to={back} className="inline-block text-sm font-semibold text-[var(--stint-primary)]">← {attemptId ? 'Back to reading history' : 'Back to dashboard'}</Link>
      {assignments ? <PracticeAssignments passages={passages} /> : !attemptId ? <ReadingDashboard history={!revision} revision={revision} passages={passages} /> : status === 'missing' ? <div role="alert"><h1 className="text-xl font-semibold">Reading report not found</h1><p className="mt-2 text-sm">This report is unavailable for your account.</p></div> : status === 'error' ? <div role="alert"><p>We couldn’t load this report.</p><button className="mt-3 text-[var(--stint-primary)]" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : status === 'ready' && result?.id === attemptId ? <><ReadingReport report={result.attempt} onRepeat={passage ? () => navigate("/interview/session", { state: passageState(passage) }) : undefined} />{!passage && <p className="text-sm text-[var(--stint-text-muted)]">This report cannot be linked to a currently available passage. <Link to="/interview" className="font-semibold text-[var(--stint-primary)]">Choose a passage to practise →</Link></p>}</> : <p role="status">Loading your reading report…</p>}
    </div>
  </AppLayout>;
}
