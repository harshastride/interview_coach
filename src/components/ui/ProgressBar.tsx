import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface ProgressBarProps {
  percent: number;
  size?: 'sm' | 'md';
  color?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const colorClasses = {
  primary: 'bg-gradient-to-r from-[var(--stint-primary)] to-[var(--stint-accent)]',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
};

export default function ProgressBar({ percent, size = 'md', color = 'primary', className }: ProgressBarProps) {
  return (
    <div className={cn('rounded-full bg-[var(--stint-border)] overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2', className)}>
      <motion.div
        className={cn('h-full rounded-full', colorClasses[color])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}
