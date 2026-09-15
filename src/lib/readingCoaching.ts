export interface DeliveryCoachingPlan {
  version: 1;
  sentence: string;
  focus: string;
  exercise: string;
  reflection: string;
}

/** Text-based rehearsal suggestions, never an acoustic diagnosis or a new score. */
export function buildDeliveryCoaching(reference: string): DeliveryCoachingPlan | undefined {
  const sentences = (reference.match(/[^.!?]+[.!?]*/g) ?? []).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) return undefined;
  const sentence = sentences.find(s => s.split(/\s+/).length >= 10) ?? sentences[0];
  return {
    version: 1,
    sentence,
    focus: 'Make the idea easy for another person to follow.',
    exercise: 'Read this sentence as if you are explaining it to one interviewer. Group related words together, give the main idea a little emphasis, and leave a brief pause before the next idea. Keep your own accent and a comfortable pace.',
    reflection: 'Listen back: can you hear the main point clearly, and do your pauses preserve the meaning? Choose one change for your next full reading.',
  };
}

export function phraseChunks(text: string): string[] {
  // Punctuation is a rehearsal cue, not evidence of where the speaker paused.
  return text.split(/(?<=[,;:])\s+/).filter(Boolean);
}
