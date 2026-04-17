import React from 'react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconColor?: string;
  className?: string;
}

export default function StatCard({ icon, value, label, iconColor = 'text-[var(--stint-primary)]', className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] p-4 flex items-center gap-3', className)}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconColor.replace('text-', 'bg-').replace(/\]$/, ']/10]'))}>
        <div className={iconColor}>{icon}</div>
      </div>
      <div className="min-w-0">
        <div className="font-mono text-xl font-bold text-[var(--stint-text)] tabular-nums leading-none">{value}</div>
        <div className="text-xs text-[var(--stint-text-muted)] mt-0.5">{label}</div>
      </div>
    </div>
  );
}
