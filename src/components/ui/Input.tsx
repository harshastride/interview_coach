import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-widest text-[var(--stint-text-muted)] mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-4 py-3 rounded-xl border bg-[var(--stint-bg-elevated)] text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] transition-all',
          error
            ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400'
            : 'border-[var(--stint-border)] focus:ring-2 focus:ring-[var(--stint-primary)]/30 focus:border-[var(--stint-primary)]',
          'focus:outline-none',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}
