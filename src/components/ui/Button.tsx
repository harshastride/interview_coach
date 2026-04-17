import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pill?: boolean;
}

const variantClasses = {
  primary: 'bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] font-semibold shadow-lg shadow-[var(--stint-primary)]/20 hover:shadow-xl hover:shadow-[var(--stint-primary)]/25 hover:-translate-y-0.5 active:translate-y-0',
  secondary: 'bg-[var(--stint-bg-elevated)] border-2 border-[var(--stint-border)] text-[var(--stint-text)] hover:border-[var(--stint-primary)] hover:text-[var(--stint-primary)] font-semibold',
  ghost: 'text-[var(--stint-text-muted)] hover:text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/5',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 font-semibold shadow-lg shadow-rose-500/20',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-6 py-3.5 text-base',
};

export default function Button({
  variant = 'primary', size = 'md', pill = false,
  className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all duration-150',
        pill ? 'rounded-full' : 'rounded-xl',
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
