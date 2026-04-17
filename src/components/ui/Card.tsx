import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  variant?: 'surface' | 'interactive' | 'accent';
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const variants = {
  surface: 'rounded-2xl bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] shadow-[var(--stint-shadow-card)]',
  interactive: 'rounded-2xl bg-[var(--stint-bg-elevated)] border-2 border-[var(--stint-border)] hover:border-[var(--stint-primary)] shadow-[var(--stint-shadow-card)] hover:shadow-[var(--stint-shadow-card-hover)] cursor-pointer transition-all duration-200 hover:-translate-y-0.5',
  accent: 'rounded-2xl bg-gradient-to-br from-[var(--stint-primary)]/5 to-[var(--stint-primary)]/10 border border-[var(--stint-primary)]/20 shadow-lg shadow-[var(--stint-primary)]/5',
};

export default function Card({ variant = 'surface', children, className, onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cn(variants[variant], onClick && 'text-left w-full', className)}>
      {children}
    </Tag>
  );
}
