import React from 'react';
import { Home, ChevronLeft, BookOpen, MessageSquare, BrainCircuit } from 'lucide-react';
import { cn } from '../lib/utils';

export type SectionId = 'home' | 'flashcards' | 'interview' | 'quiz';

export interface GlobalTopBarProps {
  sectionLabel: string;
  stepLabel?: string;
  showBack: boolean;
  onBack: () => void;
  onHome: () => void;
  /** Optional right-side content (e.g. admin gear + user avatar). */
  rightSlot?: React.ReactNode;
}

export function GlobalTopBar({ sectionLabel, stepLabel, showBack, onBack, onHome, rightSlot }: GlobalTopBarProps) {
  return (
    <header className="flex-shrink-0 w-full bg-white/95 backdrop-blur-sm border-b border-[var(--stint-border)] sticky top-0 z-20">
      <div className="max-w-2xl mx-auto px-4 h-12 md:h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={onHome}
            className="flex items-center flex-shrink-0 rounded-lg py-2 pr-2 -ml-1 text-[var(--stint-primary)] hover:bg-[var(--stint-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 transition-colors"
            aria-label="Go to Home"
          >
            <img src="/stint-logo.svg" alt="Stint Academy" className="h-6 md:h-7 w-auto" />
            <span className="ml-0.5 relative -top-px text-[15px] md:text-[17px] font-semibold leading-none tracking-tight text-[var(--stint-primary)]">
              Academy
            </span>
          </button>
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex-shrink-0 p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 transition-colors"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 flex justify-center">
          <span className="text-[13px] md:text-sm font-semibold text-[var(--stint-text)] truncate tracking-tight">
            {stepLabel ?? sectionLabel}
          </span>
        </div>
        <div className="w-10 flex-shrink-0 flex items-center justify-end min-w-[2.5rem]">
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
    'flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-0 flex-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-inset',
    active
      ? 'text-[var(--stint-primary)] bg-[var(--stint-primary)]/10 font-semibold'
      : 'text-[var(--stint-text-muted)] hover:bg-black/5 hover:text-[var(--stint-primary)]'
  );

export function GlobalBottomNav({ activeSection, onHome, onFlashcards, onInterview, onQuiz }: GlobalBottomNavProps) {
  return (
    <nav
      className="flex-shrink-0 w-full bg-white border-t border-[var(--stint-primary)]/10 safe-area-pb md:hidden"
      aria-label="Main navigation"
    >
      <div className="max-w-2xl mx-auto px-2 py-3 flex items-stretch gap-2">
        <button type="button" onClick={onHome} className={navItemClass(activeSection === 'home')} aria-current={activeSection === 'home' ? 'page' : undefined}>
          <Home size={22} strokeWidth={2} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button type="button" onClick={onFlashcards} className={navItemClass(activeSection === 'flashcards')} aria-current={activeSection === 'flashcards' ? 'page' : undefined}>
          <BookOpen size={22} strokeWidth={2} />
          <span className="text-[10px] font-medium">Flashcards</span>
        </button>
        <button type="button" onClick={onInterview} className={navItemClass(activeSection === 'interview')} aria-current={activeSection === 'interview' ? 'page' : undefined}>
          <MessageSquare size={22} strokeWidth={2} />
          <span className="text-[10px] font-medium">Interview</span>
        </button>
        <button type="button" onClick={onQuiz} className={navItemClass(activeSection === 'quiz')} aria-current={activeSection === 'quiz' ? 'page' : undefined}>
          <BrainCircuit size={22} strokeWidth={2} />
          <span className="text-[10px] font-medium">Quiz</span>
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
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--stint-bg)] text-[#1A1A1A] font-sans">
      <GlobalTopBar {...topBar} />
      <main className="flex-1 min-h-0 overflow-auto flex flex-col pb-20 md:pb-0">
        {children}
      </main>
      <GlobalBottomNav {...bottomNav} />
    </div>
  );
}
