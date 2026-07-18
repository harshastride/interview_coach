import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, MessageSquare, BrainCircuit, Flame, Target, Search, ChevronRight, Layers, X } from 'lucide-react';
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

interface HomeScreenProps {
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
  uploadedTermsRaw: { t: string; d: string; l: number; c: string }[];
  uploadedInterviewRaw: InterviewEntry[];
}

const GROUP_DEFS = [
  {
    key: 'azure',
    label: 'Azure Services',
    match: (c: string) => c.toLowerCase().startsWith('azure'),
  },
  {
    key: 'data',
    label: 'Data & Analytics',
    match: (c: string) => /^(data |microsoft |advanced)/i.test(c),
  },
  {
    key: 'engineering',
    label: 'Engineering & Tools',
    match: (c: string) => /^(spark|orchestr|devops)/i.test(c),
  },
];

function getGroups(allTopics: string[]) {
  const placed = new Set<string>();
  const groups: { label: string; subtopics: string[] }[] = [];

  for (const def of GROUP_DEFS) {
    const matched = allTopics.filter((c) => def.match(c) && !placed.has(c));
    matched.forEach((c) => placed.add(c));
    if (matched.length > 0) {
      groups.push({ label: def.label, subtopics: matched });
    }
  }

  const others = allTopics.filter((c) => !placed.has(c));
  if (others.length > 0) {
    groups.push({ label: 'Other Topics', subtopics: others });
  }

  return groups;
}

