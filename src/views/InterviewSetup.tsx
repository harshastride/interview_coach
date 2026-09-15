import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import { useAuth, type AuthUser } from '../hooks/useAuth';
import type { InterviewEntry } from '../constants';
import { HeaderRightSlot, useBottomNav } from './shared';

export function readingDifficulty(p: InterviewEntry) {
  const words = p.ideal_answer.trim().split(/\s+/).length;
  const sentences = Math.max(1, p.ideal_answer.split(/[.!?]+/).filter(s => s.trim()).length);
  return words > 250 || words / sentences > 30 ? 'Stretch' : words < 120 && words / sentences < 22 ? 'Gentle' : 'Standard';
}
const field = 'mt-2 block w-full min-w-0 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] px-3 py-2.5 text-sm';
export default function InterviewSetup({ uploadedInterviewRaw, currentUser, onContentRefresh }: {
  uploadedInterviewRaw: InterviewEntry[]; currentUser: AuthUser | null; onContentRefresh: () => void;
}) {
  const navigate = useNavigate(), { handleLogout } = useAuth();
  const [admin, setAdmin] = useState(false), [search, setSearch] = useState(''), [topic, setTopic] = useState(''), [difficulty, setDifficulty] = useState(''), [mode, setMode] = useState('quick'), [selected, setSelected] = useState(''), [page, setPage] = useState(1);
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const topics = [...new Set(uploadedInterviewRaw.map(p => p.category || 'General'))].sort();
  const matches = uploadedInterviewRaw.filter(p => (!topic || (p.category || 'General') === topic) && (!difficulty || readingDifficulty(p) === difficulty) && `${p.question} ${p.category} ${p.role}`.toLowerCase().includes(search.trim().toLowerCase()));
  const chosen = matches.find(p => String(p.id) === selected) ?? matches[0];
  const questions = mode === 'quick' ? (chosen ? [chosen] : []) : matches.slice(0, 10);
  const minutes = questions.reduce((n, p) => n + Math.ceil(p.ideal_answer.split(/\s+/).length / 120) * 2 + 2, 0);
  const pages = Math.max(1, Math.ceil(matches.length / 8)), shownPage = Math.min(page, pages);
  const reset = () => { setPage(1); setSelected(''); };
  return <>
    {admin && <AdminPanel currentUser={currentUser} onClose={() => setAdmin(false)} onContentRefresh={onContentRefresh} />}
    <AppLayout topBar={{sectionLabel:'Reading practice', showBack:true, onBack:()=>navigate('/'), onHome:()=>navigate('/'), rightSlot:<HeaderRightSlot currentUser={currentUser} canUpload={canUpload} onLogout={handleLogout} onOpenAdmin={()=>setAdmin(true)} />}} bottomNav={useBottomNav('interview')}>
      <div className="mx-auto w-full max-w-5xl p-4 md:p-7 space-y-5">
        <header><p className="text-xs font-semibold text-[var(--stint-primary)]">Read · Rehearse · Repeat</p><h1 className="mt-2 text-2xl font-semibold">Choose your next practice</h1><p className="mt-2 text-sm text-[var(--stint-text-muted)]">Start with one passage or work through a longer session. Camera use is optional.</p></header>
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Practice mode</legend>{[['quick','Quick practice','One passage, with time to repeat'],['full','Full session','Up to 10 matching passages']].map(([value,label,detail])=><label key={value} className="rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] p-4"><input type="radio" name="mode" value={value} checked={mode===value} onChange={()=>setMode(value)} /><span className="ml-2 font-semibold">{label}</span><p className="mt-2 text-xs text-[var(--stint-text-muted)]">{detail}</p></label>)}</fieldset>
        <div className="grid gap-3 lg:grid-cols-3"><label className="text-sm">Search passages<input type="search" className={field} value={search} onChange={e=>{setSearch(e.target.value);reset();}} placeholder="Question, topic or role" /></label><label className="text-sm">Topic<select className={field} value={topic} onChange={e=>{setTopic(e.target.value);reset();}}><option value="">All topics</option>{topics.map(t=><option key={t}>{t}</option>)}</select></label><label className="text-sm">Estimated reading difficulty<select className={field} value={difficulty} onChange={e=>{setDifficulty(e.target.value);reset();}}><option value="">All levels</option>{['Gentle','Standard','Stretch'].map(d=><option key={d}>{d}</option>)}</select></label></div>
        <p className="text-xs text-[var(--stint-text-muted)]">Difficulty is estimated from answer length and sentence length, not technical expertise. Passages are listed in content order.</p>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><p role="status">{matches.length} matching passages</p>{(search||topic||difficulty)&&<button className="text-[var(--stint-primary)]" onClick={()=>{setSearch('');setTopic('');setDifficulty('');reset();}}>Clear filters</button>}</div>
        <div className="space-y-2">{matches.slice((shownPage-1)*8,shownPage*8).map((p,i)=><label key={p.id ?? i} className="flex items-start gap-3 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] p-4">{mode==='quick'&&<input className="mt-1" type="radio" name="passage" checked={p===chosen} onChange={()=>setSelected(String(p.id))} />}<span className="min-w-0"><span className="block text-sm font-medium break-words">{p.question}</span><span className="mt-2 block text-xs text-[var(--stint-text-muted)]">{p.category || 'General'} · {readingDifficulty(p)} · {p.ideal_answer.split(/\s+/).length} words</span></span></label>)}{!matches.length&&<p className="p-5 text-sm">{uploadedInterviewRaw.length?'No passages match. Try another topic or clear your filters.':'No passages are available for your access yet.'}</p>}</div>
        {pages>1&&<nav aria-label="Passage pages" className="flex items-center justify-between gap-3 text-sm"><button disabled={shownPage===1} onClick={()=>setPage(shownPage-1)}>Previous</button><span>Page {shownPage} of {pages}</span><button disabled={shownPage===pages} onClick={()=>setPage(shownPage+1)}>Next</button></nav>}
        <div className="rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] p-4 space-y-3"><p className="text-sm">{questions.length} passage{questions.length===1?'':'s'} · About {minutes} minutes including repetition and review</p>{mode==='full'&&<p className="text-xs text-[var(--stint-text-muted)]">The first 10 matching passages will be included.</p>}<button disabled={!questions.length} className="w-full rounded-xl bg-[var(--stint-primary)] p-3 font-semibold text-white disabled:opacity-50" onClick={()=>navigate('/interview/session',{state:{sessionQuestions:questions,selectedRole:questions[0]?.role,candidateName:currentUser?.name || 'Candidate'}})}>Continue to microphone check</button></div>
      </div>
    </AppLayout>
  </>;
}
