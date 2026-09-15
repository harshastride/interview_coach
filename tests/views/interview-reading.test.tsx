import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InterviewSession from '../../src/views/InterviewSession';

const mocks = vi.hoisted(() => ({
  start: vi.fn(), cancel: vi.fn(), analyze: vi.fn(), save: vi.fn(),
  complete: null as null | ((recording: any) => Promise<void>),
}));
vi.mock('../../src/hooks/useAnswerRecorder', () => ({
  MAX_RECORDING_SEC: 180,
  analyzeReading: mocks.analyze,
  saveReadingAttempt: mocks.save,
  useAnswerRecorder: (complete: typeof mocks.complete) => {
    mocks.complete = complete;
    return {
      isSupported: true, elapsedSec: 3, start: mocks.start, cancel: mocks.cancel,
      stop: () => mocks.complete?.({ blob: new Blob(['audio']), mimeType: 'audio/webm', durationSec: 3 }),
    };
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ handleLogout: vi.fn() }) }));
vi.mock('../../src/hooks/useTTS', () => ({
  useTTS: () => ({ isSpeaking: false, stopAudio: vi.fn(), speakAnswer: vi.fn(),
    speakTerm: (_text: string, _retry: number, done?: () => void) => done?.() }),
}));
vi.mock('../../src/components/GlobalNav', () => ({ AppLayout: ({ children }: any) => <>{children}</> }));
vi.mock('../../src/views/shared', () => ({ HeaderRightSlot: () => null, useBottomNav: () => ({}) }));
vi.mock('../../src/components/AdminPanel', () => ({ default: () => null }));
vi.mock('../../src/components/InterviewAvatar', () => ({ default: () => null }));
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: { div: ({ children, initial, animate, exit, transition, ...props }: any) => <div {...props}>{children}</div> },
}));

const answer = 'Read these words aloud while they appear.';
const result = {
  transcript: answer, scores: { overall: 85, accuracy: 90, fluency: 80, completeness: 100 },
  delivery: { wpm: 140, filler_count: 1, long_pauses: 0, pace: 'good', confidence_note: 'Steady delivery' },
  missed_words: [], strengths: [], improvements: [], coaching: 'Keep practising.',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(()=> 'blob:test'), revokeObjectURL: vi.fn()}));
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(undefined);
  mocks.analyze.mockResolvedValue(result);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getVideoTracks: () => [] }),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function begin() {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/interview/session', state: {
      selectedRole: 'Engineer', sessionQuestions: [
        { question: 'First question?', ideal_answer: answer, role: 'Engineer', company: 'Example' },
        { question: 'Second question?', ideal_answer: answer, role: 'Engineer', company: 'Example' },
      ],
    } }]}>
      <InterviewSession currentUser={null} uploadedInterviewRaw={[]} onContentRefresh={() => {}} />
    </MemoryRouter>,
  );
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Allow microphone' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Begin Interview/ })); });
}

describe('parallel answer reveal and automatic recording', () => {
  it('lets readers reveal the full answer without ending the recording', async () => {
    await begin();
    expect(screen.getByRole('button', { name: 'Auto-scroll on' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Show full answer' }));
    expect(screen.getByText(answer)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-scroll off' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Done — Get Coaching/ })).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('records before the answer finishes and analyzes only after Done', async () => {
    await begin();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(screen.queryByText(answer)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listen to Question' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Listen to Answer' })).toBeDisabled();
    for (let i = 0; i < answer.length; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    }
    expect(screen.getByText(answer)).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Done — Get Coaching/ })); });
    expect(mocks.analyze).toHaveBeenCalledWith(expect.anything(), answer, 'First question?', undefined);
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Your recorded transcript')).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it('does not automatically restart after cancellation, but starts for the next question', async () => {
    await begin();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.analyze).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next Question/ })); });
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('ignores metrics from a question the user has left', async () => {
    let resolve!: (value: typeof result) => void;
    mocks.analyze.mockReturnValue(new Promise((done) => { resolve = done; }));
    await begin();
    fireEvent.click(screen.getByRole('button', { name: /Done — Get Coaching/ }));
    expect(screen.getByText('Analyzing your reading...')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next Question/ })); });
    await act(async () => { resolve(result); });
    expect(screen.queryByText('Accuracy')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('offers a manual retry when microphone startup fails', async () => {
    mocks.start.mockRejectedValueOnce(new Error('Permission denied'));
    await begin();
    expect(screen.getByText(/Could not access the microphone/)).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Reading' })); });
    expect(screen.getByRole('button', { name: /Done — Get Coaching/ })).toBeInTheDocument();
  });
});

it('shows save failure and retries the same submission without another analysis', async () => {
  mocks.save.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await begin();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Done — Get Coaching/ })); });
  expect(screen.getByRole('button', { name: /Next Question/ })).toBeDisabled();
  const first = mocks.save.mock.calls[0][0];
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry saving report' })); });
  expect(mocks.save.mock.calls[1][0].submissionId).toBe(first.submissionId);
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Report saved to your reading history.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Next Question/ })).not.toBeDisabled();
});