export default function HomeScreen({ currentUser, onContentRefresh, uploadedTermsRaw, uploadedInterviewRaw }: HomeScreenProps) {
  const navigate = useNavigate();
  const { handleLogout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const { streakData } = useStreaks();

  const bottomNavProps = useBottomNav('home');

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { mainTopics: [], subtopics: [] };

    const allTopics = [...new Set(uploadedTermsRaw.map((t) => t.c))];
    const groups = getGroups(allTopics);

    const matchedMainTopics: { label: string; subtopics: string[] }[] = [];
    const matchedSubtopics = new Set<string>();
    
    // Helper for matching: 1-letter uses startsWith, otherwise includes
    const isMatch = (text: string, q: string) => {
      if (q.length === 1) return text.toLowerCase().startsWith(q);
      return text.toLowerCase().includes(q);
    };

    for (const group of groups) {
      const matchesMainTopic = isMatch(group.label, query);
      const matchingSubs = group.subtopics.filter(sub => isMatch(sub, query));
      
      if (matchesMainTopic) {
        matchedMainTopics.push({ label: group.label, subtopics: group.subtopics });
        group.subtopics.forEach(sub => matchedSubtopics.add(sub));
      } else if (matchingSubs.length > 0) {
        matchingSubs.forEach(sub => matchedSubtopics.add(sub));
      }
    }

    return {
      mainTopics: matchedMainTopics,
      subtopics: Array.from(matchedSubtopics)
    };
  }, [searchQuery, uploadedTermsRaw]);

  const handleSuggestionClick = (text: string, categories: string[]) => {
    setSearchQuery(text);
    setIsFocused(false);
    navigate('/flashcards/study', { state: { selectedCategories: categories, selectedLevel: null, searchQuery: "" } });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    
    const allTopics = [...new Set(uploadedTermsRaw.map((t) => t.c))];
    const groups = getGroups(allTopics);
    
    let matchedCategories = new Set<string>();
    let isMainTopicMatch = false;

    // 1. Check Main Topics and Subtopics
    for (const group of groups) {
      if (group.label.toLowerCase().includes(query)) {
        isMainTopicMatch = true;
        group.subtopics.forEach(c => matchedCategories.add(c));
      } else {
        group.subtopics.forEach(c => {
          if (c.toLowerCase().includes(query)) matchedCategories.add(c);
        });
      }
    }

    // 2. Check Flashcards (terms and definitions)
    const flashcardMatches = uploadedTermsRaw.filter(t => 
      t.t.toLowerCase().includes(query) || t.d.toLowerCase().includes(query)
    );

    if (matchedCategories.size > 0 || flashcardMatches.length > 0) {
      if (isMainTopicMatch) {
        navigate('/flashcards/study', { state: { selectedCategories: Array.from(matchedCategories), selectedLevel: null, searchQuery: "" } });
      } else {
        navigate('/flashcards/study', { state: { selectedCategories: allTopics, selectedLevel: null, searchQuery: query } });
      }
    } else {
      setShowToast(true);
    }
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
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-8 space-y-6 md:space-y-8 relative">
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: -20, x: 20 }}
              className="fixed top-20 right-4 md:right-6 z-50 bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] text-[var(--stint-text)] px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              <span className="text-sm font-medium">Currently, this content is not available.</span>
              <button 
                onClick={() => setShowToast(false)} 
                className="text-[var(--stint-text-muted)] hover:text-[var(--stint-text)] transition-colors p-1"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Welcome + Search Row ─────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-[13px] font-medium text-[var(--stint-text-muted)] mb-1">Good to see you again</p>
            <h1 className="text-2xl md:text-[32px] font-bold text-[var(--stint-text)] tracking-tight leading-tight">
              Welcome back, <span className="text-[var(--stint-primary)]">{currentUser?.name?.split(' ')[0] || 'there'}</span>
            </h1>
            <p className="text-[13px] text-[var(--stint-text-muted)] mt-2">
              {totalFlashcards > 0
                ? `${totalFlashcards} flashcards across ${totalCategories} topics ready to study`
                : 'Start your data engineering journey'}
            </p>
          </motion.div>

          <form onSubmit={handleSearch} className="w-full md:w-72 shrink-0">
            <div className="relative" ref={searchContainerRef}>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--stint-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIsFocused(true); }}
                onFocus={() => setIsFocused(true)}
                placeholder="Search topics or terms..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] text-sm text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)]/30 focus:border-[var(--stint-primary)] transition-all"
              />
              <AnimatePresence>
                {isFocused && searchQuery.trim() && (suggestions.mainTopics.length > 0 || suggestions.subtopics.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute top-full left-0 right-0 mt-2 z-50 bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[60vh] overflow-y-auto"
                  >
                    {suggestions.mainTopics.length > 0 && (
                      <div className="px-3 py-2 border-b border-[var(--stint-border)] last:border-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--stint-text-muted)] mb-1 pl-2">
                          Main Topics
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {suggestions.mainTopics.map(main => (
                            <button 
                              key={`main-${main.label}`}
                              type="button"
                              onClick={() => handleSuggestionClick(main.label, main.subtopics)}
                              className="w-full text-left pl-3 pr-3 py-2 rounded-lg text-sm text-[var(--stint-primary)] font-medium hover:bg-[var(--stint-primary)]/10 transition-colors"
                            >
                              {main.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {suggestions.subtopics.length > 0 && (
                      <div className="px-3 py-2 border-b border-[var(--stint-border)] last:border-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--stint-text-muted)] mb-1 pl-2">
                          Subtopics
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {suggestions.subtopics.map(sub => (
                            <button
                              key={`sub-${sub}`}
                              type="button"
                              onClick={() => handleSuggestionClick(sub, [sub])}
                              className="w-full text-left pl-3 pr-3 py-2 rounded-lg text-sm text-[var(--stint-text)] hover:bg-[var(--stint-primary)]/10 hover:text-[var(--stint-primary)] transition-colors"
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </form>
        </div>

        {/* ── Quick Actions ───────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            { icon: BookOpen, label: 'Flashcards', desc: `${totalFlashcards} cards · ${totalCategories} topics`, path: '/flashcards', color: 'bg-blue-500', delay: 0 },
            { icon: MessageSquare, label: 'Interview Practice', desc: `${totalInterviewQs} practice questions`, path: '/interview', color: 'bg-violet-500', delay: 0.05 },
            { icon: BrainCircuit, label: 'Quiz Mode', desc: 'Test your knowledge', path: '/quiz', color: 'bg-emerald-500', delay: 0.1 },
          ].map((item) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: item.delay, duration: 0.3 }}
            >
              <Card variant="interactive" onClick={() => navigate(item.path)} className="p-5 group">
                <div className="flex items-center gap-4">
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

        {/* ── Stats Row ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {/* Streak */}
          <Card variant="surface" className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                (streakData?.current_streak ?? 0) > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-[var(--stint-bg)]',
              )}>
                <Flame size={20} className={cn(
                  (streakData?.current_streak ?? 0) > 0 ? 'text-orange-500 flame-animate' : 'text-[var(--stint-text-muted)]',
                )} />
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-[var(--stint-text)] tabular-nums leading-none">
                  {streakData?.current_streak ?? 0}
                </div>
                <div className="text-[11px] text-[var(--stint-text-muted)] mt-0.5">day streak</div>
              </div>
            </div>
          </Card>

          {/* Today's Progress */}
          <Card variant="surface" className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                goalPercent >= 100 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-[var(--stint-bg)]',
              )}>
                <Target size={20} className={goalPercent >= 100 ? 'text-emerald-500' : 'text-[var(--stint-text-muted)]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xl font-bold text-[var(--stint-text)] tabular-nums leading-none">
                  {todayTotal}/{dailyGoal}
                </div>
                <div className="text-[11px] text-[var(--stint-text-muted)] mt-0.5">today</div>
              </div>
            </div>
          </Card>

          {/* Total Cards */}
          <Card variant="surface" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--stint-primary)]/10 flex items-center justify-center">
                <Layers size={20} className="text-[var(--stint-primary)]" />
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-[var(--stint-text)] tabular-nums leading-none">{totalFlashcards}</div>
                <div className="text-[11px] text-[var(--stint-text-muted)] mt-0.5">flashcards</div>
              </div>
            </div>
          </Card>

          {/* Interview Qs */}
          <Card variant="surface" className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <MessageSquare size={20} className="text-violet-500" />
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-[var(--stint-text)] tabular-nums leading-none">{totalInterviewQs}</div>
                <div className="text-[11px] text-[var(--stint-text-muted)] mt-0.5">interview Qs</div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ── Daily Goal Progress ─────────────────────── */}
        {streakData && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card variant="accent" className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--stint-text)]">Daily Goal</h3>
                  <p className="text-xs text-[var(--stint-text-muted)]">
                    {goalPercent >= 100 ? 'Goal reached! Keep going!' : `${dailyGoal - todayTotal} more to reach your daily goal`}
                  </p>
                </div>
                <span className={cn(
                  'font-mono text-sm font-bold tabular-nums',
                  goalPercent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--stint-primary)]',
                )}>
                  {goalPercent}%
                </span>
              </div>
              <ProgressBar percent={goalPercent} color={goalPercent >= 100 ? 'success' : 'primary'} />
              <div className="flex justify-between mt-2 text-[11px] text-[var(--stint-text-muted)]">
                <span>{todayCards} cards studied</span>
                <span>{todayQuiz} quiz answers</span>
              </div>
            </Card>
          </motion.div>
        )}

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
