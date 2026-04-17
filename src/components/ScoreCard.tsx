import React from 'react';
import { cn } from '../lib/utils';
import type { EvaluationResult } from '../hooks/useSTT';

interface ScoreCardProps extends EvaluationResult {
  userAnswer: string;
}

function scoreColor(score: number) {
  if (score >= 80) return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', ring: 'stroke-emerald-500' };
  if (score >= 50) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', ring: 'stroke-amber-500' };
  return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500', ring: 'stroke-red-500' };
}

function ScoreRing({ score }: { score: number }) {
  const colors = scoreColor(score);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-20 h-20">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-[var(--stint-border)]" />
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="6" strokeLinecap="round" className={colors.ring} strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-xl font-bold', colors.text)}>{score}</span>
      </div>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const colors = scoreColor(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[var(--stint-text)] w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--stint-border)] overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', colors.bg)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn('text-xs font-bold w-8 text-right tabular-nums', colors.text)}>{value}%</span>
    </div>
  );
}

export default function ScoreCard({
  overall_score, accuracy, fluency, completeness,
  missed_words, strengths, improvements, coaching, userAnswer,
}: ScoreCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-sm overflow-hidden">
      {/* Score + dimensions */}
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={overall_score} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--stint-text)]">Reading Score</p>
            <p className="text-xs text-[var(--stint-text-muted)]">
              {overall_score >= 80 ? 'Excellent reading!' : overall_score >= 50 ? 'Good effort, keep practicing' : 'Needs more practice'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <DimensionBar label="Accuracy" value={accuracy} />
          <DimensionBar label="Fluency" value={fluency} />
          <DimensionBar label="Completeness" value={completeness} />
        </div>
      </div>

      {/* Missed words */}
      {missed_words.length > 0 && (
        <div className="px-5 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Missed / Mispronounced</p>
          <div className="flex flex-wrap gap-1.5">
            {missed_words.map((w, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 font-medium">{w}</span>
            ))}
          </div>
        </div>
      )}

      {/* Coaching */}
      {coaching && (
        <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-[var(--stint-primary)]/5 border border-[var(--stint-primary)]/15">
          <p className="text-sm text-[var(--stint-text)]">{coaching}</p>
        </div>
      )}

      {/* Strengths & Improvements */}
      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Good</p>
              {strengths.map((s, i) => (
                <p key={i} className="text-xs text-[var(--stint-text)] flex gap-1.5"><span className="text-emerald-500 shrink-0">+</span> {s}</p>
              ))}
            </div>
          )}
          {improvements.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Improve</p>
              {improvements.map((s, i) => (
                <p key={i} className="text-xs text-[var(--stint-text)] flex gap-1.5"><span className="text-amber-500 shrink-0">-</span> {s}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* What you said */}
      {userAnswer && (
        <div className="px-5 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-text-muted)] mb-1">What You Said</p>
          <p className="text-xs text-[var(--stint-text-muted)] whitespace-pre-wrap bg-[var(--stint-bg)] rounded-xl px-3 py-2 border border-[var(--stint-border)]">{userAnswer}</p>
        </div>
      )}
    </div>
  );
}
