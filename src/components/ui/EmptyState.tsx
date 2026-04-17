import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--stint-primary)]/10 text-[var(--stint-primary)] flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-serif text-xl font-bold text-[var(--stint-text)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--stint-text-muted)] max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 rounded-xl bg-[var(--stint-primary)] text-white font-semibold text-sm hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg shadow-[var(--stint-primary)]/20"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
