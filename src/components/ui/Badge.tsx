import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-[var(--stint-primary)]/10 text-[var(--stint-primary)]',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  neutral: 'bg-[var(--stint-bg)] text-[var(--stint-text-muted)]',
};

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  );
}
