import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_SEC, useAnswerRecorder } from '../../src/hooks/useAnswerRecorder';

class FakeRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded audio']) });
    this.onstop?.();
  }
}
const track = { readyState: 'live', stop: vi.fn() };
const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.clearAllMocks();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('answer recorder lifecycle', () => {
  it('records until Done and leaves a borrowed microphone stream open', async () => {
    const complete = vi.fn();
    const { result } = renderHook(() => useAnswerRecorder(complete));
    await act(async () => { await result.current.start(stream as unknown as MediaStream); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(complete).not.toHaveBeenCalled();
    act(() => { result.current.stop(); });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 3 }));
    expect(track.stop).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('submits exactly once at the maximum duration', async () => {
    const complete = vi.fn();
    const { result } = renderHook(() => useAnswerRecorder(complete));
    await act(async () => { await result.current.start(); });
    act(() => { vi.advanceTimersByTime(MAX_RECORDING_SEC * 1000); });
    expect(complete).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    act(() => { result.current.stop(); });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('discards cancellation without later submitting at the time limit', async () => {
    const complete = vi.fn();
    const { result } = renderHook(() => useAnswerRecorder(complete));
    await act(async () => { await result.current.start(); });
    act(() => { result.current.cancel(); vi.advanceTimersByTime(MAX_RECORDING_SEC * 1000); });
    expect(complete).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(result.current.isRecording).toBe(false);
  });

  it('releases a microphone granted after cancellation', async () => {
    let grant!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const complete = vi.fn();
    const { result } = renderHook(() => useAnswerRecorder(complete));
    let pending!: Promise<void>;
    act(() => { pending = result.current.start(); });
    act(() => { result.current.cancel(); });
    await act(async () => { grant(stream); await pending; });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(result.current.isRecording).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });
});
