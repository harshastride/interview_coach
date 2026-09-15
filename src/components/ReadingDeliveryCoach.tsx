import React, { useState } from 'react';
import { buildDeliveryCoaching, phraseChunks, type DeliveryCoachingPlan } from '../lib/readingCoaching';
import type { ReadingAnalysis } from '../hooks/useAnswerRecorder';

export default function ReadingDeliveryCoach({ feedback, reference, onListen, onRepeat }: {
  feedback: Partial<ReadingAnalysis>; reference?: string;
  onListen?: (sentence: string) => void; onRepeat?: () => void;
}) {
  const plan: DeliveryCoachingPlan | undefined = feedback.delivery_coaching ?? buildDeliveryCoaching(reference ?? '');
  const [guidance, setGuidance] = useState(true);
  const [emphasis, setEmphasis] = useState<number[]>([]);
  const [rehearsed, setRehearsed] = useState(false);
  const tips = (feedback.improvements ?? []).filter(Boolean).slice(0, 2);
  let wordIndex = 0;
  return <section aria-label="Natural delivery coach" className="min-w-0 space-y-4 rounded-xl border border-[var(--stint-primary)]/20 bg-[var(--stint-primary)]/5 p-4">
    <div><p className="text-xs font-semibold text-[var(--stint-primary)]">Your speaking coach</p><h3 className="mt-1 text-base font-semibold">Make your answer sound like an explanation</h3><p className="mt-2 text-sm">Think about what you want the interviewer to understand. Keep the answer visible and speak to that person, one idea at a time.</p></div>
    {!!feedback.strengths?.length && <div><h4 className="text-sm font-semibold">Keep doing this</h4><p className="mt-1 text-sm">{feedback.strengths[0]}</p></div>}
    {!!tips.length && <div><h4 className="text-sm font-semibold">Focus on these changes</h4><ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{tips.map((tip,i)=><li key={i}>{tip}</li>)}</ul></div>}
    {feedback.coaching && <p className="text-sm leading-relaxed">{feedback.coaching}</p>}
    {plan ? <>
      <div className="space-y-3 rounded-lg bg-[var(--stint-bg-card)] p-3">
        <h4 className="text-sm font-semibold">Rehearse the delivery</h4>
        <p className="text-xs text-[var(--stint-text-muted)]">This is a suggested exercise based on the passage, not a claim that this sentence was spoken incorrectly.</p>
        <p className="text-sm">Before reading, identify the main message of this sentence.</p>
        <button type="button" aria-pressed={guidance} onClick={()=>setGuidance(v=>!v)} className="rounded-lg border border-[var(--stint-border)] px-3 py-2 text-xs">{guidance ? 'Hide reading guidance' : 'Show reading guidance'}</button>
        {guidance && <p className="text-xs text-[var(--stint-text-muted)]">Slashes suggest possible phrase breaks. Select up to three words you want to emphasise; these are your choices, not a score.</p>}
        <div className="break-words text-base leading-loose">{guidance ? phraseChunks(plan.sentence).map((chunk,ci)=><React.Fragment key={ci}>{ci > 0 && <span aria-label="Suggested phrase break" className="mx-2 text-[var(--stint-primary)]">/</span>}{chunk.split(/\s+/).map(word=>{const index=wordIndex++; return <React.Fragment key={index}><button type="button" aria-label={`Emphasise ${word}`} aria-pressed={emphasis.includes(index)} onClick={()=>setEmphasis(prev=>prev.includes(index)?prev.filter(i=>i!==index):prev.length<3?[...prev,index]:prev)} className={`max-w-full rounded px-0.5 text-left [overflow-wrap:anywhere] focus-visible:outline-2 ${emphasis.includes(index)?'font-bold bg-[var(--stint-primary)]/15':'hover:bg-[var(--stint-bg)]'}`}>{word}</button>{' '}</React.Fragment>;})}</React.Fragment>) : plan.sentence}</div>
        <p className="text-sm leading-relaxed">{plan.exercise}</p>
        {onListen && <button type="button" onClick={()=>onListen(plan.sentence)} className="rounded-lg border border-[var(--stint-border)] px-3 py-2 text-sm font-semibold">Hear an example sentence</button>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={rehearsed} onChange={e=>setRehearsed(e.target.checked)} />I have rehearsed this sentence aloud</label>
        <p className="text-xs text-[var(--stint-text-muted)]">Rehearsal is for practice; it is not separately recorded or scored.</p>
      </div>
      <p className="text-sm">{plan.reflection}</p>
    </> : <p className="text-sm">Read one sentence from your passage, grouping related words and emphasising its main idea. Repeat the passage to receive a saved sentence exercise with your next report.</p>}
    {onRepeat && <button onClick={onRepeat} className="rounded-lg bg-[var(--stint-primary)] px-3 py-2 text-sm font-semibold text-white">Record the full passage again</button>}
    <p className="text-xs text-[var(--stint-text-muted)]">Use comparable recordings to check progress. Text alone cannot establish changes in expression, confidence or technical understanding.</p>
  </section>;
}
