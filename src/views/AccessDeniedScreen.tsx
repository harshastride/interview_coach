import React, { useState } from 'react';
import { LogOut, Clock, CheckCircle, ShieldAlert } from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';

interface AccessDeniedScreenProps {
  user: AuthUser | null;
  onLogout: () => void;
  onEnter?: () => void;
}

export default function AccessDeniedScreen({ user, onLogout, onEnter }: AccessDeniedScreenProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(user?.requestStatus === 'pending');
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
      .then((r) => {
        if (r.ok) {
          setSent(true);
        }
      })
      .finally(() => setLoading(false));
  };

  const isApproved = !!user?.isAllowed;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)] p-4">
      <div className="w-full max-w-md rounded-3xl bg-[var(--stint-bg-card)] border border-[var(--stint-border)] shadow-lg p-8 flex flex-col">
        {!sent ? (
          <>
            <p className="text-sm uppercase tracking-widest font-semibold text-[var(--stint-primary)] mb-1">Access denied</p>
            <p className="text-[var(--stint-text)] font-medium mb-1">{user?.email}</p>
            <p className="text-sm text-[var(--stint-text-muted)] mb-6">Your account is not on the access list. Contact an administrator.</p>
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
          </>
        ) : (
          <div className="flex flex-col mb-6">
            {isApproved ? (
              <>
                <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs uppercase tracking-wider mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Approved & Live
                </div>
                <h3 className="text-xl font-bold text-[var(--stint-text)] mb-2">Your access request has been approved!</h3>
                <p className="text-sm text-[var(--stint-text-muted)] mb-6">
                  Congratulations, {name || user?.name || 'Candidate'}! Access has been granted. Click the button below to enter Stint Academy.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Under review
                </div>
                <h3 className="text-xl font-bold text-[var(--stint-text)] mb-2">Your access request is being reviewed</h3>
                <p className="text-sm text-[var(--stint-text-muted)] mb-6">
                  Thanks, {name || user?.name || 'Candidate'}! Our team is verifying your request. We'll grant access the moment you're approved.
                </p>
              </>
            )}
            
            <div className="border border-[var(--stint-border)] rounded-2xl p-4 bg-[var(--stint-bg)]/50 space-y-4 mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--stint-text-muted)]">Review Status</p>
              
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle size={12} className="stroke-[3]" />
                  </div>
                  <div className="w-0.5 h-6 bg-emerald-200"></div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--stint-text)]">Request submitted</p>
                  <p className="text-xs text-[var(--stint-text-muted)]">Your access request was successfully sent</p>
                </div>
              </div>

              {isApproved ? (
                <>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <CheckCircle size={12} className="stroke-[3]" />
                      </div>
                      <div className="w-0.5 h-6 bg-emerald-200"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--stint-text)]">Admin verification</p>
                      <p className="text-xs text-[var(--stint-text-muted)]">An administrator has verified your details</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <CheckCircle size={12} className="stroke-[3]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--stint-text)]">Approved & live</p>
                      <p className="text-xs text-[var(--stint-text-muted)]">Access granted to the interview coach</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                        <Clock size={12} className="stroke-[3]" />
                      </div>
                      <div className="w-0.5 h-6 bg-gray-200"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--stint-text)]">Admin verification</p>
                      <p className="text-xs text-[var(--stint-text-muted)]">An administrator is reviewing your details</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs font-bold">○</div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--stint-text-muted)]">Approved & live</p>
                      <p className="text-xs text-[var(--stint-text-muted)]">Access granted to the interview coach</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {isApproved ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs">
                <CheckCircle size={14} className="flex-shrink-0 text-emerald-600" />
                <span>Access granted! Welcome to Stint Academy.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs">
                <ShieldAlert size={14} className="flex-shrink-0" />
                <span>We'll alert you here as soon as a decision is made.</span>
              </div>
            )}
          </div>
        )}

        {isApproved && onEnter && (
          <button
            type="button"
            onClick={onEnter}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors shadow-sm mb-2"
          >
            Enter Stint Academy
          </button>
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
