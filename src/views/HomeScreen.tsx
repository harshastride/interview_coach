import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, MessageSquare, BrainCircuit, Flame, Target, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import type { InterviewEntry } from '../constants';
import { HeaderRightSlot, useBottomNav } from './shared';
import { useAuth } from '../hooks/useAuth';
import { useStreaks } from '../hooks/useStudyAPI';

interface HomeScreenProps {
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
  uploadedTermsRaw: { t: string; d: string; l: number; c: string }[];
  uploadedInterviewRaw: InterviewEntry[];
}

export default function HomeScreen({ currentUser, onContentRefresh, uploadedTermsRaw, uploadedInterviewRaw }: HomeScreenProps) {
  const navigate = useNavigate();
  const { handleLogout } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const { streakData } = useStreaks();

  const bottomNavProps = useBottomNav('home');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Navigate to flashcards with search filter
    const allCats = [...new Set(uploadedTermsRaw.map((t) => t.c))];
    navigate('/flashcards/study', { state: { selectedCategories: allCats, selectedLevel: null, searchQuery: searchQuery.trim() } });
  };

  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => setShowAdminPanel(true)}
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

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col items-center">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-1 text-center text-[18px] font-semibold tracking-tight text-[var(--stint-primary)]"
          >
            Interview Coach
          </motion.p>
          <p className="text-xs text-[var(--stint-text-muted)] font-medium mb-4">
            Choose how you want to practice
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="w-full max-w-md mb-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--stint-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search flashcards..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] text-sm text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent transition-all"
              />
            </div>
          </form>

          {/* Streak & Daily Goal Card */}
          {streakData && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md mb-4 p-4 rounded-2xl bg-[var(--stint-bg-card)] border border-[var(--stint-border)] shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-xl",
                    streakData.current_streak > 0 ? "bg-orange-100 dark:bg-orange-900/30 text-orange-500" : "bg-[var(--stint-bg)] text-[var(--stint-text-muted)]"
                  )}>
                    <Flame size={22} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--stint-text)] leading-none">{streakData.current_streak}</p>
                    <p className="text-xs text-[var(--stint-text-muted)]">day streak</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-lg font-bold text-[var(--stint-text)] leading-none">{todayTotal}</p>
                    <p className="text-xs text-[var(--stint-text-muted)]">today</p>
                  </div>
                  <div className={cn(
                    "p-2 rounded-xl",
                    goalPercent >= 100 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500" : "bg-[var(--stint-bg)] text-[var(--stint-text-muted)]"
                  )}>
                    <Target size={22} />
                  </div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[var(--stint-bg)] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    goalPercent >= 100 ? "bg-emerald-500" : "bg-[var(--stint-primary)]"
                  )}
                  style={{ width: `${goalPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--stint-text-muted)] mt-1 text-right">
                {goalPercent >= 100 ? 'Daily goal reached!' : `${todayTotal}/${dailyGoal} daily goal`}
              </p>
            </motion.div>
          )}

          <div className="w-full flex flex-col gap-4 max-w-md">
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => navigate('/flashcards')}
              className="w-full p-6 rounded-3xl bg-[var(--stint-bg-card)] border-2 border-[var(--stint-border)] hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
            >
              <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
                <BookOpen size={28} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--stint-primary)]">Flashcards</h2>
                <p className="text-sm text-[var(--stint-text-muted)]">Flip cards to learn terms and definitions</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => navigate('/interview')}
              className="w-full p-6 rounded-3xl bg-[var(--stint-bg-card)] border-2 border-[var(--stint-border)] hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
            >
              <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
                <MessageSquare size={28} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--stint-primary)]">Interview Practice</h2>
                <p className="text-sm text-[var(--stint-text-muted)]">Q &amp; A for practice flow for the interview</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => navigate('/quiz')}
              className="w-full p-6 rounded-3xl bg-[var(--stint-bg-card)] border-2 border-[var(--stint-border)] hover:border-[var(--stint-primary)] shadow-sm flex items-center gap-4 text-left transition-all hover:shadow-md"
            >
              <div className="p-3 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]">
                <BrainCircuit size={28} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--stint-primary)]">Quiz</h2>
                <p className="text-sm text-[var(--stint-text-muted)]">Multiple choice and voice answer</p>
              </div>
            </motion.button>
          </div>
        </div>
      </AppLayout>
    </>
  );
}
