import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import { useAuth } from '../hooks/useAuth';
import type { InterviewEntry } from '../constants';
import { HeaderRightSlot, useBottomNav } from './shared';

interface InterviewSetupProps {
  uploadedInterviewRaw: InterviewEntry[];
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
}

export default function InterviewSetup({ uploadedInterviewRaw, currentUser, onContentRefresh }: InterviewSetupProps) {
  const navigate = useNavigate();
  const { handleLogout } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [selectedInterviewCategories, setSelectedInterviewCategories] = useState<string[]>([]);
  const [useRandomInterview, setUseRandomInterview] = useState(false);
  const [candidateName, setCandidateName] = useState('Candidate');

  const mergedInterviewBank = useMemo(() => uploadedInterviewRaw, [uploadedInterviewRaw]);
  const interviewRoles = useMemo(() => [...new Set(mergedInterviewBank.map((e) => e.role))], [mergedInterviewBank]);
  const interviewCategories = useMemo(() => [...new Set(mergedInterviewBank.map((e) => e.category ?? 'General'))].sort(), [mergedInterviewBank]);

  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    if (interviewRoles.length > 0 && (selectedRole === null || !interviewRoles.includes(selectedRole)))
      setSelectedRole(interviewRoles[0]);
  }, [interviewRoles, selectedRole]);

  const canStart = useRandomInterview || selectedInterviewCategories.length > 0;

  const startInterview = () => {
    if (!canStart) return;
    const pool = useRandomInterview
      ? [...mergedInterviewBank]
      : mergedInterviewBank.filter((e) => selectedInterviewCategories.includes(e.category ?? 'General'));
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const ten = shuffled.slice(0, 10);
    if (ten.length === 0) return;
    const role = ten[0]?.role ?? '';
    navigate('/interview/session', {
      state: {
        sessionQuestions: ten,
        selectedRole: role,
        candidateName,
      },
    });
  };

  const bottomNavProps = useBottomNav('interview');

  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => setShowAdminPanel(true)}
    />
  );

  const topBar: GlobalTopBarProps = {
    sectionLabel: 'Interview Practice',
    stepLabel: 'Setup',
    showBack: true,
    onBack: () => navigate('/'),
    onHome: () => navigate('/'),
    rightSlot: headerRightSlot,
  };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-6">
          <p className="text-xs text-[var(--stint-text-muted)]">Choose topics or Random. You'll get up to 10 questions per session.</p>
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">Random</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useRandomInterview}
                onChange={(e) => setUseRandomInterview(e.target.checked)}
                className="rounded border-[var(--stint-border)]"
              />
              <span className="text-sm font-medium">10 random questions from all topics</span>
            </label>
          </section>
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-2">Topics (categories)</h2>
            <p className="text-xs text-[var(--stint-text-muted)] mb-2">If Random is off, select one or more topics. Up to 10 questions will be picked from selected topics.</p>
            <div className="flex flex-wrap gap-2">
              {interviewCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedInterviewCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])}
                  disabled={useRandomInterview}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium border transition-all disabled:opacity-50",
                    selectedInterviewCategories.includes(cat) ? "bg-[var(--stint-primary)] text-white border-[var(--stint-primary)]" : "bg-[var(--stint-bg-elevated)] border-[var(--stint-border)] hover:border-[var(--stint-primary)]"
                  )}
                >
                  {cat}
                </button>
              ))}
              {interviewCategories.length === 0 && (
                <span className="text-sm text-[var(--stint-text-muted)]">No categories yet. Add Q&A with categories in Admin.</span>
              )}
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
              className="w-full px-4 py-3 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)]"
            />
          </section>
          <div className="pt-4">
            <button
              disabled={!canStart}
              onClick={startInterview}
              className={cn(
                "w-full py-4 rounded-full font-bold text-base transition-all shadow-xl",
                canStart ? "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)]" : "bg-[var(--stint-border)] text-[var(--stint-text-muted)] cursor-not-allowed opacity-50"
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
