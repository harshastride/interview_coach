import React, { useState } from 'react';
import { Settings, LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import type { GlobalBottomNavProps, SectionId } from '../components/GlobalNav';

/* ------------------------------------------------------------------ */
/*  Utility functions                                                  */
/* ------------------------------------------------------------------ */

export function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[()/]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'term';
}

export function uniqueId(term: string, seen: Set<string>): string {
  let id = slug(term);
  let c = 0;
  while (seen.has(id)) id = `${slug(term)}-${++c}`;
  seen.add(id);
  return id;
}

const FETCH_HEADERS: Record<string, string> = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

/**
 * Convenience wrapper around `fetch` that always includes credentials
 * and the required X-Requested-With header.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...FETCH_HEADERS,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  HeaderRightSlot                                                    */
/* ------------------------------------------------------------------ */

export interface HeaderRightSlotProps {
  currentUser: AuthUser | null;
  canUpload: boolean;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

export function HeaderRightSlot({ currentUser, canUpload, onLogout, onOpenAdmin }: HeaderRightSlotProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isDark, toggleDark } = useDarkMode();

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={toggleDark}
        className="p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] transition-colors"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
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
          <div className="absolute right-0 top-full mt-2 z-40 w-56 rounded-2xl bg-[var(--stint-bg-elevated)] shadow-xl border border-[var(--stint-border)] overflow-hidden" role="menu">
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
                onClick={() => { setShowUserMenu(false); onOpenAdmin(); }}
              >
                <Settings size={16} className="text-[var(--stint-text-muted)]" />
                Admin Panel
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors border-t border-[var(--stint-border)]"
              onClick={() => { setShowUserMenu(false); onLogout(); }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  useViewNav — common bottom-nav + header-right helpers              */
/* ------------------------------------------------------------------ */

export function useBottomNav(activeSection: SectionId): GlobalBottomNavProps {
  const navigate = useNavigate();
  return {
    activeSection,
    onHome: () => navigate('/'),
    onFlashcards: () => navigate('/flashcards'),
    onInterview: () => navigate('/interview'),
    onQuiz: () => navigate('/quiz'),
  };
}
