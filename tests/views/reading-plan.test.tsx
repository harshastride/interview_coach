import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { buildReadingPlan } from '../../src/components/ReadingPracticePlan';
import ReadingNextStep from '../../src/components/ReadingNextStep';
const passages = [{ id: 1, question: 'Allowed', ideal_answer: 'Read this.', role: 'Python', company: 'Practice', category: 'Python' }];
it('recommends only an accessible stable passage ID and counts India-calendar readings', () => {
  const result = buildReadingPlan([
    { id: 3, content_id: 2, created_at: '2026-09-13T01:00:00Z' },
    { id: 2, content_id: 1, created_at: '2026-09-12T18:31:00Z' },
    { id: 1, content_id: 1, created_at: '2026-09-12T18:29:00Z' },
  ] as any, passages, new Date('2026-09-13T05:00:00Z'));
  expect(result.today).toBe(2);
  expect(result.passage?.id).toBe(1);
  expect(result.last?.id).toBe(2);
  expect(buildReadingPlan([], [], new Date()).passage).toBeUndefined();
});
it('limits the exercise, allows word rehearsal and invokes explicit repeat', () => {
  const listen = vi.fn(), repeat = vi.fn();
  render(<ReadingNextStep feedback={{ improvements: ['Pause between phrases', 'Finish sentences', 'More advice'], missed_words: ['queue', 'queue', 'schema', 'index', 'fourth'] }} onListen={listen} onRepeat={repeat} />);
  expect(screen.queryByText('More advice')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Listen to queue' }));
  expect(listen).toHaveBeenCalledWith('queue');
  fireEvent.click(screen.getByRole('checkbox', { name: 'queue' }));
  expect(screen.getByText('1 of 3 words rehearsed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Read this passage again' }));
  expect(repeat).toHaveBeenCalledOnce();
});
