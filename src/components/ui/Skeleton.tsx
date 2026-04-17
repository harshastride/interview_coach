import React from 'react';
import { cn } from '../../lib/utils';

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-xl bg-[var(--stint-border)]/50', className)} />
  );
}
