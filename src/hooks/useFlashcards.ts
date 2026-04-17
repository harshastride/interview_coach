import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Flashcard } from '../constants';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

export type Mode = 'flashcard' | 'quiz';

export interface UseFlashcardsOptions {
  mergedTermsSource: Flashcard[];
  selectedCategories: string[];
  selectedLevel: number | null;
  isConfigured: boolean;
  homeChoice: string | null;
}

export function useFlashcards(options: UseFlashcardsOptions) {
  const { mergedTermsSource, selectedCategories, selectedLevel, isConfigured, homeChoice } = options;

  const [terms, setTerms] = useState<Flashcard[]>([]);
  const [completedTermIds, setCompletedTermIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('flashcard');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string>('');
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

  // Initialize and shuffle terms when starting a session
  useEffect(() => {
    if (!isConfigured) return;

    let filtered = [...mergedTermsSource];
    filtered = filtered.filter((t) => selectedCategories.includes(t.category));
    if (selectedLevel !== null) {
      filtered = filtered.filter((t) => t.level === selectedLevel);
    }

    const shuffled = filtered.sort(() => 0.5 - Math.random());
    setTerms(shuffled);
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
    setSelectedOption(null);
    setShowExplanation(false);
    if (homeChoice === 'quiz') setMode('quiz');
    else setMode('flashcard');
  }, [isConfigured, selectedLevel, selectedCategories, homeChoice, mergedTermsSource]);

  const termsToShow = useMemo(
    () => terms.filter((t) => !completedTermIds.has(t.id)),
    [terms, completedTermIds],
  );

  const displayIndex =
    termsToShow.length === 0 ? 0 : Math.min(currentIndex, Math.max(0, termsToShow.length - 1));

  const currentCard =
    (mode === 'flashcard' ? termsToShow[displayIndex] : terms[currentIndex]) ?? null;

  // Shuffle quiz options when currentIndex or mode changes
  useEffect(() => {
    if (mode === 'quiz' && currentCard) {
      const others = terms
        .filter((t) => t.id !== currentCard.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map((t) => t.term);

      const opts = [...others, currentCard.term].sort(() => 0.5 - Math.random());
      setQuizOptions(opts);
      setSelectedOption(null);
      setShowExplanation(false);
      setExplanation('');
    }
  }, [currentIndex, mode, terms, currentCard]);

  const studyTerms = mode === 'flashcard' ? termsToShow : terms;
  const studyLength = studyTerms.length;
  const studyIndex = mode === 'flashcard' ? displayIndex : currentIndex;

  const handleNext = useCallback(() => {
    setIsFlipped(false);
    if (studyLength <= 0) return;
    setCurrentIndex((prev) => (prev + 1) % studyLength);
  }, [studyLength]);

  const handlePrev = useCallback(() => {
    setIsFlipped(false);
    if (studyLength <= 0) return;
    setCurrentIndex((prev) => (prev - 1 + studyLength) % studyLength);
  }, [studyLength]);

  const handleShuffle = useCallback(() => {
    const shuffled = [...terms].sort(() => 0.5 - Math.random());
    setTerms(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [terms]);

  const handleScore = useCallback(
    (type: 'correct' | 'incorrect') => {
      setScore((prev) => ({ ...prev, [type]: prev[type] + 1 }));
      if (type === 'correct' && currentCard?.id) {
        setCompletedTermIds((prev) => new Set(prev).add(currentCard.id));
      } else {
        // For incorrect, move to next
        setIsFlipped(false);
        setCurrentIndex((prev) => {
          if (studyLength <= 0) return prev;
          return (prev + 1) % studyLength;
        });
      }
    },
    [currentCard, studyLength],
  );

  const handleQuizSelect = useCallback(
    async (option: string) => {
      if (selectedOption || !currentCard) return;
      setSelectedOption(option);

      const isCorrect = option === currentCard.term;
      if (isCorrect) {
        setScore((prev) => ({ ...prev, correct: prev.correct + 1 }));
      } else {
        setScore((prev) => ({ ...prev, incorrect: prev.incorrect + 1 }));
      }

      // Get AI explanation from server proxy
      setIsLoadingExplanation(true);
      try {
        const response = await fetch('/api/ai/explain', {
          method: 'POST',
          credentials: 'include',
          headers: FETCH_HEADERS,
          body: JSON.stringify({
            term: currentCard.term,
            definition: currentCard.definition,
            selectedOption: option,
          }),
        });

        if (!response.ok) {
          throw new Error(`Explain request failed: ${response.status}`);
        }

        const { explanation: expl } = await response.json();
        setExplanation(expl || '');
      } catch (error) {
        console.error('AI Error:', error);
        setExplanation('Could not load AI explanation.');
      } finally {
        setIsLoadingExplanation(false);
        setShowExplanation(true);
      }
    },
    [selectedOption, currentCard],
  );

  const resetStats = useCallback(() => {
    setScore({ correct: 0, incorrect: 0 });
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  return {
    terms,
    completedTermIds,
    mode,
    setMode,
    currentIndex,
    isFlipped,
    setIsFlipped,
    score,
    quizOptions,
    selectedOption,
    showExplanation,
    setShowExplanation,
    explanation,
    setExplanation,
    isLoadingExplanation,
    setIsLoadingExplanation,
    termsToShow,
    displayIndex,
    currentCard,
    studyTerms,
    studyLength,
    studyIndex,
    handleNext,
    handlePrev,
    handleShuffle,
    handleScore,
    handleQuizSelect,
    resetStats,
  };
}
