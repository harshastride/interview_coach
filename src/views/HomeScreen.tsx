import PracticeAssignments from '../components/PracticeAssignments';
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, MessageSquare, BrainCircuit, Flame, Search, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import type { AuthUser } from '../hooks/useAuth';
import type { InterviewEntry } from '../constants';
import { HeaderRightSlot, useBottomNav } from './shared';
import { useAuth } from '../hooks/useAuth';
import { useStreaks } from '../hooks/useStudyAPI';
import Card from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import ReadingDashboard from '../components/ReadingDashboard';

interface HomeScreenProps {
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
  uploadedTermsRaw: { id?: number; t: string; d: string; l: number; c: string }[];
  uploadedInterviewRaw: InterviewEntry[];
}

export default function HomeScreen({ currentUser, onContentRefresh, uploadedTermsRaw, uploadedInterviewRaw }: HomeScreenProps) {
  const navigate = useNavigate();
  const { handleLogout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const { streakData } = useStreaks();

  const bottomNavProps = useBottomNav('home');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const allCats = [...new Set(uploadedTermsRaw.map((t) => t.c))];
    navigate('/flashcards/study', { state: { selectedCategories: allCats, selectedLevel: null, searchQuery: searchQuery.trim() } });
  };

  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => {}}
    />
  );

  const topBar: GlobalTopBarProps = {
    sectionLabel: 'Home',
    stepLabel: '',
    showBack: false,
    onBack: () => {},
    onHome: () => navigate('/'),
    rightSlot: headerRightSlot,
  };

  const dailyGoal = 20;
  const todayCards = streakData?.today_cards ?? 0;
  const todayQuiz = streakData?.today_quiz ?? 0;
  const todayTotal = todayCards + todayQuiz;
  const goalPercent = Math.min(100, Math.round((todayTotal / dailyGoal) * 100));
  const totalFlashcards = uploadedTermsRaw.length;
  const totalInterviewQs = uploadedInterviewRaw.length;
  const totalCategories = new Set(uploadedTermsRaw.map((t) => t.c)).size;

  return (
    <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-8 space-y-6 md:space-y-8">

        {/* ── Welcome + Search Row ─────────────────────── */}
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-[13px] font-medium text-[var(--stint-text-muted)] mb-1">Good to see you again</p>
            <h1 className="break-words text-2xl md:text-[32px] font-bold text-[var(--stint-text)] tracking-tight leading-tight">
              Welcome back, <span className="text-[var(--stint-primary)]">{currentUser?.name?.split(' ')[0] || 'there'}</span>
            </h1>
            <p className="text-[13px] text-[var(--stint-text-muted)] mt-2">
              {totalFlashcards > 0
                ? `${totalFlashcards} flashcards across ${totalCategories} topics ready to study`
                : 'Start your data engineering journey'}
            </p>
          </motion.div>

          <form onSubmit={handleSearch} className="w-full xl:w-72 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--stint-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search flashcards..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] text-sm text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)]/30 focus:border-[var(--stint-primary)] transition-all"
              />
            </div>
          </form>
        </div>


        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm"><Flame size={18} className="text-orange-500" /><strong>{streakData?.current_streak ?? 0}</strong> day streak</div>
          <div className="min-w-[160px] flex-1"><div className="mb-1 flex justify-between gap-2 text-xs"><span>Cards &amp; quiz goal</span><span>{todayTotal}/{dailyGoal}</span></div><ProgressBar percent={goalPercent} color="primary" /></div>
          <span className="text-xs text-[var(--stint-text-muted)]">{todayCards} cards · {todayQuiz} quiz answers</span>
        </div>

        {/* ── Quick Actions ───────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-4">
          {[
            { icon: MessageSquare, label: 'Reading Practice', desc: `${totalInterviewQs} passages · Read, review, repeat`, path: '/interview', color: 'bg-teal-600', delay: 0 },
            { icon: BookOpen, label: 'Flashcards', desc: `${totalFlashcards} cards · ${totalCategories} topics`, path: '/flashcards', color: 'bg-blue-500', delay: 0 },
            { icon: BrainCircuit, label: 'Quiz', desc: 'Test your knowledge', path: '/quiz', color: 'bg-emerald-500', delay: 0.1 },
          ].map((item) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: item.delay, duration: 0.3 }}
            >
              <Card variant="interactive" onClick={() => navigate(item.path)} className={cn('p-4 h-full group', item.path === '/interview' && 'ring-1 ring-teal-500/50 bg-teal-500/5')}>
                <div className="flex items-center gap-3">
                  <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-lg', item.color)}>
                    <item.icon size={22} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[15px] font-semibold text-[var(--stint-text)] group-hover:text-[var(--stint-primary)] transition-colors">{item.label}</h2>
                    <p className="text-[12px] text-[var(--stint-text-muted)] mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight size={18} className="text-[var(--stint-text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {currentUser?.role === "viewer" && <PracticeAssignments compact key={currentUser.id} passages={uploadedInterviewRaw} />}
        <ReadingDashboard passages={uploadedInterviewRaw} />

        {/* ── Topic Overview ──────────────────────────── */}
        {totalCategories > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--stint-text-muted)]">Topics</h3>
              <button onClick={() => navigate('/flashcards')} className="text-xs font-semibold text-[var(--stint-primary)] hover:underline">
                View all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...new Set(uploadedTermsRaw.map((t) => t.c))].slice(0, 12).map((cat) => {
                const count = uploadedTermsRaw.filter((t) => t.c === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => navigate('/flashcards/study', { state: { selectedCategories: [cat], selectedLevel: null } })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] text-xs font-medium text-[var(--stint-text)] hover:border-[var(--stint-primary)] hover:text-[var(--stint-primary)] transition-all"
                  >
                    {cat}
                    <span className="font-mono text-[10px] text-[var(--stint-text-muted)]">{count}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
