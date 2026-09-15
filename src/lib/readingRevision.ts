import type { InterviewEntry } from '../constants';
import type { Attempt } from '../components/ReadingReport';
export type RevisionItem = {
  passage: InterviewEntry;
  attempt?: Attempt;
  words: string[];
  focus: string[];
  kind: 'words' | 'feedback' | 'new' | 'refresh';
  reason: string;
};
export function buildRevisionQueue(attempts: Attempt[], passages: InterviewEntry[]): RevisionItem[] {
  const latest = new Map<number, Attempt>();
  for (const attempt of [...attempts].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id)) {
    if (attempt.content_id && !latest.has(attempt.content_id)) latest.set(attempt.content_id, attempt);
  }
  const seen = new Set<number>();
  const result: RevisionItem[] = [];
  for (const passage of passages) {
    if (!passage.id || seen.has(passage.id)) continue;
    seen.add(passage.id);
    const attempt = latest.get(passage.id);
    const vocabulary = new Set((passage.ideal_answer.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []));
    const words: string[] = [], wordKeys = new Set<string>();
    for (const value of attempt?.feedback?.missed_words ?? []) {
      const word = value.trim(), key = word.toLowerCase();
      // Do not carry stale or unrelated flagged text into the current passage.
      if (vocabulary.has(key) && !wordKeys.has(key)) { words.push(word); wordKeys.add(key); }
    }
    const focus = (attempt?.feedback?.improvements ?? []).filter(text=>text.trim()).slice(0,2);
    const kind = words.length ? 'words' : focus.length ? 'feedback' : !attempt ? 'new' : 'refresh';
    const reason = kind === 'words' ? `${words.length} word${words.length===1?'':'s'} flagged in your latest saved reading.` : kind === 'feedback' ? 'Apply feedback from your latest saved reading.' : kind === 'new' ? 'No saved reading for this passage in your latest 50 attempts.' : 'Revisit a previously read passage at your own pace.';
    result.push({passage,attempt,words,focus,kind,reason});
  }
  const rank = {words:0,feedback:1,new:2,refresh:3};
  return result.sort((a,b)=>rank[a.kind]-rank[b.kind] || (a.attempt ? Date.parse(a.attempt.created_at) : 0)-(b.attempt ? Date.parse(b.attempt.created_at) : 0) || a.passage.id!-b.passage.id!);
}
