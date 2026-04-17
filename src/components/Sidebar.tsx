import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BookOpen, BrainCircuit, MessageSquare, Moon, Sun, LogOut, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AuthUser } from '../hooks/useAuth';
import Logo from './Logo';

interface SidebarProps {
  currentUser: AuthUser | null;
  canUpload: boolean;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'flashcards', label: 'Flashcards', icon: BookOpen, path: '/flashcards' },
  { id: 'quiz', label: 'Quiz', icon: BrainCircuit, path: '/quiz' },
  { id: 'interview', label: 'Interview', icon: MessageSquare, path: '/interview' },
];

function getActiveId(pathname: string): string {
  if (pathname.startsWith('/flashcards')) return 'flashcards';
  if (pathname.startsWith('/quiz')) return 'quiz';
  if (pathname.startsWith('/interview')) return 'interview';
  return 'home';
}

export default function Sidebar({ currentUser, canUpload, onLogout, onOpenAdmin }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = getActiveId(location.pathname);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('stint-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    try { localStorage.setItem('stint-sidebar-collapsed', String(collapsed)); }
    catch {}
  }, [collapsed]);

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark((d) => !d);
    try { localStorage.setItem('stint-dark', document.documentElement.classList.contains('dark') ? '1' : '0'); }
    catch {}
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col fixed left-0 top-0 h-screen z-30 bg-[var(--stint-bg-elevated)] border-r border-[var(--stint-border)] transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-[var(--stint-border)] shrink-0">
        <Logo size={collapsed ? 'sm' : 'md'} showText={!collapsed} onClick={() => navigate('/')} />
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-[var(--stint-primary)]/10 text-[var(--stint-primary)] font-semibold shadow-sm'
                  : 'text-[var(--stint-text-muted)] hover:text-[var(--stint-text)] hover:bg-[var(--stint-bg)]',
                collapsed && 'justify-center px-0',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {/* Admin link */}
        {canUpload && (
          <>
            <div className="my-3 mx-3 border-t border-[var(--stint-border)]" />
            <button
              onClick={onOpenAdmin}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--stint-text-muted)] hover:text-[var(--stint-text)] hover:bg-[var(--stint-bg)] transition-colors',
                collapsed && 'justify-center px-0',
              )}
              title={collapsed ? 'Admin Panel' : undefined}
            >
              <Settings size={20} className="shrink-0" />
              {!collapsed && <span>Admin Panel</span>}
            </button>
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-[var(--stint-border)] p-2 space-y-1 shrink-0">
        {/* Dark mode */}
        <button
          onClick={toggleDark}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--stint-text-muted)] hover:text-[var(--stint-text)] hover:bg-[var(--stint-bg)] transition-colors',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
        >
          {isDark ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
          {!collapsed && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        {/* User */}
        {currentUser && (
          <div className={cn('flex items-center gap-3 px-3 py-2', collapsed && 'justify-center px-0')}>
            {currentUser.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--stint-primary)]/10 text-[var(--stint-primary)] flex items-center justify-center text-sm font-bold shrink-0">
                {currentUser.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--stint-text)] truncate">{currentUser.name}</p>
                <p className="text-[10px] text-[var(--stint-text-muted)] truncate">{currentUser.email}</p>
              </div>
            )}
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={onLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--stint-text-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center py-2 text-[var(--stint-text-muted)] hover:text-[var(--stint-text)] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
