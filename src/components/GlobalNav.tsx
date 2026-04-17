import React from 'react';
import { Home, ChevronLeft, BookOpen, MessageSquare, BrainCircuit } from 'lucide-react';
import { cn } from '../lib/utils';
import Logo from './Logo';

export type SectionId = 'home' | 'flashcards' | 'interview' | 'quiz';

export interface GlobalTopBarProps {
  sectionLabel: string;
  stepLabel?: string;
  showBack: boolean;
  onBack: () => void;
  onHome: () => void;
  rightSlot?: React.ReactNode;
}

export function GlobalTopBar({ sectionLabel, stepLabel, showBack, onBack, onHome, rightSlot }: GlobalTopBarProps) {
  const hasStep = stepLabel && stepLabel !== sectionLabel && stepLabel !== '';
  return (
    <header className="flex-shrink-0 w-full bg-[var(--stint-bg-elevated)] border-b border-[var(--stint-border)] sticky top-0 z-20">
      <div className="px-4 md:px-6 h-14 flex items-center gap-3">
        {/* Mobile: Logo */}
        <div className="md:hidden shrink-0">
          <Logo size="sm" onClick={onHome} />
        </div>

        {/* Desktop: Page title area */}
        <div className="hidden md:flex items-center gap-3 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 w-8 h-8 rounded-xl border border-[var(--stint-border)] flex items-center justify-center text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-text)] hover:border-[var(--stint-primary)]/30 transition-all"
              aria-label="Back"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          )}
          {sectionLabel !== 'Home' && (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[15px] font-semibold text-[var(--stint-text)] tracking-tight">{sectionLabel}</h1>
              {hasStep && (
                <>
                  <span className="text-[var(--stint-border)] text-xs">/</span>
                  <span className="text-[13px] text-[var(--stint-text-muted)] truncate">{stepLabel}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mobile: back + center label */}
        {showBack && (
          <button type="button" onClick={onBack} className="shrink-0 md:hidden text-[var(--stint-text-muted)]" aria-label="Back">
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        )}
        <div className="flex-1 min-w-0 flex justify-center md:hidden">
          <span className="text-[13px] font-semibold text-[var(--stint-text)] truncate">{stepLabel || sectionLabel}</span>
        </div>

        <div className="hidden md:block flex-1" />

        {/* Mobile: right slot */}
        <div className="shrink-0 flex items-center gap-2 md:hidden">
          {rightSlot ?? <span aria-hidden />}
        </div>
      </div>
    </header>
  );
}

export interface GlobalBottomNavProps {
  activeSection: SectionId;
  onHome: () => void;
  onFlashcards: () => void;
  onInterview: () => void;
  onQuiz: () => void;
}

const navItemClass = (active: boolean) =>
  cn(
    'flex flex-col items-center justify-center gap-0.5 py-2.5 px-4 min-w-0 flex-1 rounded-xl transition-all active:scale-95',
    active
      ? 'text-[var(--stint-primary)] bg-[var(--stint-primary)]/10 font-semibold'
      : 'text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)]'
  );

export function GlobalBottomNav({ activeSection, onHome, onFlashcards, onInterview, onQuiz }: GlobalBottomNavProps) {
  return (
    <nav
      className="flex-shrink-0 w-full bg-[var(--stint-bg-elevated)] border-t border-[var(--stint-border)] safe-area-pb md:hidden"
      aria-label="Main navigation"
    >
      <div className="max-w-md mx-auto px-2 py-2 flex items-stretch gap-1">
        <button type="button" onClick={onHome} className={navItemClass(activeSection === 'home')} aria-current={activeSection === 'home' ? 'page' : undefined}>
          {activeSection === 'home' && <div className="w-1 h-1 rounded-full bg-[var(--stint-primary)] mb-0.5" />}
          <Home size={24} strokeWidth={1.8} />
          <span className="text-[11px] font-medium">Home</span>
        </button>
        <button type="button" onClick={onFlashcards} className={navItemClass(activeSection === 'flashcards')} aria-current={activeSection === 'flashcards' ? 'page' : undefined}>
          {activeSection === 'flashcards' && <div className="w-1 h-1 rounded-full bg-[var(--stint-primary)] mb-0.5" />}
          <BookOpen size={24} strokeWidth={1.8} />
          <span className="text-[11px] font-medium">Flashcards</span>
        </button>
        <button type="button" onClick={onInterview} className={navItemClass(activeSection === 'interview')} aria-current={activeSection === 'interview' ? 'page' : undefined}>
          {activeSection === 'interview' && <div className="w-1 h-1 rounded-full bg-[var(--stint-primary)] mb-0.5" />}
          <MessageSquare size={24} strokeWidth={1.8} />
          <span className="text-[11px] font-medium">Interview</span>
        </button>
        <button type="button" onClick={onQuiz} className={navItemClass(activeSection === 'quiz')} aria-current={activeSection === 'quiz' ? 'page' : undefined}>
          {activeSection === 'quiz' && <div className="w-1 h-1 rounded-full bg-[var(--stint-primary)] mb-0.5" />}
          <BrainCircuit size={24} strokeWidth={1.8} />
          <span className="text-[11px] font-medium">Quiz</span>
        </button>
      </div>
    </nav>
  );
}

export interface AppLayoutProps {
  children: React.ReactNode;
  topBar: GlobalTopBarProps;
  bottomNav: GlobalBottomNavProps;
}

export function AppLayout({ children, topBar, bottomNav }: AppLayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--stint-bg)] text-[var(--stint-text)] font-sans md:ml-60">
      <GlobalTopBar {...topBar} />
      <main className="flex-1 min-h-0 overflow-auto flex flex-col pb-20 md:pb-0">
        {children}
      </main>
      <GlobalBottomNav {...bottomNav} />
    </div>
  );
}
