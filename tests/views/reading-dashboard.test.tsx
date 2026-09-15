import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReadingDashboard from '../../src/components/ReadingDashboard';
import { apiGet } from '../../src/lib/api';
vi.mock('../../src/lib/api', () => ({ apiGet: vi.fn() }));
const get = vi.mocked(apiGet);
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const mount = () => render(<MemoryRouter><ReadingDashboard /></MemoryRouter>);
it('shows loading then an honest empty state', async () => {
  get.mockResolvedValue({ attempts: [] });
  mount();
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(await screen.findByText('Your first reading starts the story')).toBeInTheDocument();
  expect(screen.queryByText('Your transcript')).not.toBeInTheDocument();
});
it('recovers from a failed history request', async () => {
  get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ attempts: [] });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Your first reading starts the story')).toBeInTheDocument();
});
it('limits home to three reports with direct links, preserving zero scores', async () => {
  get.mockResolvedValue({ attempts: [1, 2, 3, 4].map(id => ({ id, question_ref: `Question ${id}`, created_at: '2026-09-13T00:00:00Z', overall_score: 0, wpm: null })) });
  mount();
  expect(await screen.findByText('Question 1')).toBeInTheDocument();
  expect(screen.queryByText('Question 4')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Question 1/ })).toHaveAttribute('href', '/reading/reports/1');
  expect(screen.getByText('0/100')).toBeInTheDocument();
});
