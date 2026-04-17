import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import { useAuth } from '../hooks/useAuth';
import { HeaderRightSlot, useBottomNav } from './shared';

export type HomeChoice = 'flashcards' | 'quiz';

interface FlashcardSetupProps {
  uploadedTermsRaw: { t: string; d: string; l: number; c: string }[];
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
  homeChoice?: HomeChoice;
}

/* ── Smart grouping config ────────────────────────────── */
interface GroupDef {
  key: string;
  label: string;
  icon: string;       // emoji
  gradient: string;   // tailwind gradient for the group header card
  match: (cat: string) => boolean;
}

const GROUP_DEFS: GroupDef[] = [
  {
    key: 'azure',
    label: 'Azure Services',
    icon: '\u2601\uFE0F',
    gradient: 'from-blue-500 to-cyan-500',
    match: (c) => c.toLowerCase().startsWith('azure'),
  },
  {
    key: 'data',
    label: 'Data & Analytics',
    icon: '\uD83D\uDCCA',
    gradient: 'from-violet-500 to-purple-500',
    match: (c) => /^(data |microsoft |advanced)/i.test(c),
  },
  {
    key: 'engineering',
    label: 'Engineering & Tools',
    icon: '\u2699\uFE0F',
    gradient: 'from-amber-500 to-orange-500',
    match: (c) => /^(spark|orchestr|devops)/i.test(c),
  },
];

function autoGroup(categories: string[]): { def: GroupDef; categories: string[] }[] {
  const placed = new Set<string>();
  const groups: { def: GroupDef; categories: string[] }[] = [];

  for (const def of GROUP_DEFS) {
    const matched = categories.filter((c) => def.match(c) && !placed.has(c));
    matched.forEach((c) => placed.add(c));
    if (matched.length > 0) groups.push({ def, categories: matched });
  }

  const remaining = categories.filter((c) => !placed.has(c));
  if (remaining.length > 0) {
    groups.push({
      def: { key: 'other', label: 'Other Topics', icon: '\uD83D\uDCDA', gradient: 'from-slate-500 to-gray-500', match: () => true },
      categories: remaining,
    });
  }

  return groups;
}

