import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Upload, Volume2, Loader2, CheckCircle2 } from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';
import { cn } from '../lib/utils';

type AdminTab = 'users' | 'allowlist' | 'requests' | 'audit' | 'progress' | 'upload' | 'delete';

interface AdminPanelProps {
  onClose: () => void;
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
}

export default function AdminPanel({ onClose, currentUser, onContentRefresh }: AdminPanelProps) {
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
  const [interviewList, setInterviewList] = useState<{ id: number; question: string; ideal_answer: string; role: string; company: string; category: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [termForm, setTermForm] = useState({ t: '', d: '', l: 4, c: '' });
  const [interviewForm, setInterviewForm] = useState({ question: '', ideal_answer: '', role: '', company: '', category: '' });
  const [bulkInterview, setBulkInterview] = useState({ role: '', company: '', category: '', entries: [] as { question: string; ideal_answer: string }[], preview: [] as string[][] });
  const [bulkTerms, setBulkTerms] = useState({ entries: [] as { t: string; d: string; l: number; c: string }[], preview: [] as string[][] });
  const [bulkImporting, setBulkImporting] = useState(false);

  // TTS bulk generation state
  const [ttsStats, setTtsStats] = useState<{ total: number; cached: number; missing: number } | null>(null);
  const [ttsJob, setTtsJob] = useState<{ running: boolean; generated: number; failed: number; total: number; current: string } | null>(null);
  const [ttsDeleting, setTtsDeleting] = useState(false);
  const ttsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bulk delete selection state
  const [selectedTermIds, setSelectedTermIds] = useState<Set<number>>(new Set());
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleTermId = (id: number) => setSelectedTermIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleInterviewId = (id: number) => setSelectedInterviewIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAllTerms = () => setSelectedTermIds((prev) =>
    prev.size === termsList.length ? new Set() : new Set(termsList.map((t) => t.id))
  );
  const toggleAllInterview = () => setSelectedInterviewIds((prev) =>
    prev.size === interviewList.length ? new Set() : new Set(interviewList.map((i) => i.id))
  );

  const bulkDeleteTerms = async () => {
    if (selectedTermIds.size === 0) return;
    if (!confirm(`Delete ${selectedTermIds.size} selected flashcard(s)?`)) return;
    setBulkDeleting(true);
    try {
      await fetch('/api/admin/terms/bulk-delete', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ ids: [...selectedTermIds] }),
      });
      setSelectedTermIds(new Set());
      fetchTerms();
      onContentRefresh();
    } finally { setBulkDeleting(false); }
  };

  const bulkDeleteInterview = async () => {
    if (selectedInterviewIds.size === 0) return;
    if (!confirm(`Delete ${selectedInterviewIds.size} selected Q&A(s)?`)) return;
    setBulkDeleting(true);
    try {
      await fetch('/api/admin/interview/bulk-delete', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ ids: [...selectedInterviewIds] }),
      });
      setSelectedInterviewIds(new Set());
      fetchInterview();
      onContentRefresh();
    } finally { setBulkDeleting(false); }
  };

  const fetchUsers = () => fetch('/api/admin/users', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setUsers);
  const fetchAllowlist = () => fetch('/api/admin/allowlist', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setAllowlist);
  const fetchRequests = () => fetch('/api/admin/requests', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setRequests);
  const fetchAudit = () => fetch('/api/admin/audit', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setAuditLog);
  const fetchProgress = () => fetch('/api/admin/progress', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setProgressRows);
  const fetchTerms = () => fetch('/api/admin/terms', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setTermsList);
  const fetchInterview = () => fetch('/api/admin/interview', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setInterviewList);
  const fetchTtsStats = () => fetch('/api/ai/tts/stats', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then((r) => r.json()).then(setTtsStats).catch(() => {});

  const fetchTtsJob = () => fetch('/api/ai/tts/job', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then((r) => r.json()).then((job) => {
      setTtsJob(job);
      if (!job.running && ttsPollingRef.current) {
        clearInterval(ttsPollingRef.current);
        ttsPollingRef.current = null;
        fetchTtsStats();
      }
    }).catch(() => {});

  const startPolling = () => {
    if (ttsPollingRef.current) return;
    ttsPollingRef.current = setInterval(() => {
      fetchTtsJob();
      fetchTtsStats();
    }, 5000);
  };

  const startBulkTts = async () => {
    await fetch('/api/ai/tts/bulk-generate', {
      method: 'POST', credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
    });
    fetchTtsJob();
    startPolling();
  };

  const cancelTtsJob = async () => {
    await fetch('/api/ai/tts/cancel', {
      method: 'POST', credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    fetchTtsJob();
  };

  const deleteTtsCache = async () => {
    if (!confirm('Delete all cached TTS audio? You will need to regenerate it.')) return;
    setTtsDeleting(true);
    try {
      const resp = await fetch('/api/ai/tts/cache', {
        method: 'DELETE', credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (resp.ok) {
        setTtsJob(null);
        fetchTtsStats();
      }
    } catch (e) {
      console.error('TTS cache delete error:', e);
    } finally {
      setTtsDeleting(false);
    }
  };

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (ttsPollingRef.current) clearInterval(ttsPollingRef.current);
    };
  }, []);

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
      if (tab === 'upload') {
        fetchTtsStats();
        fetchTtsJob().then(() => {
          if (ttsJob?.running) startPolling();
        });
      }
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

  const FETCH_HEADERS: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  const existingTermCategories = [...new Set(termsList.map((t) => String(t.c || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-[var(--stint-border)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--stint-border)]">
          <h2 className="text-lg font-bold text-[var(--stint-primary)]">Admin Panel</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--stint-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)]" aria-label="Close admin panel">&#x2715;</button>
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
                        fetch('/api/admin/users/' + u.id, { method: 'PATCH', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify({ role: e.target.value }) }).then(fetchUsers);
                      }}
                      className="text-sm border border-[var(--stint-border)] rounded-lg px-2 py-1.5 bg-white"
                    >
                      <option value="admin">admin</option>
                      <option value="manager">manager</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" className="rounded" checked={!!u.is_allowed} onChange={(e) => fetch('/api/admin/users/' + u.id, { method: 'PATCH', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify({ is_allowed: e.target.checked ? 1 : 0 }) }).then(() => fetchUsers())} />
                      <span>Active</span>
                    </label>
                    {u.id !== currentUser?.id && (
                      <button
                        type="button"
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                        title="Remove user"
                        onClick={() => window.confirm(`Remove ${u.name} from access?`) && fetch('/api/admin/users/' + u.id, { method: 'DELETE', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(fetchUsers)}
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
                <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white" onClick={() => fetch('/api/admin/allowlist', { method: 'POST', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify({ email: newEmail }) }).then(() => { setNewEmail(''); fetchAllowlist(); })}>Add</button>
              </div>
              {allowlist.map((a) => (
                <div key={a.email} className="flex justify-between items-center p-3 rounded-xl border border-[var(--stint-border)]">
                  <span>{a.email}</span>
                  <button
                    type="button"
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Remove from allowlist"
                    onClick={() => window.confirm(`Remove ${a.email} from allowlist?`) && fetch('/api/admin/allowlist/' + encodeURIComponent(a.email), { method: 'DELETE', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(fetchAllowlist)}
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
                    <button className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-sm" onClick={() => fetch('/api/admin/requests/' + r.id + '/approve', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(fetchRequests)}>Approve</button>
                    <button className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-sm" onClick={() => fetch('/api/admin/requests/' + r.id + '/reject', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(fetchRequests)}>Reject</button>
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
                    {a.created_at ? new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '\u2014'}
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
                            Correct: {p.quiz_correct ?? 0} &bull; Incorrect: {p.quiz_incorrect ?? 0}
                          </td>
                          <td className="px-3 py-2">
                            {(p.interview_answered ?? 0)}/{(p.interview_total ?? 0)} ({Number(p.interview_completion_pct ?? 0)}%)
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--stint-text-muted)]">
                            {p.updated_at ? new Date(p.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '\u2014'}
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
                      <input
                        id="admin-term-c"
                        list="admin-term-c-suggestions"
                        placeholder="e.g. Delta Lake"
                        value={termForm.c}
                        onChange={(e) => setTermForm((f) => ({ ...f, c: e.target.value }))}
                        className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm"
                      />
                      <datalist id="admin-term-c-suggestions">
                        {existingTermCategories.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                  <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white w-fit" onClick={() => fetch('/api/admin/terms', { method: 'POST', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify(termForm) }).then(() => { setTermForm({ t: '', d: '', l: 4, c: '' }); fetchTerms(); onContentRefresh(); })}>Add term</button>
                </div>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-2">Bulk upload terms (CSV)</h3>
                <p className="text-xs text-[var(--stint-text-muted)] mb-2">Format: term, definition, level (2-5), category. Optional header row.</p>
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
                          .filter((r) => r.length >= 4 && r[0]?.trim() && r[1]?.trim() && r[3]?.trim())
                          .map((r) => ({
                            t: String(r[0]).trim(),
                            d: String(r[1]).trim(),
                            l: Math.max(2, Math.min(5, Number(r[2]) || 4)),
                            c: String(r[3]).trim(),
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
                          const r = await fetch('/api/admin/terms/bulk', { method: 'POST', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify({ entries: bulkTerms.entries }) });
                          if (r.ok) { setBulkTerms({ entries: [], preview: [] }); fetchTerms(); onContentRefresh(); } else { const j = await r.json().catch(() => ({})); alert(j.error || 'Import failed'); }
                        } finally { setBulkImporting(false); }
                      }}
                    >
                      {bulkImporting ? 'Importing\u2026' : `Import ${bulkTerms.entries.length} terms`}
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
                    <label htmlFor="admin-int-category" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Category</label>
                    <input id="admin-int-category" placeholder="e.g. SQL, System Design" value={interviewForm.category} onChange={(e) => setInterviewForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="admin-int-question" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Question *</label>
                    <textarea id="admin-int-question" placeholder="Interview question" value={interviewForm.question} onChange={(e) => setInterviewForm((f) => ({ ...f, question: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" rows={2} />
                  </div>
                  <div>
                    <label htmlFor="admin-int-answer" className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Ideal answer *</label>
                    <textarea id="admin-int-answer" placeholder="Ideal answer" value={interviewForm.ideal_answer} onChange={(e) => setInterviewForm((f) => ({ ...f, ideal_answer: e.target.value }))} className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" rows={3} />
                  </div>
                  <button type="button" className="px-4 py-2 rounded-full bg-[var(--stint-primary)] text-white w-fit" onClick={() => fetch('/api/admin/interview', { method: 'POST', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify(interviewForm) }).then(() => { setInterviewForm({ question: '', ideal_answer: '', role: '', company: '', category: '' }); fetchInterview(); onContentRefresh(); })}>Add Q&A</button>
                </div>
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-2">Bulk upload interview Q&A (CSV)</h3>
                <p className="text-xs text-[var(--stint-text-muted)] mb-2">Format: question, ideal_answer (2 columns). Role, company and category below apply to all rows.</p>
                <div className="grid grid-cols-2 gap-2 max-w-md mb-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Role (for all rows)</label>
                    <input value={bulkInterview.role} onChange={(e) => setBulkInterview((b) => ({ ...b, role: e.target.value }))} placeholder="e.g. Data Engineer" className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Company (for all rows)</label>
                    <input value={bulkInterview.company} onChange={(e) => setBulkInterview((b) => ({ ...b, company: e.target.value }))} placeholder="e.g. Stint Academy" className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-[var(--stint-text-muted)] mb-1">Category (for all rows)</label>
                    <input value={bulkInterview.category} onChange={(e) => setBulkInterview((b) => ({ ...b, category: e.target.value }))} placeholder="e.g. SQL, General" className="w-full border border-[var(--stint-border)] rounded-xl px-3 py-2 text-sm" />
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
                          const r = await fetch('/api/admin/interview/bulk', { method: 'POST', credentials: 'include', headers: FETCH_HEADERS, body: JSON.stringify({ entries: bulkInterview.entries, role: bulkInterview.role.trim(), company: bulkInterview.company.trim(), category: bulkInterview.category.trim() || undefined }) });
                          if (r.ok) { setBulkInterview((b) => ({ ...b, entries: [], preview: [] })); fetchInterview(); onContentRefresh(); } else { const j = await r.json().catch(() => ({})); alert(j.error === 'Duplicates found' ? `Duplicates: ${(j.duplicates || []).join(', ')}` : j.error || 'Import failed'); }
                        } finally { setBulkImporting(false); }
                      }}
                    >
                      {bulkImporting ? 'Importing\u2026' : `Import ${bulkInterview.entries.length} Q&As`}
                    </button>
                  </div>
                )}
              </section>
              <section>
                <h3 className="font-semibold text-[var(--stint-primary)] mb-3 flex items-center gap-2">
                  <Volume2 size={18} />
                  Pre-generate TTS Audio
                </h3>
                <p className="text-xs text-[var(--stint-text-muted)] mb-3">
                  Generate and cache text-to-speech audio for all content — flashcard terms, definitions, and interview Q&A. Pre-computing audio speeds up playback for users.
                </p>
                {ttsStats && (
                  <div className="flex items-center gap-4 mb-3 text-sm">
                    <span className="text-[var(--stint-text)]"><span className="font-semibold">{ttsStats.total}</span> total items</span>
                    <span className="text-emerald-600"><span className="font-semibold">{ttsStats.cached}</span> cached</span>
                    {ttsStats.missing > 0 && <span className="text-amber-600"><span className="font-semibold">{ttsStats.missing}</span> uncached</span>}
                    {ttsStats.missing === 0 && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> All cached</span>}
                  </div>
                )}
                {ttsJob?.running && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-[var(--stint-text-muted)] mb-1">
                      <span>Generating: <span className="font-medium text-[var(--stint-text)]">{ttsJob.current}</span></span>
                      <span>{ttsJob.generated + ttsJob.failed}/{ttsJob.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--stint-border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--stint-primary)] transition-all duration-300"
                        style={{ width: `${ttsJob.total > 0 ? ((ttsJob.generated + ttsJob.failed) / ttsJob.total) * 100 : 0}%` }}
                      />
                    </div>
                    {ttsJob.failed > 0 && (
                      <p className="text-xs text-rose-500 mt-1">{ttsJob.failed} failed</p>
                    )}
                    <p className="text-[10px] text-[var(--stint-text-muted)] mt-1">Runs in background — you can close this panel.</p>
                  </div>
                )}
                {!ttsJob?.running && ttsJob && ttsJob.total > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Done! Generated {ttsJob.generated} audio files.
                    {ttsJob.failed > 0 && <span className="text-rose-600">({ttsJob.failed} failed)</span>}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={ttsJob?.running || (ttsStats?.missing === 0)}
                    onClick={startBulkTts}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                      ttsJob?.running
                        ? "bg-[var(--stint-border)] text-[var(--stint-text-muted)] cursor-wait"
                        : ttsStats?.missing === 0
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                          : "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)]"
                    )}
                  >
                    {ttsJob?.running ? (
                      <><Loader2 size={16} className="animate-spin" /> Generating...</>
                    ) : ttsStats?.missing === 0 ? (
                      <><CheckCircle2 size={16} /> All audio cached</>
                    ) : (
                      <><Volume2 size={16} /> Generate TTS for {ttsStats?.missing ?? '?'} items</>
                    )}
                  </button>
                  {ttsJob?.running && (
                    <button
                      type="button"
                      onClick={cancelTtsJob}
                      className="px-3 py-2 rounded-full text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50"
                    >
                      Cancel
                    </button>
                  )}
                  {!ttsJob?.running && ttsStats && ttsStats.cached > 0 && (
                    <button
                      type="button"
                      disabled={ttsDeleting}
                      onClick={deleteTtsCache}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
                        ttsDeleting
                          ? "border-[var(--stint-border)] text-[var(--stint-text-muted)] cursor-wait"
                          : "border-rose-200 text-rose-600 hover:bg-rose-50"
                      )}
                    >
                      {ttsDeleting ? (
                        <><Loader2 size={16} className="animate-spin" /> Deleting...</>
                      ) : (
                        <><Trash2 size={16} /> Delete all cached audio</>
                      )}
                    </button>
                  )}
                </div>
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
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--stint-text-muted)]">{termsList.length} item{termsList.length === 1 ? '' : 's'}</span>
                    {selectedTermIds.size > 0 && (
                      <button
                        type="button"
                        disabled={bulkDeleting}
                        onClick={bulkDeleteTerms}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
                      >
                        {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete {selectedTermIds.size} selected
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--stint-border)] overflow-hidden">
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--stint-bg)] sticky top-0">
                        <tr className="text-left">
                          <th className="px-3 py-2 w-10">
                            <input
                              type="checkbox"
                              checked={termsList.length > 0 && selectedTermIds.size === termsList.length}
                              onChange={toggleAllTerms}
                              className="rounded border-[var(--stint-border)]"
                              aria-label="Select all flashcards"
                            />
                          </th>
                          <th className="px-3 py-2">Term</th>
                          <th className="px-3 py-2">Definition</th>
                          <th className="px-3 py-2">Level</th>
                          <th className="px-3 py-2">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {termsList.map((t) => (
                          <tr
                            key={t.id}
                            className={cn(
                              "border-t border-[var(--stint-border)] cursor-pointer transition-colors",
                              selectedTermIds.has(t.id) ? "bg-rose-50" : "hover:bg-[var(--stint-bg)]"
                            )}
                            onClick={() => toggleTermId(t.id)}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedTermIds.has(t.id)}
                                onChange={() => toggleTermId(t.id)}
                                className="rounded border-[var(--stint-border)]"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium text-[var(--stint-primary)] max-w-[180px] truncate">{t.t}</td>
                            <td className="px-3 py-2 max-w-[280px] truncate">{t.d}</td>
                            <td className="px-3 py-2">{t.l}</td>
                            <td className="px-3 py-2 max-w-[180px] truncate">{t.c}</td>
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
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--stint-text-muted)]">{interviewList.length} item{interviewList.length === 1 ? '' : 's'}</span>
                    {selectedInterviewIds.size > 0 && (
                      <button
                        type="button"
                        disabled={bulkDeleting}
                        onClick={bulkDeleteInterview}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
                      >
                        {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete {selectedInterviewIds.size} selected
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--stint-border)] overflow-hidden">
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--stint-bg)] sticky top-0">
                        <tr className="text-left">
                          <th className="px-3 py-2 w-10">
                            <input
                              type="checkbox"
                              checked={interviewList.length > 0 && selectedInterviewIds.size === interviewList.length}
                              onChange={toggleAllInterview}
                              className="rounded border-[var(--stint-border)]"
                              aria-label="Select all Q&A"
                            />
                          </th>
                          <th className="px-3 py-2">Question</th>
                          <th className="px-3 py-2">Ideal Answer</th>
                          <th className="px-3 py-2">Role</th>
                          <th className="px-3 py-2">Company</th>
                          <th className="px-3 py-2">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interviewList.map((i) => (
                          <tr
                            key={i.id}
                            className={cn(
                              "border-t border-[var(--stint-border)] cursor-pointer transition-colors",
                              selectedInterviewIds.has(i.id) ? "bg-rose-50" : "hover:bg-[var(--stint-bg)]"
                            )}
                            onClick={() => toggleInterviewId(i.id)}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedInterviewIds.has(i.id)}
                                onChange={() => toggleInterviewId(i.id)}
                                className="rounded border-[var(--stint-border)]"
                              />
                            </td>
                            <td className="px-3 py-2 max-w-[220px] truncate">{i.question}</td>
                            <td className="px-3 py-2 max-w-[220px] truncate">{i.ideal_answer}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate">{i.role}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate">{i.company}</td>
                            <td className="px-3 py-2 max-w-[100px] truncate">{i.category ?? 'General'}</td>
                          </tr>
                        ))}
                        {interviewList.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-[var(--stint-text-muted)]">No interview Q&A uploaded.</td>
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
