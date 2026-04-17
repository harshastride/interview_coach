import React from 'react';
import Logo from '../components/Logo';

export default function LoginScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--stint-bg)] via-[var(--stint-bg)] to-[var(--stint-primary)]/5 p-4 relative overflow-hidden">
      {/* Decorative background circles */}
      <div className="absolute top-1/4 -left-20 w-64 h-64 rounded-full bg-[var(--stint-primary)]/5 blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-48 h-48 rounded-full bg-[var(--stint-accent)]/5 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--stint-bg-card)] border border-[var(--stint-border)] shadow-[var(--stint-shadow-card)] p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="mb-4">
          <Logo size="lg" />
        </div>

        {/* Tagline */}
        <h1 className="font-serif text-xl font-bold text-[var(--stint-text)] mb-1 text-center">
          Master Data Engineering
        </h1>
        <p className="text-sm text-[var(--stint-text-muted)] mb-8 text-center">
          Azure · Snowflake · dbt interview prep
        </p>

        {/* Google sign in */}
        <a
          href="/auth/google"
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--stint-primary)] text-white font-semibold hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg shadow-[var(--stint-primary)]/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" opacity=".8"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".9"/></svg>
          Continue with Google
        </a>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-[var(--stint-text-muted)]">
        Flashcards · Quizzes · Interview Practice
      </p>
    </div>
  );
}
