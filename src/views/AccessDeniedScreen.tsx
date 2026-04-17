import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';

interface AccessDeniedScreenProps {
  user: AuthUser | null;
  onLogout: () => void;
}

export default function AccessDeniedScreen({ user, onLogout }: AccessDeniedScreenProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    fetch('/api/access-request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ name: name.trim(), reason: reason.trim() || undefined }),
    })
      .then((r) => { if (r.ok) setSent(true); })
      .finally(() => setLoading(false));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)] p-4">
      <div className="w-full max-w-md rounded-3xl bg-[var(--stint-bg-card)] border border-[var(--stint-border)] shadow-lg p-8 flex flex-col">
        <p className="text-sm uppercase tracking-widest font-semibold text-[var(--stint-primary)] mb-1">Access denied</p>
        <p className="text-[var(--stint-text)] font-medium mb-1">{user?.email}</p>
        <p className="text-sm text-[var(--stint-text-muted)] mb-6">Your account is not on the access list. Contact an administrator.</p>
        {!sent ? (
          <form onSubmit={handleRequest} className="space-y-3 mb-6">
            <label htmlFor="access-name" className="block text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider">Your name</label>
            <input
              id="access-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-[var(--stint-border)] focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent"
              placeholder="Name"
            />
            <label htmlFor="access-reason" className="block text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider">Reason for access</label>
            <textarea
              id="access-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 rounded-xl border border-[var(--stint-border)] focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent"
              placeholder="Optional"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Sending\u2026' : 'Send Request'}
            </button>
          </form>
        ) : (
          <p className="text-emerald-600 font-medium mb-6">Request sent! An admin will review it.</p>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