export default function FlashcardSetup({ uploadedTermsRaw, currentUser, onContentRefresh, homeChoice = 'flashcards' }: FlashcardSetupProps) {
  const navigate = useNavigate();
  const { handleLogout } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const activeSection = homeChoice === 'flashcards' ? 'flashcards' as const : 'quiz' as const;
  const bottomNavProps = useBottomNav(activeSection);

  /* Card counts per category */
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const x of uploadedTermsRaw) {
      const cat = String(x.c ?? '').trim();
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [uploadedTermsRaw]);

  const allCategories = useMemo(() => Object.keys(countsByCategory).sort(), [countsByCategory]);

  const groups = useMemo(() => autoGroup(allCategories), [allCategories]);

  const totalCards = useMemo(() => Object.values(countsByCategory).reduce((a, b) => a + b, 0), [countsByCategory]);

  const matchesSearch = (cat: string) =>
    !searchQuery || cat.toLowerCase().includes(searchQuery.toLowerCase());

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );

  const toggleGroup = (categories: string[]) => {
    const visible = categories.filter(matchesSearch);
    const allSelected = visible.every((c) => selectedCategories.includes(c));
    if (allSelected) {
      const remove = new Set(visible);
      setSelectedCategories((prev) => prev.filter((c) => !remove.has(c)));
    } else {
      setSelectedCategories((prev) => {
        const set = new Set(prev);
        visible.forEach((c) => set.add(c));
        return [...set];
      });
    }
  };

  const startPractice = () => {
    if (selectedCategories.length === 0) return;
    const studyPath = homeChoice === 'flashcards' ? '/flashcards/study' : '/quiz/study';
    navigate(studyPath, { state: { selectedCategories, selectedLevel: null } });
  };

  const totalSelectedCards = selectedCategories.reduce(
    (sum, cat) => sum + (countsByCategory[cat] || 0), 0,
  );

  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => setShowAdminPanel(true)}
    />
  );

  const sectionLabel = homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz';
  const topBar: GlobalTopBarProps = {
    sectionLabel,
    stepLabel: 'Select topics',
    showBack: true,
    onBack: () => navigate('/'),
    onHome: () => navigate('/'),
    rightSlot: headerRightSlot,
  };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 py-5 space-y-4">

          {/* ── Header area: search + quick actions ──────── */}
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--stint-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)]/30 focus:border-[var(--stint-primary)] transition-all"
              />
            </div>

            {/* Quick actions row */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategories([...allCategories])}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-[var(--stint-primary)]/40 text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/5 hover:border-[var(--stint-primary)] transition-all"
              >
                Select All ({totalCards} cards)
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategories([])}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-[var(--stint-border)] text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] transition-all"
              >
                Clear Selection
              </button>
            </div>
          </div>

          {/* ── Selection summary (sticky-ish) ────────────── */}
          {selectedCategories.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[var(--stint-primary)]/10 to-[var(--stint-primary)]/5 border border-[var(--stint-primary)]/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--stint-primary)] flex items-center justify-center text-white text-xs font-bold">
                  {selectedCategories.length}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--stint-text)]">
                    {selectedCategories.length} topic{selectedCategories.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-xs text-[var(--stint-text-muted)]">{totalSelectedCards} flashcards ready</div>
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="w-16 h-1.5 rounded-full bg-[var(--stint-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--stint-primary)] transition-all duration-300"
                  style={{ width: `${Math.round((selectedCategories.length / allCategories.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Topic groups ──────────────────────────────── */}
          {groups.map(({ def, categories }) => {
            const filtered = categories.filter(matchesSearch);
            if (filtered.length === 0) return null;

            const selectedInGroup = filtered.filter((c) => selectedCategories.includes(c)).length;
            const allGroupSelected = selectedInGroup === filtered.length;
            const groupCardCount = filtered.reduce((s, c) => s + (countsByCategory[c] || 0), 0);

            return (
              <section key={def.key} className="space-y-2">
                {/* Group header — clickable to toggle entire group */}
                <button
                  type="button"
                  onClick={() => toggleGroup(categories)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] hover:shadow-md transition-all group"
                >
                  {/* Icon circle */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-lg shrink-0 shadow-sm',
                    def.gradient,
                  )}>
                    {def.icon}
                  </div>
                  {/* Title + meta */}
                  <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-[var(--stint-text)]">{def.label}</div>
                    <div className="text-xs text-[var(--stint-text-muted)]">
                      {filtered.length} topics · {groupCardCount} cards
                    </div>
                  </div>
                  {/* Group checkbox */}
                  <div className={cn(
                    'w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                    allGroupSelected
                      ? 'bg-[var(--stint-primary)] border-[var(--stint-primary)]'
                      : selectedInGroup > 0
                        ? 'border-[var(--stint-primary)] bg-[var(--stint-primary)]/20'
                        : 'border-[var(--stint-border)] group-hover:border-[var(--stint-accent)]',
                  )}>
                    {allGroupSelected && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {!allGroupSelected && selectedInGroup > 0 && (
                      <div className="w-2.5 h-0.5 rounded-full bg-[var(--stint-primary)]" />
                    )}
                  </div>
                </button>

                {/* Individual topic cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-2">
                  {filtered.map((cat) => {
                    const isSelected = selectedCategories.includes(cat);
                    const count = countsByCategory[cat] || 0;
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={cn(
                          'relative flex flex-col items-start px-3 py-2.5 rounded-xl text-left transition-all border overflow-hidden',
                          isSelected
                            ? 'bg-[var(--stint-primary)]/8 border-[var(--stint-primary)] shadow-sm'
                            : 'bg-[var(--stint-bg-elevated)] border-[var(--stint-border)] hover:border-[var(--stint-accent)] hover:shadow-sm',
                        )}
                      >
                        {/* Selected indicator dot */}
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <div className="w-4 h-4 rounded-full bg-[var(--stint-primary)] flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                        {/* Topic name */}
                        <span className={cn(
                          'text-xs font-semibold leading-tight pr-5',
                          isSelected ? 'text-[var(--stint-primary)]' : 'text-[var(--stint-text)]',
                        )}>
                          {cat}
                        </span>
                        {/* Card count */}
                        <span className="text-[10px] text-[var(--stint-text-muted)] mt-1">
                          {count} card{count !== 1 ? 's' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {allCategories.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm font-medium text-[var(--stint-text)]">No topics yet</p>
              <p className="text-xs text-[var(--stint-text-muted)] mt-1">
                Admin can upload flashcard CSV from the Admin Panel.
              </p>
            </div>
          )}

          {/* ── Sticky start button ───────────────────────── */}
          <div className="pt-2 pb-4">
            <button
              disabled={selectedCategories.length === 0}
              onClick={startPractice}
              className={cn(
                'w-full py-4 rounded-2xl font-bold text-base transition-all',
                selectedCategories.length > 0
                  ? 'bg-[var(--stint-primary)] text-white shadow-xl shadow-[var(--stint-primary)]/25 hover:shadow-2xl hover:shadow-[var(--stint-primary)]/30 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-[var(--stint-border)] text-[var(--stint-text-muted)] cursor-not-allowed opacity-50',
              )}
            >
              {selectedCategories.length > 0
                ? `${homeChoice === 'flashcards' ? 'Start Flashcards' : 'Start Quiz'} (${totalSelectedCards} cards)`
                : 'Select topics to begin'}
            </button>
          </div>
        </div>
      </AppLayout>
    </>
  );
}
