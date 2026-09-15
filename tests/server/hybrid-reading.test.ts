import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/server/services/azureReading', async () => {
  const original = await vi.importActual('../../src/server/services/azureReading');
  return { ...original, normalizeAudio: vi.fn().mockResolvedValue({ pcm: Buffer.from('audio'), duration: 60 }), assessAzure: vi.fn() };
});
vi.mock('../../src/server/services/readingQuota', () => ({ reserveReading: vi.fn() }));
vi.mock('../../src/server/db/pool', () => ({ pgPool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
import { hybridReading } from '../../src/server/services/hybridReading';
import { assessAzure } from '../../src/server/services/azureReading';
import { reserveReading } from '../../src/server/services/readingQuota';
const input = { audio: 'YXVkaW8=', mimeType: 'audio/webm', referenceText: 'hello world', question: 'Read this' };
const local = { transcript: 'hello world', scores: { overall: 80, accuracy: 80, fluency: 80, completeness: 100 }, delivery: { wpm: 120, long_pauses: 0, filler_count: 0, pace: 'good', confidence_note: '' }, missed_words: [], strengths: [], improvements: [], coaching: 'Practise again.' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AZURE_SPEECH_KEY', 'test-only'); vi.stubEnv('AZURE_SPEECH_REGION', 'centralindia'); vi.stubEnv('ANALYSIS_URL', 'http://local'); vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => local }));
  vi.mocked(reserveReading).mockResolvedValue({ id: 1, azure: false, cached: null });
});
import { afterEach } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('does not send audio to Azure during regular practice', async () => {
  const result = await hybridReading(42, input);
  expect(assessAzure).not.toHaveBeenCalled();
  expect(result.assessment.provider).toBe('local');
  expect(result.local_metrics.scores).toEqual(local.scores);
});
it('labels local fallback when the Azure checkpoint fails', async () => {
  vi.mocked(reserveReading).mockResolvedValue({ id: 1, azure: true, cached: null });
  vi.mocked(assessAzure).mockRejectedValue(new Error('unavailable'));
  const result = await hybridReading(42, input);
  expect(result.assessment.provider).toBe('local');
  expect(result.assessment.notice).toContain('unavailable');
});
it('does not consume allowance when no speech was detected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...local, transcript: '' }) }));
  await expect(hybridReading(42, input)).rejects.toThrow('No speech');
  expect(reserveReading).not.toHaveBeenCalled();
});
it('reports missing setup explicitly', async () => {
  vi.stubEnv('AZURE_SPEECH_KEY', '');
  await expect(hybridReading(42, input)).rejects.toThrow('setup is incomplete');
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects unsupported Foundry regions before consuming allowance', async () => {
  vi.stubEnv('AZURE_SPEECH_REGION', 'southindia');
  await expect(hybridReading(42, input)).rejects.toThrow('does not support Speech');
  expect(fetch).not.toHaveBeenCalled();
  expect(reserveReading).not.toHaveBeenCalled();
});
