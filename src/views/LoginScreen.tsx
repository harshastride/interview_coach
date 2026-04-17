import React from 'react';

export default function LoginScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--stint-bg)] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--stint-bg-card)] border border-[var(--stint-border)] shadow-lg p-8 flex flex-col items-center">
        <div className="mb-3 flex items-center">
          <img src="/stint-logo.svg" alt="Stint Academy" className="h-10 w-auto" />
          <span className="ml-0.5 relative -top-px text-[22px] font-semibold leading-none tracking-tight text-[var(--stint-primary)]">
            Academy
          </span>
        </div>
        <p className="text-sm text-[var(--stint-text-muted)] mb-6">Sign in to continue</p>
        <a
          href="/auth/google"
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          Continue with Google
        </a>
      </div>
    </div>
  );
}
