import { describe, expect, it } from 'vitest';
import { alignReading, summarizeAzure, normalizeAudio } from '../../src/server/services/azureReading';
import { checkpointDue } from '../../src/server/services/readingQuota';

describe('Azure assessment normalization', () => {
  it('distinguishes repeated words, insertions, omissions and substitutions', () => {
    expect(alignReading('a database index improves performance', 'a index improves performance').omitted).toEqual(['database']);
    expect(alignReading('a database', 'a a database').inserted).toEqual(['a']);
    expect(alignReading('a fast database', 'a slow database').substituted).toEqual(['fast']);
    expect(alignReading('A database.', 'a database').completeness).toBe(100);
  });
  it('does not fabricate a score for silence', () => {
    expect(() => summarizeAzure([], 'hello', 'en-IN')).toThrow('No speech');
  });
  it('aggregates segments, retains sound feedback, excludes leading silence from pace', () => {
    const result = summarizeAzure([
      { Display: 'Hello', PronunciationAssessment: { AccuracyScore: 90, FluencyScore: 80 }, Words: [{ Word: 'hello', Offset: 50e7, Duration: 1e7, Phonemes: [{ Phoneme: 'h', PronunciationAssessment: { AccuracyScore: 90 } }] }] },
      { Display: 'world', PronunciationAssessment: { AccuracyScore: 70, FluencyScore: 60 }, Words: [{ Word: 'world', Offset: 54e7, Duration: 1e7 }] },
    ], 'hello world', 'en-IN');
    expect(result.scores).toEqual({ accuracy: 80, fluency: 70, completeness: 100, overall: 83 });
    expect(result.delivery.wpm).toBe(24);
    expect(result.delivery.long_pauses).toBe(1);
    expect(result.assessment.words[0].phonemes[0].accuracy).toBe(90);
  });
  it('rejects malformed audio before calling a provider', async () => {
    await expect(normalizeAudio('not audio!')).rejects.toThrow('Invalid');
  });
});
describe('monthly checkpoint policy', () => {
  it('selects baseline and every fifth later attempt', () => {
    expect(checkpointDue(0, 0, 60)).toBe(true);
    expect(checkpointDue(1, 60, 60)).toBe(false);
    expect(checkpointDue(5, 60, 60)).toBe(true);
  });
  it('never exceeds 1800 seconds and rounds reservations up', () => {
    expect(checkpointDue(5, 1790, 10)).toBe(true);
    expect(checkpointDue(5, 1790, 10.1)).toBe(false);
    expect(checkpointDue(0, 1800, 2)).toBe(false);
  });
});
