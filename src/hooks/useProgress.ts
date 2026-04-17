import { useEffect, useRef } from 'react';
import type { AuthStatus, AuthUser } from './useAuth';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

interface ProgressDeps {
  homeChoice: string | null;
  termsLength: number;
  completedCount: number;
  quizCorrect: number;
  quizIncorrect: number;
  sessionQuestionsLength: number;
  interviewAnswered: number;
}

export function useProgress(
  authStatus: AuthStatus,
  currentUser: AuthUser | null,
  deps: ProgressDeps,
) {
  const lastSentRef = useRef<string>('');

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser) return;

    const payload = {
      module: deps.homeChoice ?? 'home',
      total_terms: deps.termsLength,
      completed_terms: deps.completedCount,
      quiz_correct: deps.quizCorrect,
      quiz_incorrect: deps.quizIncorrect,
      interview_total: deps.sessionQuestionsLength,
      interview_answered: deps.interviewAnswered,
    };

    const payloadStr = JSON.stringify(payload);

    // Only send when values actually change
    if (payloadStr === lastSentRef.current) return;

    const timer = setTimeout(() => {
      lastSentRef.current = payloadStr;
      fetch('/api/progress', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: payloadStr,
      }).catch(() => {});
    }, 3000);

    return () => clearTimeout(timer);
  }, [
    authStatus,
    currentUser,
    deps.homeChoice,
    deps.termsLength,
    deps.completedCount,
    deps.quizCorrect,
    deps.quizIncorrect,
    deps.sessionQuestionsLength,
    deps.interviewAnswered,
  ]);
}
