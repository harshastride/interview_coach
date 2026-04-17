import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { InterviewEntry } from '../constants';

export type InterviewPhase = 'select' | 'intro' | 'in_progress' | 'complete';
export type TypewriterSpeed = 'slow' | 'medium' | 'fast';

export function useInterview(mergedInterviewBank: InterviewEntry[]) {
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('select');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedInterviewCategories, setSelectedInterviewCategories] = useState<string[]>([]);
  const [useRandomInterview, setUseRandomInterview] = useState(false);
  const [candidateName, setCandidateName] = useState('Candidate');
  const [sessionQuestions, setSessionQuestions] = useState<InterviewEntry[]>([]);
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [questionAudioDone, setQuestionAudioDone] = useState(false);
  const [typewriterDisplayed, setTypewriterDisplayed] = useState('');
  const [typewriterSpeed, setTypewriterSpeed] = useState<TypewriterSpeed>('medium');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [isPlayingFullSession, setIsPlayingFullSession] = useState(false);

  const interviewChatEndRef = useRef<HTMLDivElement | null>(null);
  const interviewSwipeStartX = useRef<number>(0);
  const interviewSwipeStartY = useRef<number>(0);

  // Computed values
  const interviewRoles = useMemo(
    () => [...new Set(mergedInterviewBank.map((e) => e.role))],
    [mergedInterviewBank],
  );

  const interviewCompanies = useMemo(
    () => [...new Set(mergedInterviewBank.map((e) => e.company))],
    [mergedInterviewBank],
  );

  const interviewCategories = useMemo(
    () => [...new Set(mergedInterviewBank.map((e) => e.category ?? 'General'))].sort(),
    [mergedInterviewBank],
  );

  // Auto-select first role when roles change
  useEffect(() => {
    if (interviewRoles.length > 0 && (selectedRole === null || !interviewRoles.includes(selectedRole))) {
      setSelectedRole(interviewRoles[0]);
    }
  }, [interviewRoles, selectedRole]);

  // Typewriter effect: after question audio ends, reveal ideal_answer char-by-char
  const typewriterMs = { slow: 120, medium: 60, fast: 30 }[typewriterSpeed];

  useEffect(() => {
    if (interviewPhase !== 'in_progress' || !questionAudioDone || sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    const full = sessionQuestions[idx].ideal_answer;
    if (typewriterDisplayed.length >= full.length) return;
    const t = setTimeout(() => {
      setTypewriterDisplayed((prev) => full.slice(0, prev.length + 1));
    }, typewriterMs);
    return () => clearTimeout(t);
  }, [interviewPhase, questionAudioDone, interviewIndex, sessionQuestions, typewriterDisplayed, typewriterMs]);

  const startInterview = useCallback(() => {
    const canStart = useRandomInterview || selectedInterviewCategories.length > 0;
    if (!canStart) return;

    const pool = useRandomInterview
      ? [...mergedInterviewBank]
      : mergedInterviewBank.filter((e) => selectedInterviewCategories.includes(e.category ?? 'General'));

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const ten = shuffled.slice(0, 10);
    if (ten.length === 0) return;

    setSessionQuestions(ten);
    setSelectedRole(ten[0]?.role ?? null);
    setInterviewPhase('intro');
    setInterviewIndex(0);
  }, [useRandomInterview, selectedInterviewCategories, mergedInterviewBank]);

  const goNext = useCallback(() => {
    setInterviewIndex((i) => i + 1);
  }, []);

  const goPrev = useCallback(() => {
    setInterviewIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  return {
    // State
    interviewPhase,
    setInterviewPhase,
    selectedRole,
    setSelectedRole,
    selectedInterviewCategories,
    setSelectedInterviewCategories,
    useRandomInterview,
    setUseRandomInterview,
    candidateName,
    setCandidateName,
    sessionQuestions,
    setSessionQuestions,
    interviewIndex,
    setInterviewIndex,
    questionAudioDone,
    setQuestionAudioDone,
    typewriterDisplayed,
    setTypewriterDisplayed,
    typewriterSpeed,
    setTypewriterSpeed,
    feedbackRating,
    setFeedbackRating,
    micGranted,
    setMicGranted,
    isPlayingFullSession,
    setIsPlayingFullSession,

    // Refs
    interviewChatEndRef,
    interviewSwipeStartX,
    interviewSwipeStartY,

    // Computed
    interviewRoles,
    interviewCompanies,
    interviewCategories,
    typewriterMs,

    // Actions
    startInterview,
    goNext,
    goPrev,
  };
}
