import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BrainCircuit,
  BookOpen,
  Trophy,
  Lightbulb,
  Shuffle,
  Volume2,
  Mic,
  MicOff,
  Loader2,
  MessageSquare,
  Home,
  Settings,
  LogOut,
  Download,
  Trash2,
  Upload,
} from 'lucide-react';
import { ALL_CATEGORIES, LEVEL_LABELS, type Flashcard, type InterviewEntry } from './constants';
import { cn } from './lib/utils';
import { AppLayout, type GlobalTopBarProps, type GlobalBottomNavProps, type SectionId } from './components/GlobalNav';
import { GoogleGenAI, Modality } from "@google/genai";
import Markdown from 'react-markdown';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Mode = 'flashcard' | 'quiz';
export type HomeChoice = null | 'flashcards' | 'interview' | 'quiz';

type AuthStatus = 'loading' | 'unauthenticated' | 'access_denied' | 'authenticated';
interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  isAllowed: boolean;
}

function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[()/]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'term';
}
function uniqueId(term: string, seen: Set<string>): string {
  let id = slug(term);
  let c = 0;
  while (seen.has(id)) id = `${slug(term)}-${++c}`;
  seen.add(id);
  return id;
}

async function downloadInterviewPDF(session: {
  candidateName: string;
  role: string;
  company: string;
  questions: { question: string; ideal_answer: string }[];
}) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210; // A4 width in mm
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text('Stint Academy', margin, y); y += 8;
  doc.setFontSize(12).setFont('helvetica', 'normal');
  doc.text('Interview Practice Session', margin, y); y += 6;
  doc.line(margin, y, pageWidth - margin, y); y += 6;

  doc.setFontSize(10);
  doc.text(`Candidate: ${session.candidateName}`, margin, y); y += 5;
  doc.text(`Role: ${session.role}`, margin, y); y += 5;
  doc.text(`Company: ${session.company}`, margin, y); y += 5;
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y);
  y += 10;

  session.questions.forEach((qa, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const questionLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question}`, contentWidth);
    doc.text(questionLines, margin, y);
    y += questionLines.length * 6 + 3;
    doc.setFontSize(10).setFont('helvetica', 'normal');
    const answerLines = doc.splitTextToSize(qa.ideal_answer, contentWidth);
    doc.text(answerLines, margin, y);
    y += answerLines.length * 5 + 8;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  });

  doc.save(`interview-${session.role.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}

function AccessDeniedScreen({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    fetch('/api/access-request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), reason: reason.trim() || undefined }),
    })
      .then((r) => { if (r.ok) setSent(true); })
      .finally(() => setLoading(false));
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)] p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[var(--stint-border)] shadow-lg p-8 flex flex-col">
        <p className="text-sm uppercase tracking-widest font-semibold text-[var(--stint-primary)] mb-1">Access denied</p>
        <p className="text-[var(--stint-text)] font-medium mb-1">{user?.email}</p>
        <p className="text-sm text-[#6B7280] mb-6">Your account is not on the access list. Contact an administrator.</p>
        {!sent ? (
          <form onSubmit={handleRequest} className="space-y-3 mb-6">
            <label htmlFor="access-name" className="block text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider">Your name</label>
            <input
              id="access-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-[var(--stint-border)] focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent"
              placeholder="Name"
            />
            <label htmlFor="access-reason" className="block text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider">Reason for access</label>
            <textarea
              id="access-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 rounded-xl border border-[var(--stint-border)] focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent"
              placeholder="Optional"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send Request'}
            </button>
          </form>
        ) : (
          <p className="text-emerald-600 font-medium mb-6">Request sent! An admin will review it.</p>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

type AdminTab = 'users' | 'allowlist' | 'requests' | 'audit' | 'progress' | 'upload' | 'delete';

function AdminPanel({
  onClose,
  currentUser,
  onContentRefresh,
}: {
  onClose: () => void;
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>('users');
  const isAdmin = currentUser?.role === 'admin';
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [users, setUsers] = useState<{ id: number; email: string; name: string; role: string; is_allowed: number }[]>([]);
  const [allowlist, setAllowlist] = useState<{ email: string }[]>([]);
  const [requests, setRequests] = useState<{ id: number; email: string; name: string; reason: string | null }[]>([]);
  const [auditLog, setAuditLog] = useState<{ action: string; target: string | null; actor_email: string; created_at: string }[]>([]);
  const [progressRows, setProgressRows] = useState<{
    id: number;
    name: string;
    email: string;
    role: string;
    is_allowed: number;
    module: string | null;
    total_terms: number | null;
    completed_terms: number | null;
    quiz_correct: number | null;
    quiz_incorrect: number | null;
    interview_total: number | null;
    interview_answered: number | null;
    updated_at: string | null;
    flashcard_completion_pct: string | number | null;
    interview_completion_pct: string | number | null;
  }[]>([]);
  const [termsList, setTermsList] = useState<{ id: number; t: string; d: string; l: number; c: string }[]>([]);
  const [interviewList, setInterviewList] = useState<{ id: number; question: string; ideal_answer: string; role: string; company: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [termForm, setTermForm] = useState({ t: '', d: '', l: 4, c: ALL_CATEGORIES[0] });
  const [interviewForm, setInterviewForm] = useState({ question: '', ideal_answer: '', role: '', company: '' });
  const [bulkInterview, setBulkInterview] = useState({ role: '', company: '', entries: [] as { question: string; ideal_answer: string }[], preview: [] as string[][] });
  const [bulkTerms, setBulkTerms] = useState({ entries: [] as { t: string; d: string; l: number; c: string }[], preview: [] as string[][] });
  const [bulkImporting, setBulkImporting] = useState(false);

  const fetchUsers = () => fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()).then(setUsers);
  const fetchAllowlist = () => fetch('/api/admin/allowlist', { credentials: 'include' }).then((r) => r.json()).then(setAllowlist);
  const fetchRequests = () => fetch('/api/admin/requests', { credentials: 'include' }).then((r) => r.json()).then(setRequests);
  const fetchAudit = () => fetch('/api/admin/audit', { credentials: 'include' }).then((r) => r.json()).then(setAuditLog);
  const fetchProgress = () => fetch('/api/admin/progress', { credentials: 'include' }).then((r) => r.json()).then(setProgressRows);
  const fetchTerms = () => fetch('/api/admin/terms', { credentials: 'include' }).then((r) => r.json()).then(setTermsList);
  const fetchInterview = () => fetch('/api/admin/interview', { credentials: 'include' }).then((r) => r.json()).then(setInterviewList);

  useEffect(() => {
    if (!canUpload && !isAdmin) return;
    if (tab === 'users' && isAdmin) fetchUsers();
    if (tab === 'allowlist' && isAdmin) fetchAllowlist();
    if (tab === 'requests' && isAdmin) fetchRequests();
    if (tab === 'audit' && isAdmin) fetchAudit();
    if (tab === 'progress' && canUpload) fetchProgress();
    if (tab === 'upload' || tab === 'delete') {
      fetchTerms();
      fetchInterview();
    }
  }, [tab, isAdmin, canUpload]);

  const parseCSV = (text: string): string[][] =>
    text.trim().split('\n').map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else current += char;
      }
      result.push(current.trim());
      return result;
    });

  const tabClass = (t: AdminTab) =>
    cn(
      'px-4 py-3 text-sm font-medium border-b-2 transition-all focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--stint-primary)]',
      tab === t ? 'border-[var(--stint-primary)] text-[var(--stint-primary)]' : 'border-transparent text-[var(--stint-text-muted)] hover:text-[var(--stint-text)]'
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-[var(--stint-border)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--stint-border)]">
          <h2 className="text-lg font-bold text-[var(--stint-primary)]">Admin Panel</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--stint-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)]" aria-label="Close admin panel">✕</button>
        </div>
        <div className="flex border-b border-[var(--stint-border)] overflow-x-auto">
          {isAdmin && (
            <>
              <button className={tabClass('users')} onClick={() => setTab('users')}>Users</button>
              <button className={tabClass('allowlist')} onClick={() => setTab('allowlist')}>Allowlist</button>
              <button className={tabClass('requests')} onClick={() => setTab('requests')}>Requests</button>
              <button className={tabClass('audit')} onClick={() => setTab('audit')}>Audit Log</button>
            </>
          )}
          {canUpload && <button className={tabClass('progress')} onClick={() => setTab('progress')}>Progress</button>}
          {canUpload && <button className={tabClass('upload')} onClick={() => setTab('upload')}>Upload Content</button>}
          {canUpload && <button className={tabClass('delete')} onClick={() => setTab('delete')}>Delete Content</button>}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {tab === 'users' && isAdmin && (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="p-4 rounded-xl border border-[var(--stint-border)] bg-white flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--stint-text)] truncate">{u.name}</p>
                    <p className="text-xs text-[var(--stint-text-muted)] truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <select
                      value={u.role}
                      onChange={(e) => {
                        fetch('/api/admin/users/' + u.id, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: e.target.value }) }).then(fetchUsers);
                      }}
                      className="text-sm border border-[var(--stint-border)] rounded-lg px-2 py-1.5 bg-white"
                    >
                      <option value="admin">admin</option>
                      <option value="manager">manager</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" className="rounded" checked={!!u.is_allowed} onChange={(e) => fetch('/api/admin/users/' + u.id, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_allowed: e.target.checked ? 1 : 0 }) }).then(() => fetchUsers())} />
                      <span>Active</span>
                    </label>
                    {u.id !== currentUser?.id && (
                      <button
                        type="button"
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                        title="Remove user"
                        onClick={() => window.confirm(`Remove ${u.name} from access?`) && fetch('/api/admin/users/' + u.id, { method: 'DELETE', credentials: 'include' }).then(fetchUsers)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="py-12 text-center text-[var(--stint-text-muted)]">
                  <p className="text-sm">No users found.</p>
                </div>
              )}
            </div>
          )}
          {tab === 'allowlist' && isAdmin && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <label htmlFor="admin-allowlist-email" className="sr-only">Email</label>
                <input id="admin-allowlist-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" className="flex-1 border border-[var(--stint-border)] rounded-xl px-3 py-2" />
                <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white" onClick={() => fetch('/api/admin/allowlist', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail }) }).then(() => { setNewEmail(''); fetchAllowlist(); })}>Add</button>
              </div>
              {allowlist.map((a) => (
                <div key={a.email} className="flex justify-between items-center p-3 rounded-xl border border-[var(--stint-border)]">
                  <span>{a.email}</span>
                  <button
                    type="button"
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Remove from allowlist"
                    onClick={() => window.confirm(`Remove ${a.email} from allowlist?`) && fetch('/api/admin/allowlist/' + encodeURIComponent(a.email), { method: 'DELETE', credentials: 'include' }).then(fetchAllowlist)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {allowlist.length === 0 && <p className="text-sm text-[var(--stint-text-muted)] py-6">No emails on allowlist.</p>}
            </div>
          )}
          {tab === 'requests' && isAdmin && (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="border border-[var(--stint-border)] rounded-xl p-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-[var(--stint-text-muted)]">{r.email}</p>
                  {r.reason && <p className="text-sm mt-1">{r.reason}</p>}
                  <div className="flex gap-2 mt-2">
                    <button className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-sm" onClick={() => fetch('/api/admin/requests/' + r.id + '/approve', { method: 'POST', credentials: 'include' }).then(fetchRequests)}>Approve</button>
                    <button className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-sm" onClick={() => fetch('/api/admin/requests/' + r.id + '/reject', { method: 'POST', credentials: 'include' }).then(fetchRequests)}>Reject</button>
                  </div>
                </div>
              ))}
              {requests.length === 0 && <p className="text-sm text-[var(--stint-text-muted)] py-6">No pending requests.</p>}
            </div>
          )}
          {tab === 'audit' && isAdmin && (
            <div className="space-y-1 text-sm">
              {auditLog.map((a, i) => (
                <div key={i} className="flex gap-2 border-b border-[var(--stint-border)] py-2 items-baseline">
                  <span className="text-[var(--stint-text-muted)] text-xs tabular-nums shrink-0">
                    {a.created_at ? new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                  <span className="font-medium shrink-0">{a.actor_email}</span>
                  <span>{a.action}</span>
                  {a.target && <span className="truncate text-[var(--stint-text-muted)]">{a.target}</span>}
                </div>
              ))}
              {auditLog.length === 0 && <p className="text-sm text-[var(--stint-text-muted)] py-6">No audit entries.</p>}
            </div>
          )}
          {tab === 'progress' && canUpload && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--stint-primary)]">Learner Progress Dashboard</h3>
                <button
                  type="button"
                  onClick={fetchProgress}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--stint-primary)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/10"
                >
                  Refresh
                </button>
              </div>
              <div className="rounded-xl border border-[var(--stint-border)] overflow-hidden">
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--stint-bg)] sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Current Module</th>
                        <th className="px-3 py-2">Flashcards</th>
                        <th className="px-3 py-2">Quiz</th>
                        <th className="px-3 py-2">Interview</th>
                        <th className="px-3 py-2">Last Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressRows.map((p) => (
                        <tr key={p.id} className="border-t border-[var(--stint-border)]">
                          <td className="px-3 py-2">
                            <p className="font-medium text-[var(--stint-primary)]">{p.name}</p>
                            <p className="text-xs text-[var(--stint-text-muted)]">{p.email}</p>
                          </td>
                          <td className="px-3 py-2 capitalize">{p.module || 'home'}</td>
                          <td className="px-3 py-2">
                            {(p.completed_terms ?? 0)}/{(p.total_terms ?? 0)} ({Number(p.flashcard_completion_pct ?? 0)}%)
                          </td>
                          <td className="px-3 py-2">
                            Correct: {p.quiz_correct ?? 0} • Incorrect: {p.quiz_incorrect ?? 0}
                          </td>
                          <td className="px-3 py-2">
                            {(p.interview_answered ?? 0)}/{(p.interview_total ?? 0)} ({Number(p.interview_completion_pct ?? 0)}%)
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--stint-text-muted)]">
                            {p.updated_at ? new Date(p.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                        </tr>
                      ))}
                      {progressRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-[var(--stint-text-muted)]">No progress data yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {tab === 'upload' && canUpload && (
            <div className="space-y-8">
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-3">Flashcard term (single)</h3>
                <div className="grid gap-3 max-w-md">
                  <div>
                    <label htmlFor="admin-term-t" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Term *</label>
                    <input id="admin-term-t" placeholder="e.g. Delta Lake" value={termForm.t} onChange={(e) => setTermForm((f) => ({ ...f, t: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="admin-term-d" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Definition *</label>
                    <textarea id="admin-term-d" placeholder="Definition text" value={termForm.d} onChange={(e) => setTermForm((f) => ({ ...f, d: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="admin-term-l" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Level</label>
                      <select id="admin-term-l" value={termForm.l} onChange={(e) => setTermForm((f) => ({ ...f, l: Number(e.target.value) }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm">
                        {[2, 3, 4, 5].map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="admin-term-c" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Category</label>
                      <select id="admin-term-c" value={termForm.c} onChange={(e) => setTermForm((f) => ({ ...f, c: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm">
                        {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white w-fit" onClick={() => fetch('/api/admin/terms', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(termForm) }).then(() => { setTermForm({ t: '', d: '', l: 4, c: ALL_CATEGORIES[0] }); fetchTerms(); onContentRefresh(); })}>Add term</button>
                </div>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-2">Bulk upload terms (CSV)</h3>
                <p className="text-xs text-[var(--stint-text-muted)] mb-2">Format: term, definition, level (2–5), category. Optional header row.</p>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stint-border)] bg-white cursor-pointer hover:bg-[var(--stint-bg)] w-fit">
                  <Upload size={18} />
                  <span className="text-sm font-medium">Choose CSV file</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = String(reader.result ?? '');
                        const rows = parseCSV(text);
                        const isHeader = rows[0]?.length >= 1 && /^(term|t|definition|d|level|l|category|c)$/i.test(String(rows[0][0]).trim());
                        const data = (isHeader ? rows.slice(1) : rows)
                          .filter((r) => r.length >= 4 && r[0]?.trim() && r[1]?.trim())
                          .map((r) => ({
                            t: String(r[0]).trim(),
                            d: String(r[1]).trim(),
                            l: Math.max(2, Math.min(5, Number(r[2]) || 4)),
                            c: ALL_CATEGORIES.includes(String(r[3]).trim()) ? String(r[3]).trim() : ALL_CATEGORIES[0],
                          }));
                        setBulkTerms({ entries: data, preview: data.slice(0, 5).map((x) => [x.t, x.d, String(x.l), x.c]) });
                      };
                      reader.readAsText(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {bulkTerms.preview.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-[var(--stint-text-muted)] mb-1">Preview (first 5 of {bulkTerms.entries.length} rows)</p>
                    <div className="overflow-x-auto rounded-lg border border-[var(--stint-border)] text-xs">
                      <table className="w-full">
                        <thead><tr className="bg-[var(--stint-bg)]"><th className="text-left p-2">Term</th><th className="text-left p-2">Definition</th><th className="p-2">Level</th><th className="text-left p-2">Category</th></tr></thead>
                        <tbody>
                          {bulkTerms.preview.map((row, i) => (
                            <tr key={i} className="border-t border-[var(--stint-border)]"><td className="p-2 truncate max-w-[120px]">{row[0]}</td><td className="p-2 truncate max-w-[150px]">{row[1]}</td><td className="p-2">{row[2]}</td><td className="p-2 truncate max-w-[100px]">{row[3]}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      disabled={bulkImporting || bulkTerms.entries.length === 0}
                      className="mt-2 px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white text-sm font-medium disabled:opacity-50"
                      onClick={async () => {
                        setBulkImporting(true);
                        try {
                          const r = await fetch('/api/admin/terms/bulk', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: bulkTerms.entries }) });
                          if (r.ok) { setBulkTerms({ entries: [], preview: [] }); fetchTerms(); onContentRefresh(); } else { const j = await r.json().catch(() => ({})); alert(j.error || 'Import failed'); }
                        } finally { setBulkImporting(false); }
                      }}
                    >
                      {bulkImporting ? 'Importing…' : `Import ${bulkTerms.entries.length} terms`}
                    </button>
                  </div>
                )}
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-3">Interview Q&A (single)</h3>
                <div className="grid gap-3 max-w-md">
                  <div>
                    <label htmlFor="admin-int-role" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Role</label>
                    <input id="admin-int-role" placeholder="e.g. Data Engineer" value={interviewForm.role} onChange={(e) => setInterviewForm((f) => ({ ...f, role: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="admin-int-company" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Company</label>
                    <input id="admin-int-company" placeholder="e.g. Stint Academy" value={interviewForm.company} onChange={(e) => setInterviewForm((f) => ({ ...f, company: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="admin-int-question" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Question *</label>
                    <textarea id="admin-int-question" placeholder="Interview question" value={interviewForm.question} onChange={(e) => setInterviewForm((f) => ({ ...f, question: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" rows={2} />
                  </div>
                  <div>
                    <label htmlFor="admin-int-answer" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Ideal answer *</label>
                    <textarea id="admin-int-answer" placeholder="Ideal answer" value={interviewForm.ideal_answer} onChange={(e) => setInterviewForm((f) => ({ ...f, ideal_answer: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" rows={3} />
                  </div>
                  <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white w-fit" onClick={() => fetch('/api/admin/interview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(interviewForm) }).then(() => { setInterviewForm({ question: '', ideal_answer: '', role: '', company: '' }); fetchInterview(); onContentRefresh(); })}>Add Q&A</button>
                </div>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-2">Bulk upload interview Q&A (CSV)</h3>
                <p className="text-xs text-[var(--stint-text-muted)] mb-2">Format: question, ideal_answer (2 columns). Role and company below apply to all rows.</p>
                <div className="grid grid-cols-2 gap-2 max-w-md mb-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Role (for all rows)</label>
                    <input value={bulkInterview.role} onChange={(e) => setBulkInterview((b) => ({ ...b, role: e.target.value }))} placeholder="e.g. Data Engineer" className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Company (for all rows)</label>
                    <input value={bulkInterview.company} onChange={(e) => setBulkInterview((b) => ({ ...b, company: e.target.value }))} placeholder="e.g. Stint Academy" className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                </div>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stint-border)] bg-white cursor-pointer hover:bg-[var(--stint-bg)] w-fit">
                  <Upload size={18} />
                  <span className="text-sm font-medium">Choose CSV file</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = String(reader.result ?? '');
                        const rows = parseCSV(text);
                        const isHeader = rows[0]?.length >= 1 && /^(question|q|answer|ideal_answer|a)$/i.test(String(rows[0][0]).trim());
                        const data = (isHeader ? rows.slice(1) : rows)
                          .filter((r) => r.length >= 2 && r[0]?.trim() && r[1]?.trim())
                          .map((r) => ({ question: String(r[0]).trim(), ideal_answer: String(r[1]).trim() }));
                        setBulkInterview((b) => ({ ...b, entries: data, preview: data.slice(0, 5).map((x) => [x.question, x.ideal_answer]) }));
                      };
                      reader.readAsText(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {bulkInterview.preview.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-[var(--stint-text-muted)] mb-1">Preview (first 5 of {bulkInterview.entries.length} rows)</p>
                    <div className="overflow-x-auto rounded-lg border border-[var(--stint-border)] text-xs">
                      <table className="w-full">
                        <thead><tr className="bg-[var(--stint-bg)]"><th className="text-left p-2">Question</th><th className="text-left p-2">Ideal answer</th></tr></thead>
                        <tbody>
                          {bulkInterview.preview.map((row, i) => (
                            <tr key={i} className="border-t border-[var(--stint-border)]"><td className="p-2 truncate max-w-[200px]">{row[0]}</td><td className="p-2 truncate max-w-[200px]">{row[1]}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      disabled={bulkImporting || bulkInterview.entries.length === 0 || !bulkInterview.role.trim() || !bulkInterview.company.trim()}
                      className="mt-2 px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white text-sm font-medium disabled:opacity-50"
                      onClick={async () => {
                        setBulkImporting(true);
                        try {
                          const r = await fetch('/api/admin/interview/bulk', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: bulkInterview.entries, role: bulkInterview.role.trim(), company: bulkInterview.company.trim() }) });
                          if (r.ok) { setBulkInterview((b) => ({ ...b, entries: [], preview: [] })); fetchInterview(); onContentRefresh(); } else { const j = await r.json().catch(() => ({})); alert(j.error === 'Duplicates found' ? `Duplicates: ${(j.duplicates || []).join(', ')}` : j.error || 'Import failed'); }
                        } finally { setBulkImporting(false); }
                      }}
                    >
                      {bulkImporting ? 'Importing…' : `Import ${bulkInterview.entries.length} Q&As`}
                    </button>
                  </div>
                )}
              </section>
              <section>
                <div className="rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg)] p-3 text-xs text-[var(--stint-text-muted)]">
                  Use the <span className="font-semibold text-[var(--stint-primary)]">Delete Content</span> tab to manage and remove uploaded flashcards and interview Q&A in table format.
                </div>
              </section>
            </div>
          )}
          {tab === 'delete' && canUpload && (
            <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--stint-primary)]">Flashcards</h3>
                  <span className="text-xs text-[var(--stint-text-muted)]">{termsList.length} item{termsList.length === 1 ? '' : 's'}</span>
                </div>
                <div className="rounded-xl border border-[var(--stint-border)] overflow-hidden">
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--stint-bg)] sticky top-0">
                        <tr className="text-left">
                          <th className="px-3 py-2">Term</th>
                          <th className="px-3 py-2">Definition</th>
                          <th className="px-3 py-2">Level</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {termsList.map((t) => (
                          <tr key={t.id} className="border-t border-[var(--stint-border)]">
                            <td className="px-3 py-2 font-medium text-[var(--stint-primary)] max-w-[180px] truncate">{t.t}</td>
                            <td className="px-3 py-2 max-w-[320px] truncate">{t.d}</td>
                            <td className="px-3 py-2">{t.l}</td>
                            <td className="px-3 py-2 max-w-[220px] truncate">{t.c}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-full text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100"
                                onClick={() => window.confirm(`Delete flashcard "${t.t}"?`) && fetch('/api/admin/terms/' + t.id, { method: 'DELETE', credentials: 'include' }).then(() => { fetchTerms(); onContentRefresh(); })}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {termsList.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-[var(--stint-text-muted)]">No flashcards uploaded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--stint-primary)]">Interview Q&A</h3>
                  <span className="text-xs text-[var(--stint-text-muted)]">{interviewList.length} item{interviewList.length === 1 ? '' : 's'}</span>
                </div>
                <div className="rounded-xl border border-[var(--stint-border)] overflow-hidden">
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--stint-bg)] sticky top-0">
                        <tr className="text-left">
                          <th className="px-3 py-2">Question</th>
                          <th className="px-3 py-2">Ideal Answer</th>
                          <th className="px-3 py-2">Role</th>
                          <th className="px-3 py-2">Company</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interviewList.map((i) => (
                          <tr key={i.id} className="border-t border-[var(--stint-border)]">
                            <td className="px-3 py-2 max-w-[260px] truncate">{i.question}</td>
                            <td className="px-3 py-2 max-w-[260px] truncate">{i.ideal_answer}</td>
                            <td className="px-3 py-2 max-w-[140px] truncate">{i.role}</td>
                            <td className="px-3 py-2 max-w-[140px] truncate">{i.company}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-full text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100"
                                onClick={() => window.confirm('Delete this Q&A?') && fetch('/api/admin/interview/' + i.id, { method: 'DELETE', credentials: 'include' }).then(() => { fetchInterview(); onContentRefresh(); })}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {interviewList.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-[var(--stint-text-muted)]">No interview Q&A uploaded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [uploadedTermsRaw, setUploadedTermsRaw] = useState<{ t: string; d: string; l: number; c: string }[]>([]);
  const [uploadedInterviewRaw, setUploadedInterviewRaw] = useState<InterviewEntry[]>([]);

  const [terms, setTerms] = useState<Flashcard[]>([]);
  const [completedTermIds, setCompletedTermIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('flashcard');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string>('');
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

  // Home → pick section → topic selection → content
  const [homeChoice, setHomeChoice] = useState<HomeChoice>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  // Voice states
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCacheRef = useRef<Record<string, AudioBuffer>>({});

  // Interview: workflow phases, session questions (shuffled), typewriter, optional recording
  const [interviewPhase, setInterviewPhase] = useState<'select' | 'intro' | 'in_progress' | 'complete'>('select');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState('Candidate');
  const [sessionQuestions, setSessionQuestions] = useState<InterviewEntry[]>([]);
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [questionAudioDone, setQuestionAudioDone] = useState(false);
  const [typewriterDisplayed, setTypewriterDisplayed] = useState('');
  const [typewriterSpeed, setTypewriterSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [isPlayingFullSession, setIsPlayingFullSession] = useState(false);
  const interviewChatEndRef = useRef<HTMLDivElement | null>(null);
  const interviewSwipeStartX = useRef<number>(0);
  const interviewSwipeStartY = useRef<number>(0);
  const refreshUploadedContent = useCallback(() => {
    fetch('/api/content/terms', { credentials: 'include' })
      .then((r) => r.json())
      .then((list: { t: string; d: string; l: number; c: string }[]) => setUploadedTermsRaw(Array.isArray(list) ? list : []))
      .catch(() => setUploadedTermsRaw([]));
    fetch('/api/content/interview', { credentials: 'include' })
      .then((r) => r.json())
      .then((list: InterviewEntry[]) => setUploadedInterviewRaw(Array.isArray(list) ? list : []))
      .catch(() => setUploadedInterviewRaw([]));
  }, []);

  // Auth: check session on load
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; user?: AuthUser }) => {
        if (data.authenticated && data.user?.isAllowed) {
          setCurrentUser(data.user);
          setAuthStatus('authenticated');
        } else if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setAuthStatus('access_denied');
        } else {
          setAuthStatus('unauthenticated');
        }
      })
      .catch(() => setAuthStatus('unauthenticated'));
  }, []);

  // Fetch uploaded terms and interview when authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    refreshUploadedContent();
  }, [authStatus, refreshUploadedContent]);

  const availableStudyCategories = useMemo(() => {
    const seen = new Set(uploadedTermsRaw.map((x) => x.c));
    return ALL_CATEGORIES.filter((c) => seen.has(c));
  }, [uploadedTermsRaw]);

  useEffect(() => {
    setSelectedCategories((prev) => prev.filter((c) => availableStudyCategories.includes(c)));
  }, [availableStudyCategories]);

  const mergedTermsSource = useMemo<Flashcard[]>(() => {
    const seen = new Set<string>();
    const fromUploaded = uploadedTermsRaw.map(({ t, d, l, c }) => ({
      id: uniqueId(`uploaded-${t}`, seen),
      term: t,
      definition: d,
      example: `e.g. ${d.slice(0, 60)}${d.length > 60 ? '…' : ''}`,
      quizTip: `Focus on: ${c}.`,
      level: l,
      category: c,
    }));
    return fromUploaded;
  }, [uploadedTermsRaw]);

  const mergedInterviewBank = useMemo(() => uploadedInterviewRaw, [uploadedInterviewRaw]);
  const interviewRoles = useMemo(() => [...new Set(mergedInterviewBank.map((e) => e.role))], [mergedInterviewBank]);
  const interviewCompanies = useMemo(() => [...new Set(mergedInterviewBank.map((e) => e.company))], [mergedInterviewBank]);

  useEffect(() => {
    if (interviewRoles.length > 0 && (selectedRole === null || !interviewRoles.includes(selectedRole)))
      setSelectedRole(interviewRoles[0]);
  }, [interviewRoles, selectedRole]);

  // Initialize and shuffle terms when starting a session (use merged source)
  useEffect(() => {
    if (!isConfigured) return;

    let filtered = [...mergedTermsSource];
    filtered = filtered.filter(t => selectedCategories.includes(t.category));
    if (selectedLevel !== null) {
      filtered = filtered.filter(t => t.level === selectedLevel);
    }

    const shuffled = filtered.sort(() => 0.5 - Math.random());
    setTerms(shuffled);
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
    setSelectedOption(null);
    setShowExplanation(false);
    if (homeChoice === 'quiz') setMode('quiz');
    else setMode('flashcard');
  }, [isConfigured, selectedLevel, selectedCategories, homeChoice, mergedTermsSource]);

  const termsToShow = useMemo(() =>
    terms.filter(t => !completedTermIds.has(t.id)),
    [terms, completedTermIds]
  );
  const displayIndex = termsToShow.length === 0 ? 0 : Math.min(currentIndex, Math.max(0, termsToShow.length - 1));
  const currentCard = (mode === 'flashcard' ? termsToShow[displayIndex] : terms[currentIndex]) ?? null;

  // Persist lightweight progress snapshots for admin/manager dashboard.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser) return;
    const interviewAnswered = interviewPhase === 'complete'
      ? sessionQuestions.length
      : interviewPhase === 'in_progress'
        ? Math.min(interviewIndex + 1, sessionQuestions.length)
        : 0;

    const payload = {
      module: homeChoice ?? 'home',
      total_terms: terms.length,
      completed_terms: completedTermIds.size,
      quiz_correct: score.correct,
      quiz_incorrect: score.incorrect,
      interview_total: sessionQuestions.length,
      interview_answered: interviewAnswered,
    };

    const timer = setTimeout(() => {
      fetch('/api/progress', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [
    authStatus,
    currentUser,
    homeChoice,
    terms.length,
    completedTermIds.size,
    score.correct,
    score.incorrect,
    sessionQuestions.length,
    interviewIndex,
    interviewPhase,
  ]);

  // Interview in_progress: play current question TTS; when it ends, set questionAudioDone so typewriter can start
  useEffect(() => {
    if (homeChoice !== 'interview' || interviewPhase !== 'in_progress' || sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    setQuestionAudioDone(false);
    setTypewriterDisplayed('');
    const q = sessionQuestions[idx].question;
    speakTerm(q, 0, () => setQuestionAudioDone(true));
  }, [homeChoice, interviewPhase, interviewIndex, sessionQuestions.length]);

  // Scroll chat to bottom when new Q&A is added or typewriter updates
  useEffect(() => {
    if (homeChoice !== 'interview' || interviewPhase !== 'in_progress') return;
    interviewChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [homeChoice, interviewPhase, interviewIndex, typewriterDisplayed]);

  // Typewriter: after question audio ends, reveal ideal_answer character by character (speed: slow/medium/fast)
  const typewriterMs = { slow: 120, medium: 60, fast: 30 }[typewriterSpeed];
  useEffect(() => {
    if (homeChoice !== 'interview' || interviewPhase !== 'in_progress' || !questionAudioDone || sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    const full = sessionQuestions[idx].ideal_answer;
    if (typewriterDisplayed.length >= full.length) return;
    const t = setTimeout(() => {
      setTypewriterDisplayed((prev) => full.slice(0, prev.length + 1));
    }, typewriterMs);
    return () => clearTimeout(t);
  }, [homeChoice, interviewPhase, questionAudioDone, interviewIndex, sessionQuestions, typewriterDisplayed, typewriterMs]);

  // TTS — same as working project: memory cache -> DB cache -> Gemini, retry only for 429.
  const speakTerm = async (text: string, retryCount = 0, onEnded?: () => void) => {
    if (isSpeaking && retryCount === 0) return;
    const normalizedText = text.toLowerCase();

    if (audioCacheRef.current[normalizedText] && retryCount === 0) {
      playBuffer(audioCacheRef.current[normalizedText], onEnded);
      return;
    }

    if (retryCount === 0) {
      try {
        const dbResponse = await fetch(`/api/tts/${encodeURIComponent(normalizedText)}`);
        if (dbResponse.ok) {
          const { audio } = await dbResponse.json();
          if (audio) {
            const buffer = await decodeBase64ToBuffer(audio);
            audioCacheRef.current[normalizedText] = buffer;
            playBuffer(buffer, onEnded);
            return;
          }
        }
      } catch (error) {
        console.warn("DB Cache check failed", error);
      }
    }

    if (!ai) {
      console.warn("GEMINI_API_KEY not set; TTS disabled.");
      onEnded?.();
      return;
    }

    setIsSpeaking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: normalizedText, audio: base64Audio }),
        }).catch(err => console.error("Failed to save to DB cache", err));

        const buffer = await decodeBase64ToBuffer(base64Audio);
        audioCacheRef.current[normalizedText] = buffer;
        playBuffer(buffer, onEnded);
      } else {
        setIsSpeaking(false);
        onEnded?.();
      }
    } catch (error: any) {
      console.error("TTS Error:", error);
      if (error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          setTimeout(() => speakTerm(text, retryCount + 1, onEnded), delay);
          return;
        } else {
          setExplanation("AI Voice quota exceeded. Please wait a moment or continue without audio.");
          setShowExplanation(true);
        }
      }
      setIsSpeaking(false);
      onEnded?.();
    }
  };

  const speakAnswer = async (
    questionText: string,
    answerText: string,
    retryCount = 0,
    onEnded?: () => void
  ) => {
    if (!answerText) return;
    if (isSpeaking && retryCount === 0) return;
    const slug = questionText.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 60);
    const cacheKey = `interview_answer_${slug}`;

    if (audioCacheRef.current[cacheKey] && retryCount === 0) {
      playBuffer(audioCacheRef.current[cacheKey], onEnded);
      return;
    }

    if (retryCount === 0) {
      try {
        const dbResponse = await fetch(`/api/tts/${encodeURIComponent(cacheKey)}`);
        if (dbResponse.ok) {
          const { audio } = await dbResponse.json();
          if (audio) {
            const buffer = await decodeBase64ToBuffer(audio);
            audioCacheRef.current[cacheKey] = buffer;
            playBuffer(buffer, onEnded);
            return;
          }
        }
      } catch (e) {
        console.warn("Answer audio cache check failed", e);
      }
    }

    if (!ai) {
      console.warn("GEMINI_API_KEY not set; answer TTS disabled.");
      onEnded?.();
      return;
    }
    setIsSpeaking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: answerText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: cacheKey, audio: base64Audio }),
        }).catch(err => console.error("Failed to save answer audio to storage", err));
        const buffer = await decodeBase64ToBuffer(base64Audio);
        audioCacheRef.current[cacheKey] = buffer;
        playBuffer(buffer, onEnded);
      } else {
        setIsSpeaking(false);
        onEnded?.();
      }
    } catch (error: any) {
      console.error("Answer TTS error:", error);
      if (error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          setTimeout(() => speakAnswer(questionText, answerText, retryCount + 1, onEnded), delay);
          return;
        } else {
          setExplanation("AI Voice quota exceeded. Please wait a moment or continue without audio.");
          setShowExplanation(true);
        }
      }
      setIsSpeaking(false);
      onEnded?.();
    }
  };

  const decodeBase64ToBuffer = async (base64: string): Promise<AudioBuffer> => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const sampleRate = 24000;
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768;
    }
    return audioBuffer;
  };

  const playBuffer = (buffer: AudioBuffer, onEnded?: () => void) => {
    if (!audioContextRef.current) return;
    setIsSpeaking(true);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      setIsSpeaking(false);
      onEnded?.();
    };
    source.start();
  };

  // Auto-speak on flip
  useEffect(() => {
    if (isFlipped && currentCard) {
      speakTerm(currentCard.term);
    }
  }, [isFlipped]);

  // Shuffle options for quiz
  useEffect(() => {
    if (mode === 'quiz' && currentCard) {
      const others = terms
        .filter(t => t.id !== currentCard.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(t => t.term);
      
      const options = [...others, currentCard.term].sort(() => 0.5 - Math.random());
      setQuizOptions(options);
      setSelectedOption(null);
      setShowExplanation(false);
      setExplanation('');
      setTranscription('');
      setSimilarityScore(null);
    }
  }, [currentIndex, mode, terms, currentCard]);

  const studyTerms = mode === 'flashcard' ? termsToShow : terms;
  const studyLength = studyTerms.length;
  const studyIndex = mode === 'flashcard' ? displayIndex : currentIndex;

  const handleNext = () => {
    setIsFlipped(false);
    if (studyLength <= 0) return;
    setCurrentIndex((prev) => (prev + 1) % studyLength);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (studyLength <= 0) return;
    setCurrentIndex((prev) => (prev - 1 + studyLength) % studyLength);
  };

  const handleShuffle = () => {
    const shuffled = [...terms].sort(() => 0.5 - Math.random());
    setTerms(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleScore = (type: 'correct' | 'incorrect') => {
    setScore(prev => ({ ...prev, [type]: prev[type] + 1 }));
    if (type === 'correct' && currentCard?.id) {
      setCompletedTermIds(prev => new Set(prev).add(currentCard.id));
    } else {
      handleNext();
    }
  };

  const handleQuizSelect = async (option: string) => {
    if (selectedOption || !currentCard) return;
    setSelectedOption(option);
    
    const isCorrect = option === currentCard.term;
    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
    }

    // Get AI explanation
    if (!ai) {
      setExplanation("Add GEMINI_API_KEY to `.env` to enable AI explanations.");
      setShowExplanation(true);
      setIsLoadingExplanation(false);
      return;
    }
    setIsLoadingExplanation(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Explain briefly why "${currentCard.term}" is the correct answer for the definition: "${currentCard.definition}". Also mention why "${option}" might be confusing if it's incorrect. Keep it under 60 words. Use markdown for bolding key terms.`,
      });
      setExplanation(response.text || '');
    } catch (error) {
      console.error("AI Error:", error);
      setExplanation("Could not load AI explanation.");
    } finally {
      setIsLoadingExplanation(false);
      setShowExplanation(true);
    }
  };

  // STT / Live API Logic
  const startListening = async () => {
    if (isListening) return;
    if (!ai) {
      setTranscription("Add GEMINI_API_KEY to .env to enable voice input.");
      return;
    }
    setIsListening(true);
    setTranscription('Listening...');
    setSimilarityScore(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a speech-to-text transcriber for a quiz. Transcribe the user's answer accurately. The expected answer is related to "${currentCard.term}". Just return the transcription.`,
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: async (message) => {
            const serverContent = message.serverContent as any;
            if (serverContent?.modelTurn?.parts?.[0]?.text) {
              // This is where we might get text if we asked for it
            }
            if (serverContent?.userTranscription?.text) {
              const text = serverContent.userTranscription.text;
              setTranscription(text);
              stopListening(text);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            stopListening();
          }
        }
      });

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Auto-stop after 5 seconds if no transcription
      setTimeout(() => {
        if (isListening) stopListening();
      }, 5000);

    } catch (error) {
      console.error("Mic Error:", error);
      setIsListening(false);
      setTranscription("Error accessing microphone.");
    }
  };

  const stopListening = async (finalTranscription?: string) => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsListening(false);

    if (finalTranscription && currentCard && ai) {
      // Compare transcription with correct answer using Gemini
      setIsLoadingExplanation(true);
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Compare the user's spoken answer: "${finalTranscription}" with the correct term: "${currentCard.term}". 
          Return a JSON object with:
          - score: number (0-100 similarity)
          - feedback: string (e.g., "Correct!", "Close!", "Try again")
          - isMatch: boolean (true if score > 80)
          `,
          config: { responseMimeType: "application/json" }
        });
        
        const result = JSON.parse(response.text || '{}');
        setSimilarityScore(result.score);
        
        if (result.isMatch) {
          handleQuizSelect(currentCard.term);
        } else {
          // If not a match, we don't auto-select, but show feedback
          setExplanation(`AI Feedback: ${result.feedback} (Match: ${result.score}%)`);
          setShowExplanation(true);
        }
      } catch (error) {
        console.error("Comparison Error:", error);
      } finally {
        setIsLoadingExplanation(false);
      }
    }
  };

  const resetStats = () => {
    setScore({ correct: 0, incorrect: 0 });
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleBackToSelection = () => {
    setIsConfigured(false);
  };

  const handleBackToHome = () => {
    setHomeChoice(null);
    setIsConfigured(false);
    setSelectedLevel(null);
    setSelectedCategories([]);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const startPractice = () => {
    if (selectedCategories.length === 0) return;
    setIsConfigured(true);
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      setAuthStatus('unauthenticated');
      setCurrentUser(null);
      window.location.href = '/';
    });
  };

  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const headerRightSlot = useMemo(() => (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowUserMenu((v) => !v)}
        className="flex items-center gap-2 min-w-0 rounded-lg py-1.5 pr-2 pl-1.5 hover:bg-[var(--stint-bg)] text-[var(--stint-text)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
        aria-label="Account menu"
        aria-expanded={showUserMenu}
        aria-haspopup="true"
      >
        {currentUser?.avatar_url ? (
          <img src={currentUser.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" loading="lazy" width={28} height={28} />
        ) : (
          <span className="w-7 h-7 rounded-full bg-[var(--stint-primary)]/20 flex items-center justify-center text-[var(--stint-primary)] font-semibold text-xs">
            {currentUser?.name?.slice(0, 1)?.toUpperCase() ?? '?'}
          </span>
        )}
        <span className="hidden sm:inline text-sm font-medium truncate max-w-[100px]">{currentUser?.name}</span>
      </button>
      {showUserMenu && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden onClick={() => setShowUserMenu(false)} />
          <div className="absolute right-0 top-full mt-2 z-40 w-56 rounded-2xl bg-white shadow-xl border border-[var(--stint-border)] overflow-hidden" role="menu">
            <div className="px-4 py-3 border-b border-[var(--stint-border)] bg-[var(--stint-bg)]">
              <p className="text-sm font-semibold text-[var(--stint-text)] truncate">{currentUser?.name}</p>
              <p className="text-xs text-[var(--stint-text-muted)] truncate">{currentUser?.email}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
                {currentUser?.role}
              </span>
            </div>
            {canUpload && (
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--stint-text)] hover:bg-[var(--stint-bg)] transition-colors"
                onClick={() => { setShowUserMenu(false); setShowAdminPanel(true); }}
              >
                <Settings size={16} className="text-[var(--stint-text-muted)]" />
                Admin Panel
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors border-t border-[var(--stint-border)]"
              onClick={() => { setShowUserMenu(false); handleLogout(); }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  ), [currentUser, canUpload, showUserMenu]);

  const isHomeScreen = homeChoice === null && !isConfigured;
  const activeSection: SectionId = isHomeScreen ? 'home' : homeChoice === 'flashcards' ? 'flashcards' : homeChoice === 'interview' ? 'interview' : 'quiz';
  const bottomNavProps: GlobalBottomNavProps = {
    activeSection,
    onHome: handleBackToHome,
    onFlashcards: () => { setHomeChoice('flashcards'); setIsConfigured(false); },
    onInterview: () => { setHomeChoice('interview'); setInterviewPhase('select'); setIsConfigured(false); },
    onQuiz: () => { setHomeChoice('quiz'); setIsConfigured(false); },
  };

  // —— Auth gates ——
  if (authStatus === 'loading') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)]">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--stint-primary)]" />
        <p className="mt-4 text-sm text-[var(--stint-text-muted)]">Loading…</p>
      </div>
    );
  }
  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)] p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-[var(--stint-border)] shadow-lg p-8 flex flex-col items-center">
          <div className="mb-3 flex items-center">
            <img src="/stint-logo.svg" alt="Stint Academy" className="h-10 w-auto" />
            <span className="ml-0.5 relative -top-px text-[22px] font-semibold leading-none tracking-tight text-[var(--stint-primary)]">
              Academy
            </span>
          </div>
          <p className="text-sm text-[#6B7280] mb-6">Sign in to continue</p>
          <a
            href="/auth/google"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Continue with Google
          </a>
        </div>
      </div>
    );
  }
  if (authStatus === 'access_denied') {
    return (
      <AccessDeniedScreen user={currentUser} onLogout={handleLogout} />
    );
  }

  // —— Home: pick Flashcards | Interview Practice | Quiz ——
  if (homeChoice === null && !isConfigured) {
    const topBar: GlobalTopBarProps = { sectionLabel: 'Home', stepLabel: '', showBack: false, onBack: () => {}, onHome: handleBackToHome, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col items-center">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-1 text-center text-[18px] font-semibold tracking-tight text-[var(--stint-primary)]"
          >
            Interview Coach
          </motion.p>
          <p className="text-xs text-[#6B7280] font-medium mb-6">
            Choose how you want to practice
          </p>
          {!ai && (
            <p className="mb-6 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 max-w-md">
              Add <code className="font-mono bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> to <code className="font-mono bg-amber-100 px-1 rounded">.env</code> for AI voice and quiz explanations.
            </p>
          )}
          <div className="w-full flex flex-col gap-4 max-w-md">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => setHomeChoice('flashcards')}
            className="w-full p-6 rounded-3xl bg-white border-2 border-black/5 hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
          >
            <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
              <BookOpen size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--stint-primary)]">Flashcards</h2>
              <p className="text-sm text-black/60">Flip cards to learn terms and definitions</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => {
              setHomeChoice('interview');
              setInterviewPhase('select');
            }}
            className="w-full p-6 rounded-3xl bg-white border-2 border-black/5 hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
          >
            <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
              <MessageSquare size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--stint-primary)]">Interview Practice</h2>
              <p className="text-sm text-black/60">Q &amp; A for practice flow for the interview</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => setHomeChoice('quiz')}
            className="w-full p-6 rounded-3xl bg-white border-2 border-black/5 hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
          >
            <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
              <BrainCircuit size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--stint-primary)]">Quiz</h2>
              <p className="text-sm text-black/60">Multiple choice and voice answer</p>
            </div>
          </motion.button>
          </div>
        </div>
      </AppLayout>
      </>
    );
  }

  // —— Interview setup: select role, then start session ——
  if (homeChoice === 'interview' && !isConfigured) {
    const canStart = !!selectedRole;
    const startInterview = () => {
      if (!canStart) return;
      const filtered = mergedInterviewBank.filter((e) => e.role === selectedRole);
      const shuffled = [...filtered].sort(() => 0.5 - Math.random());
      if (shuffled.length === 0) return;
      setSessionQuestions(shuffled);
      setInterviewPhase('intro');
      setInterviewIndex(0);
      setIsConfigured(true);
    };
    const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Setup', showBack: true, onBack: handleBackToHome, onHome: handleBackToHome, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
          <p className="text-xs text-[#6B7280]">Select role. Questions will be shuffled each session.</p>
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">Role</h2>
            <div className="flex flex-wrap gap-2">
              {interviewRoles.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                    selectedRole === r ? "bg-[var(--stint-primary)] text-white border-[var(--stint-primary)]" : "bg-white border-black/10 hover:border-[var(--stint-primary)]"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </section>
          <section>
            <label htmlFor="candidate-name" className="block text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">Your name (for greeting)</label>
            <input
              id="candidate-name"
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value.trim() || 'Candidate')}
              placeholder="Candidate"
              className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white text-[#1A1A1A] placeholder:text-black/40"
            />
          </section>
          <div className="pt-4">
            <button
              disabled={!canStart}
              onClick={startInterview}
              className={cn(
                "w-full py-4 rounded-full font-bold text-base transition-all shadow-xl",
                canStart ? "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)]" : "bg-black/5 text-black/30 cursor-not-allowed"
              )}
            >
              Start Interview
            </button>
          </div>
        </div>
      </AppLayout>
      </>
    );
  }

  // —— Topic selection (after picking Flashcards / Quiz) ——
  if (!isConfigured) {
    const sectionLabel = homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz';
    const topBar: GlobalTopBarProps = { sectionLabel, stepLabel: 'Select topics', showBack: true, onBack: handleBackToHome, onHome: handleBackToHome, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">
              1. Select Topics
            </h2>
            <p className="text-[10px] text-black/50 mb-2">Pick one or more — grouped by subject</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => setSelectedCategories([...availableStudyCategories])}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--stint-primary)] text-[var(--stint-primary)] bg-white hover:bg-[var(--stint-primary)]/10 transition-all"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategories([])}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-black/10 text-black/60 bg-white hover:bg-black/5 transition-all"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableStudyCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    selectedCategories.includes(cat)
                      ? "bg-[var(--stint-primary)] text-white border-[var(--stint-primary)]"
                      : "bg-white text-[#1A1A1A]/60 border-black/5 hover:border-[var(--stint-accent)]"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            {availableStudyCategories.length === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                No uploaded flashcard categories yet. Admin can upload CSV in Admin Panel.
              </p>
            )}
          </section>

          {/* Level filter (optional) */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">
              2. Filter by level (optional)
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedLevel(null)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all border",
                  selectedLevel === null
                    ? "bg-[var(--stint-primary)] border-[var(--stint-primary)] text-white"
                    : "bg-white border-black/5 hover:border-[var(--stint-accent)]"
                )}
              >
                All levels
              </button>
              {([2, 3, 4, 5] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all border",
                    selectedLevel === level
                      ? "bg-[var(--stint-primary)] border-[var(--stint-primary)] text-white"
                      : "bg-white border-black/5 hover:border-[var(--stint-accent)]"
                  )}
                >
                  {LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </section>

          {/* Start Button */}
          <div className="pt-4 flex-shrink-0">
            <button
              disabled={selectedCategories.length === 0 || availableStudyCategories.length === 0}
              onClick={startPractice}
              className={cn(
                "w-full py-4 rounded-full font-bold text-base transition-all shadow-xl",
                selectedCategories.length > 0 && availableStudyCategories.length > 0
                  ? "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] transform hover:-translate-y-1"
                  : "bg-black/5 text-black/20 cursor-not-allowed"
              )}
            >
              {homeChoice === 'flashcards' && 'Start Flashcards'}
              {homeChoice === 'quiz' && 'Start Quiz'}
            </button>
          </div>
        </div>
      </AppLayout>
      </>
    );
  }

  // —— Interview: intro → in_progress (TTS question → typewriter answer) → complete ——
  if (isConfigured && homeChoice === 'interview') {
    const totalQuestions = sessionQuestions.length;
    const role = selectedRole ?? '';
    const name = candidateName || 'Candidate';

    // Phase: intro — "Your interview for [Role] at [Company] is about to begin", request mic, Begin
    if (interviewPhase === 'intro') {
      const requestMic = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          stream.getTracks().forEach((t) => t.stop());
          setMicGranted(true);
        } catch (e) {
          console.warn('Mic access denied', e);
        }
      };
      const beginInterview = () => {
        const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
        speakTerm(greeting, 0, () => setInterviewPhase('in_progress'));
      };
      const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Intro', showBack: true, onBack: () => { setIsConfigured(false); setInterviewPhase('select'); }, onHome: handleBackToHome, rightSlot: headerRightSlot };
      return (
        <>
          {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
          <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-[var(--stint-primary)] text-center mb-4">
            Your interview for {role} is about to begin.
          </h1>
          <p className="text-[#1A1A1A]/70 text-center mb-6 max-w-md">
            We'll use your microphone so you can practice speaking your answers aloud. Click below to allow mic access, then Begin.
          </p>
          {!micGranted ? (
            <button
              onClick={requestMic}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)]"
            >
              <Mic size={20} />
              Allow microphone
            </button>
          ) : (
            <button
              onClick={beginInterview}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)]"
            >
              Begin
            </button>
          )}
        </div>
        </AppLayout>
        </>
      );
    }

    // Phase: complete — thank you, listen to full session, optional feedback survey
    if (interviewPhase === 'complete') {
      const playFullSession = () => {
        const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
        const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
        const steps: ({ type: 'speak'; text: string } | { type: 'answer'; q: string; a: string })[] = [
          { type: 'speak' as const, text: greeting },
          ...sessionQuestions.flatMap((e) => [
            { type: 'speak' as const, text: e.question },
            { type: 'answer' as const, q: e.question, a: e.ideal_answer },
          ]),
          { type: 'speak' as const, text: closing },
        ];
        let i = 0;
        const next = () => {
          if (i >= steps.length) {
            setIsPlayingFullSession(false);
            return;
          }
          const step = steps[i++];
          if (step.type === 'speak') {
            speakTerm(step.text, 0, next);
          } else {
            speakAnswer(step.q, step.a, 0, next);
          }
        };
        setIsPlayingFullSession(true);
        next();
      };

      const topBarComplete: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Complete', showBack: false, onBack: () => {}, onHome: handleBackToHome, rightSlot: headerRightSlot };
      return (
        <>
          {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
          <AppLayout topBar={topBarComplete} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
          <h1 className="text-2xl font-serif font-bold text-[var(--stint-primary)] text-center mb-2">
            Thank you for your time, {name}.
          </h1>
          <p className="text-[#1A1A1A]/70 text-center mb-6">We'll be in touch soon.</p>

          <section className="w-full max-w-sm mb-6">
            <p className="text-sm font-semibold text-[var(--stint-primary)] mb-2">Listen to full session</p>
            <p className="text-xs text-[#1A1A1A]/60 mb-3">Play greeting, all questions and answers, then closing.</p>
            <button
              onClick={playFullSession}
              disabled={isPlayingFullSession}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium border-2 transition-all",
                isPlayingFullSession
                  ? "border-[var(--stint-primary)]/50 text-[var(--stint-primary)] bg-[var(--stint-primary)]/10"
                  : "border-[var(--stint-primary)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)] hover:text-white"
              )}
            >
              <Volume2 size={20} />
              {isPlayingFullSession ? 'Playing…' : 'Play full session audio'}
            </button>
          </section>

          <section className="w-full max-w-sm mb-8">
            <p className="text-sm font-semibold text-[var(--stint-primary)] mb-3">How confident do you feel? (optional)</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setFeedbackRating(n)}
                  className={cn(
                    "w-10 h-10 rounded-full font-bold text-sm transition-all",
                    feedbackRating === n ? "bg-[var(--stint-primary)] text-white" : "bg-white border border-black/10 hover:border-[var(--stint-primary)]"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => downloadInterviewPDF({ candidateName: name, role, company: (sessionQuestions[0]?.company ?? ''), questions: sessionQuestions.map((q) => ({ question: q.question, ideal_answer: q.ideal_answer })) })}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--stint-primary)] text-white rounded-full font-medium"
            >
              <Download size={16} />
              Download PDF
            </button>
            <button
              onClick={() => {
                setInterviewPhase('intro');
                setInterviewIndex(0);
                setFeedbackRating(null);
                setIsPlayingFullSession(false);
              }}
              className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium"
            >
              Practice again
            </button>
            <button
              onClick={handleBackToHome}
              className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium"
            >
              Home
            </button>
          </div>
        </div>
        </AppLayout>
        </>
      );
    }

    // Phase: in_progress — question TTS, then typewriter ideal answer, Next (or empty state)
    if (interviewPhase === 'in_progress') {
      if (totalQuestions === 0) {
        const topBarEmpty: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'No questions', showBack: true, onBack: handleBackToHome, onHome: handleBackToHome, rightSlot: headerRightSlot };
        return (
          <>
            {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
            <AppLayout topBar={topBarEmpty} bottomNav={bottomNavProps}>
            <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh]">
              <p className="text-[var(--stint-primary)] font-semibold mb-2">No questions available</p>
              <p className="text-sm text-[#6B7280] mb-4">Try a different role.</p>
              <button onClick={handleBackToHome} className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2">Home</button>
            </div>
          </AppLayout>
          </>
        );
      }
      const entry = sessionQuestions[interviewIndex];
      const isLast = interviewIndex >= totalQuestions - 1;
      const idealFull = entry?.ideal_answer ?? '';
      const typewriterDone = typewriterDisplayed.length >= idealFull.length;

      const goNext = () => {
        if (isLast) {
          const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
          speakTerm(closing, 0, () => setInterviewPhase('complete'));
        } else {
          setInterviewIndex((i) => i + 1);
        }
      };
      const goPrev = () => {
        if (interviewIndex > 0) setInterviewIndex((i) => i - 1);
      };

      const topBarInProgress: GlobalTopBarProps = {
        sectionLabel: 'Interview Practice',
        stepLabel: `Question ${interviewIndex + 1} of ${totalQuestions}`,
        showBack: true,
        onBack: () => setInterviewPhase('intro'),
        onHome: handleBackToHome,
        rightSlot: headerRightSlot,
      };

      const SWIPE_THRESHOLD = 60;
      const handleTouchStart = (e: React.TouchEvent) => {
        interviewSwipeStartX.current = e.touches[0].clientX;
        interviewSwipeStartY.current = e.touches[0].clientY;
      };
      const handleTouchEnd = (e: React.TouchEvent) => {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - interviewSwipeStartX.current;
        const deltaY = endY - interviewSwipeStartY.current;
        if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
        if (Math.abs(deltaY) > Math.abs(deltaX)) return;
        if (deltaX > 0) goNext();
        else goPrev();
      };

      return (
        <>
          {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
          <AppLayout topBar={topBarInProgress} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between py-3 mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-black/50">Speed:</span>
              {(['slow', 'medium', 'fast'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setTypewriterSpeed(s)}
                  className={cn("px-2 py-1 rounded text-xs font-medium", typewriterSpeed === s ? "bg-[var(--stint-primary)] text-white" : "bg-black/5")}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <main
            className="flex-1 min-h-0 w-full flex flex-col overflow-hidden touch-pan-y -mx-4 px-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <p className="flex-shrink-0 text-[10px] text-black/50 text-center py-1 md:hidden">Swipe right → next · Swipe left → previous</p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
              {sessionQuestions.slice(0, interviewIndex + 1).map((item, i) => {
                const isCurrent = i === interviewIndex;
                const answerText = isCurrent ? typewriterDisplayed : item.ideal_answer;
                const showCursor = isCurrent && questionAudioDone && !typewriterDone;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden"
                  >
                    <div className="p-4 border-b border-black/5 bg-[var(--stint-bg)]/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-1">Q{i + 1}</p>
                      <p className="text-base font-serif font-semibold text-[var(--stint-primary)]">{item.question}</p>
                      <button
                        onClick={() => speakTerm(item.question)}
                        className={cn("mt-2 p-1.5 rounded-full", isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-white text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/20 border border-black/5")}
                        title="Play question"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-1">Answer</p>
                      <p className="text-sm leading-relaxed text-[#1A1A1A] whitespace-pre-wrap">
                        {answerText}
                        {showCursor && <span className="inline-block w-2 h-3.5 ml-0.5 bg-[var(--stint-primary)] animate-pulse align-middle" aria-hidden="true" />}
                      </p>
                      <button
                        onClick={() => speakAnswer(item.question, item.ideal_answer)}
                        className={cn("mt-2 p-1.5 rounded-full", isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/20 border border-black/5")}
                        title="Play answer"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={interviewChatEndRef} />
            </div>

            <div className="flex-shrink-0 py-3 flex justify-end">
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] font-medium"
              >
                {isLast ? 'Finish' : 'Next'}
                <ChevronRight size={20} />
              </button>
            </div>
          </main>
        </div>
        </AppLayout>
        </>
      );
    }

    return null;
  }

  if (terms.length === 0) {
    const sectionLabel = homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz';
    const topBarEmpty: GlobalTopBarProps = { sectionLabel, stepLabel: 'No terms', showBack: true, onBack: handleBackToSelection, onHome: handleBackToHome, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
        <AppLayout topBar={topBarEmpty} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h2 className="text-xl font-semibold text-[var(--stint-primary)] mb-2">No terms found</h2>
          <p className="text-sm text-[#6B7280] mb-6">Try selecting one or more topics above.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={handleBackToSelection}
              className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
            >
              Change topics
            </button>
            <button
              onClick={handleBackToHome}
              className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium hover:bg-[var(--stint-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
            >
              Home
            </button>
          </div>
        </div>
      </AppLayout>
      </>
    );
  }

  if (homeChoice === 'flashcards' && mode === 'flashcard' && termsToShow.length === 0) {
    const topBarAllDone: GlobalTopBarProps = { sectionLabel: 'Flashcards', stepLabel: 'All done', showBack: true, onBack: handleBackToSelection, onHome: handleBackToHome, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
        <AppLayout topBar={topBarAllDone} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
            <h2 className="text-xl font-semibold text-[var(--stint-primary)] mb-2">All cards completed</h2>
            <p className="text-sm text-[#6B7280] mb-6">You marked every card correct in this round.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => { setCompletedTermIds(new Set()); setCurrentIndex(0); }}
                className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Study again
              </button>
              <button
                onClick={handleBackToSelection}
                className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium hover:bg-[var(--stint-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Back to topics
              </button>
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  const sectionLabelStudy = homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz';
  const stepLabelStudy = `${studyIndex + 1} / ${studyLength}`;
  const topBarStudy: GlobalTopBarProps = { sectionLabel: sectionLabelStudy, stepLabel: stepLabelStudy, showBack: true, onBack: handleBackToSelection, onHome: handleBackToHome, rightSlot: headerRightSlot };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={refreshUploadedContent} />}
      <AppLayout topBar={topBarStudy} bottomNav={bottomNavProps}>
    <div className="w-full max-w-4xl mx-auto px-4 flex flex-col min-h-0 flex-1">
      {/* Toolbar: mode switch + progress + stats */}
      <div className="flex-shrink-0 flex items-center gap-4 py-3 border-b border-[var(--stint-border)]">
        <div className="flex rounded-xl bg-[var(--stint-bg)] p-1">
          <button
            onClick={() => setMode('flashcard')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              mode === 'flashcard' ? "bg-white text-[var(--stint-primary)] shadow-sm" : "text-[var(--stint-text-muted)] hover:text-[var(--stint-text)]"
            )}
          >
            <BookOpen size={18} strokeWidth={2} />
            <span className="hidden sm:inline">Flashcards</span>
          </button>
          <button
            onClick={() => setMode('quiz')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              mode === 'quiz' ? "bg-white text-[var(--stint-primary)] shadow-sm" : "text-[var(--stint-text-muted)] hover:text-[var(--stint-text)]"
            )}
          >
            <BrainCircuit size={18} strokeWidth={2} />
            <span className="hidden sm:inline">Quiz</span>
          </button>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-[var(--stint-border)] overflow-hidden">
            <div className="h-full rounded-full bg-[var(--stint-primary)] transition-all duration-300" style={{ width: `${studyLength > 0 ? ((studyIndex + 1) / studyLength) * 100 : 0}%` }} />
          </div>
          <span className="text-xs font-medium text-[var(--stint-text-muted)] tabular-nums">{studyIndex + 1}/{studyLength}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 text-emerald-600" title="Correct"><CheckCircle2 size={16} /><span className="text-sm font-semibold tabular-nums">{score.correct}</span></span>
          <span className="flex items-center gap-1 text-rose-500" title="Incorrect"><XCircle size={16} /><span className="text-sm font-semibold tabular-nums">{score.incorrect}</span></span>
          <button onClick={handleShuffle} className="p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] transition-colors" title="Shuffle"><Shuffle size={18} /></button>
          <button onClick={resetStats} className="p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] transition-colors" title="Reset"><RotateCcw size={18} /></button>
        </div>
      </div>

      {/* Main Content Area — card fills viewport */}
      <main className="flex-1 min-h-0 flex flex-col py-3 md:py-4">
        <div className="relative flex-1 min-h-[50vh] w-full perspective-1000 flex items-stretch justify-center">
          <AnimatePresence mode="wait">
            {mode === 'flashcard' ? (
              <motion.div
                key={`card-${currentCard.id}`}
                role="button"
                tabIndex={0}
                aria-label={isFlipped ? 'Show term' : 'Show definition'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full min-h-[50vh] flex-1 cursor-pointer flex items-stretch justify-center px-0 max-w-3xl mx-auto focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 rounded-2xl"
                onClick={() => setIsFlipped(!isFlipped)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsFlipped(!isFlipped); } }}
              >
                <div className={cn(
                  "relative w-full min-h-[50vh] flex-1 transition-all duration-500 preserve-3d",
                  isFlipped && "rotate-y-180"
                )}>
                  {/* Front — large, term as hero */}
                  <div className="absolute inset-0 backface-hidden bg-white rounded-2xl md:rounded-3xl shadow-xl border border-[var(--stint-border)] flex flex-col items-center justify-center p-8 md:p-12 lg:p-16 text-center min-h-[48vh]">
                    <span className="absolute top-5 left-5 text-xs font-medium text-[var(--stint-text-muted)] uppercase tracking-wider">
                      {currentCard.category}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); speakTerm(currentCard.term); }}
                      className={cn(
                        "absolute top-5 right-5 p-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2",
                        isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/10"
                      )}
                      aria-label="Play audio"
                    >
                      <Volume2 size={24} strokeWidth={2} />
                    </button>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[var(--stint-text)] leading-tight max-w-[85%]">
                      {currentCard.term}
                    </h2>
                    <p className="mt-8 text-base text-[var(--stint-text-muted)]">Tap card to see definition</p>
                  </div>

                  {/* Back — large definition, scroll only when needed */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white rounded-2xl md:rounded-3xl shadow-xl border border-[var(--stint-border)] flex flex-col p-6 md:p-10 lg:p-12 min-h-[48vh] overflow-y-auto">
                    <div className="flex justify-between items-start gap-4 mb-4 flex-shrink-0">
                      <h3 className="text-sm font-semibold text-[var(--stint-primary)] uppercase tracking-wider">
                        Definition
                      </h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); speakTerm(currentCard.term); }}
                        className={cn(
                          "p-2.5 rounded-xl transition-all flex-shrink-0",
                          isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/10"
                        )}
                        aria-label="Play audio"
                      >
                        <Volume2 size={20} strokeWidth={2} />
                      </button>
                    </div>
                    <p className="text-lg md:text-xl leading-relaxed text-[var(--stint-text)] mb-6 flex-shrink-0">
                      {currentCard.definition}
                    </p>
                    <div className="space-y-4 flex-shrink-0">
                      <div className="bg-[var(--stint-bg)] p-4 rounded-xl">
                        <h4 className="text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Lightbulb size={14} /> Example
                        </h4>
                        <p className="text-base text-[var(--stint-text-muted)]">{currentCard.example}</p>
                      </div>
                      <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-100">
                        <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Trophy size={14} /> Quiz tip
                        </h4>
                        <p className="text-base text-emerald-800">{currentCard.quizTip}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`quiz-${currentCard.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl mx-auto min-h-[50vh] flex flex-col bg-white rounded-2xl md:rounded-3xl shadow-xl border border-[var(--stint-border)] p-6 md:p-10 lg:p-12 overflow-y-auto"
              >
                <div className="flex justify-between items-start gap-4 mb-6">
                  <span className="text-sm font-medium text-[var(--stint-text-muted)]">{currentCard.category}</span>
                  <button
                    onClick={isListening ? () => stopListening() : startListening}
                    disabled={!!selectedOption}
                    className={cn(
                      "p-3 rounded-xl transition-all flex-shrink-0",
                      isListening ? "bg-rose-500 text-white" : "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)]",
                      selectedOption && "opacity-50 cursor-not-allowed"
                    )}
                    aria-label={isListening ? "Stop listening" : "Speak answer"}
                  >
                    {isListening ? <MicOff size={24} strokeWidth={2} /> : <Mic size={24} strokeWidth={2} />}
                  </button>
                </div>

                <h3 className="text-xl font-semibold text-[var(--stint-text)] mb-4 leading-relaxed">
                  Which term matches this definition?
                </h3>
                <p className="text-lg md:text-xl text-[var(--stint-primary)] font-medium mb-8 leading-relaxed">"{currentCard.definition}"</p>

                {transcription && (
                  <div className="mb-6 p-4 bg-emerald-50/80 rounded-xl border border-emerald-100 flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                      <Mic size={16} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Spoken answer</p>
                      <p className="text-sm font-medium text-emerald-900 truncate">"{transcription}"</p>
                      {similarityScore !== null && (
                        <p className="text-xs text-emerald-600 mt-0.5">Match: {similarityScore}%</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {quizOptions.map((option) => (
                    <button
                      key={option}
                      disabled={!!selectedOption}
                      onClick={() => handleQuizSelect(option)}
                      className={cn(
                        "w-full p-5 rounded-xl text-left text-base font-medium transition-all border",
                        !selectedOption && "border-[var(--stint-border)] bg-white hover:border-[var(--stint-primary)] hover:bg-[var(--stint-bg)]",
                        selectedOption === option && option === currentCard.term && "bg-emerald-50 border-emerald-400 text-emerald-800",
                        selectedOption === option && option !== currentCard.term && "bg-rose-50 border-rose-400 text-rose-700",
                        selectedOption && option === currentCard.term && option !== selectedOption && "bg-emerald-50 border-emerald-200 text-emerald-800"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                {showExplanation && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-[var(--stint-bg)] rounded-xl text-sm text-[var(--stint-text)] markdown-body"
                  >
                    {isLoadingExplanation ? (
                      <div className="flex items-center gap-2 animate-pulse">
                        <Loader2 size={16} className="animate-spin" />
                        Generating AI insight...
                      </div>
                    ) : (
                      <Markdown>{explanation}</Markdown>
                    )}
                  </motion.div>
                )}
                {showExplanation && !isLoadingExplanation && (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="mt-4 w-full py-3 rounded-full bg-[var(--stint-primary)] text-white font-semibold text-base focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
                  >
                    Next question →
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls — large tap targets */}
        <div className="flex-shrink-0 mt-4 md:mt-6 flex justify-between items-center gap-4">
          <button
            onClick={handlePrev}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-[var(--stint-border)] bg-white text-[var(--stint-text)] hover:bg-[var(--stint-bg)] font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
          >
            <ChevronLeft size={22} strokeWidth={2} />
            Prev
          </button>

          {mode === 'flashcard' && isFlipped && (
            <div className="flex gap-3">
              <button
                onClick={() => handleScore('incorrect')}
                className="p-3 rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                title="Mark incorrect"
              >
                <XCircle size={26} strokeWidth={2} />
              </button>
              <button
                onClick={() => handleScore('correct')}
                className="p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                title="Mark correct"
              >
                <CheckCircle2 size={26} strokeWidth={2} />
              </button>
            </div>
          )}

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 focus:ring-offset-white"
          >
            Next
            <ChevronRight size={22} strokeWidth={2} />
          </button>
        </div>
      </main>
    </div>
    </AppLayout>
    </>
  );
}
