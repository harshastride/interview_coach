import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BrainCircuit,
  BookOpen,
  Trophy,
  Lightbulb,
  Shuffle,
  Volume2,
  Mic,
  MicOff,
  Loader2,
  Bookmark,
  BookmarkCheck,
  Download,
  Keyboard,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import type { Flashcard } from '../constants';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import { useAuth } from '../hooks/useAuth';
import { useTTS } from '../hooks/useTTS';
import { useCardReviews, useBookmarks, useSessionState } from '../hooks/useStudyAPI';
import { HeaderRightSlot, useBottomNav, uniqueId, slug, fetchJson } from './shared';

type Mode = 'flashcard' | 'quiz';

interface FlashcardStudyProps {
  uploadedTermsRaw: { t: string; d: string; l: number; c: string }[];
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
  homeChoice?: 'flashcards' | 'quiz';
}

/* ------------------------------------------------------------------ */
/*  Difficulty rating for spaced repetition                            */
/* ------------------------------------------------------------------ */
type DifficultyRating = 1 | 2 | 3 | 4;

const DIFFICULTY_BUTTONS: { rating: DifficultyRating; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { rating: 1, label: 'Again', color: 'text-rose-600', bgColor: 'bg-rose-50 hover:bg-rose-100', borderColor: 'border-rose-200' },
  { rating: 2, label: 'Hard', color: 'text-orange-600', bgColor: 'bg-orange-50 hover:bg-orange-100', borderColor: 'border-orange-200' },
  { rating: 3, label: 'Good', color: 'text-[var(--stint-primary)]', bgColor: 'bg-blue-50 hover:bg-blue-100', borderColor: 'border-blue-200' },
  { rating: 4, label: 'Easy', color: 'text-emerald-600', bgColor: 'bg-emerald-50 hover:bg-emerald-100', borderColor: 'border-emerald-200' },
];

/* ------------------------------------------------------------------ */
/*  Session state shape for persistence                                */
/* ------------------------------------------------------------------ */
interface SavedSession {
  currentIndex: number;
  score: { correct: number; incorrect: number };
  completedTermIds: string[];
  mode: Mode;
  wrongAnswers: string[];
  shuffleOn: boolean;
}

export default function FlashcardStudy({ uploadedTermsRaw, currentUser, onContentRefresh, homeChoice = 'flashcards' }: FlashcardStudyProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleLogout } = useAuth();
  const { isSpeaking, speakTerm, stopAudio } = useTTS();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // Get selected categories and level from route state
  const routeState = (location.state as { selectedCategories?: string[]; selectedLevel?: number | null }) ?? {};
  const selectedCategories = routeState.selectedCategories ?? [];
  const selectedLevel = routeState.selectedLevel ?? null;

  const activeSection = homeChoice === 'flashcards' ? 'flashcards' as const : 'quiz' as const;
  const bottomNavProps = useBottomNav(activeSection);

  // Study API hooks
  const sessionModule = `${homeChoice ?? 'home'}-${selectedCategories.sort().join(',')}`;
  const { submitReview } = useCardReviews();
  const { bookmarkedSlugs, toggleBookmark } = useBookmarks();
  const { state: savedSession, loaded: sessionLoaded, saveState: saveSession, clearState: clearSession } = useSessionState<SavedSession>(sessionModule);

  // Build terms from uploaded data
  const mergedTermsSource = useMemo<Flashcard[]>(() => {
    const seen = new Set<string>();
    return uploadedTermsRaw.map(({ t, d, l, c }) => ({
      id: uniqueId(`uploaded-${t}`, seen),
      term: t,
      definition: d,
      example: `e.g. ${d.slice(0, 60)}${d.length > 60 ? '\u2026' : ''}`,
      quizTip: `Focus on: ${c}.`,
      level: l,
      category: c,
    }));
  }, [uploadedTermsRaw]);

  // Original (unshuffled) filtered terms — stable reference for toggling shuffle off
  const originalTerms = useMemo<Flashcard[]>(() => {
    let filtered = [...mergedTermsSource];
    filtered = filtered.filter((t) => selectedCategories.includes(t.category));
    if (selectedLevel !== null) {
      filtered = filtered.filter((t) => t.level === selectedLevel);
    }
    return filtered;
  }, [mergedTermsSource, selectedCategories, selectedLevel]);

  // State
  const [terms, setTerms] = useState<Flashcard[]>([]);
  const [completedTermIds, setCompletedTermIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(homeChoice === 'quiz' ? 'quiz' : 'flashcard');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string>('');
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Feature: shuffle toggle (persistent)
  const [shuffleOn, setShuffleOn] = useState(true);

  // Feature: wrong-answer review
  const [wrongAnswers, setWrongAnswers] = useState<string[]>([]);
  const [reviewMode, setReviewMode] = useState(false);

  // Feature: type-your-answer in quiz
  const [typedAnswer, setTypedAnswer] = useState('');
  const [typedSubmitted, setTypedSubmitted] = useState(false);
  const typedInputRef = useRef<HTMLInputElement>(null);

  // Feature: session resume banner
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Feature: keyboard shortcut hint
  const [showKbHint, setShowKbHint] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Initialize terms (shuffle or not based on shuffleOn)
  useEffect(() => {
    const filtered = [...originalTerms];
    const shuffled = shuffleOn ? filtered.sort(() => 0.5 - Math.random()) : filtered;
    setTerms(shuffled);
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
    setSelectedOption(null);
    setShowExplanation(false);
    setWrongAnswers([]);
    setReviewMode(false);
  }, [originalTerms]);

  // Session resume: show banner if saved session exists
  useEffect(() => {
    if (sessionLoaded && savedSession && terms.length > 0 && !showResumeBanner) {
      setShowResumeBanner(true);
    }
  }, [sessionLoaded, savedSession, terms.length]);

  const handleResumeSession = () => {
    if (!savedSession) return;
    setCurrentIndex(savedSession.currentIndex);
    setScore(savedSession.score);
    setCompletedTermIds(new Set(savedSession.completedTermIds));
    setMode(savedSession.mode);
    setWrongAnswers(savedSession.wrongAnswers ?? []);
    setShuffleOn(savedSession.shuffleOn ?? true);
    setShowResumeBanner(false);
    clearSession();
  };

  const handleStartFresh = () => {
    setShowResumeBanner(false);
    clearSession();
  };

  // Save session on unmount
  useEffect(() => {
    return () => {
      if (terms.length > 0 && (score.correct > 0 || score.incorrect > 0 || currentIndex > 0)) {
        saveSession({
          currentIndex,
          score,
          completedTermIds: Array.from(completedTermIds),
          mode,
          wrongAnswers,
          shuffleOn,
        });
      }
    };
  }, [terms.length, currentIndex, score, completedTermIds, mode, wrongAnswers, shuffleOn, saveSession]);

  const termsToShow = useMemo(
    () => terms.filter((t) => !completedTermIds.has(t.id)),
    [terms, completedTermIds],
  );

  // For review mode, filter to wrong answers only
  const reviewTerms = useMemo(
    () => terms.filter((t) => wrongAnswers.includes(t.id)),
    [terms, wrongAnswers],
  );

  const activeTerms = reviewMode ? reviewTerms : (mode === 'flashcard' ? termsToShow : terms);
  const displayIndex = activeTerms.length === 0 ? 0 : Math.min(currentIndex, Math.max(0, activeTerms.length - 1));
  const currentCard = activeTerms[displayIndex] ?? null;

  const studyTerms = activeTerms;
  const studyLength = studyTerms.length;
  const studyIndex = displayIndex;

  // Auto-speak on flip
  useEffect(() => {
    if (isFlipped && currentCard) {
      speakTerm(currentCard.term);
    }
  }, [isFlipped]);

  // Shuffle quiz options
  useEffect(() => {
    if (mode === 'quiz' && currentCard && !reviewMode) {
      const others = terms
        .filter((t) => t.id !== currentCard.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map((t) => t.term);
      const options = [...others, currentCard.term].sort(() => 0.5 - Math.random());
      setQuizOptions(options);
      setSelectedOption(null);
      setShowExplanation(false);
      setExplanation('');
      setTranscription('');
      setSimilarityScore(null);
      setTypedAnswer('');
      setTypedSubmitted(false);
    }
  }, [currentIndex, mode, terms, currentCard, reviewMode]);

  // Progress reporting
  useEffect(() => {
    if (!currentUser) return;
    const payload = {
      module: homeChoice ?? 'home',
      total_terms: terms.length,
      completed_terms: completedTermIds.size,
      quiz_correct: score.correct,
      quiz_incorrect: score.incorrect,
      interview_total: 0,
      interview_answered: 0,
    };
    const timer = setTimeout(() => {
      fetch('/api/progress', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [currentUser, terms.length, completedTermIds.size, score.correct, score.incorrect]);

  /* ---------------------------------------------------------------- */
  /*  Navigation helpers                                               */
  /* ---------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------- */
  /*  Shuffle toggle                                                   */
  /* ---------------------------------------------------------------- */
  const handleToggleShuffle = useCallback(() => {
    setShuffleOn((prev) => {
      const next = !prev;
      if (next) {
        setTerms((t) => [...t].sort(() => 0.5 - Math.random()));
      } else {
        setTerms([...originalTerms]);
      }
      setCurrentIndex(0);
      setIsFlipped(false);
      return next;
    });
  }, [originalTerms]);

  /* ---------------------------------------------------------------- */
  /*  Spaced-repetition difficulty rating                              */
  /* ---------------------------------------------------------------- */
  const handleDifficultyRating = useCallback((rating: DifficultyRating) => {
    if (!currentCard) return;
    const termSlug = slug(currentCard.term);
    submitReview(termSlug, rating);

    if (rating >= 3) {
      // Good or Easy — mark correct
      setScore((prev) => ({ ...prev, correct: prev.correct + 1 }));
      if (currentCard.id) {
        setCompletedTermIds((prev) => new Set(prev).add(currentCard.id));
      }
    } else {
      // Again or Hard — mark incorrect
      setScore((prev) => ({ ...prev, incorrect: prev.incorrect + 1 }));
      handleNext();
    }
  }, [currentCard, submitReview, handleNext]);

  /* ---------------------------------------------------------------- */
  /*  Quiz select                                                      */
  /* ---------------------------------------------------------------- */
  const handleQuizSelect = async (option: string) => {
    if (selectedOption || !currentCard) return;
    setSelectedOption(option);
    const isCorrect = option === currentCard.term;
    if (isCorrect) {
      setScore((prev) => ({ ...prev, correct: prev.correct + 1 }));
    } else {
      setScore((prev) => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setWrongAnswers((prev) => prev.includes(currentCard.id) ? prev : [...prev, currentCard.id]);
    }

    // Also submit review: correct = rating 3, incorrect = rating 1
    const termSlug = slug(currentCard.term);
    submitReview(termSlug, isCorrect ? 3 : 1);

    setIsLoadingExplanation(true);
    try {
      const result = await fetchJson<{ explanation: string }>('/api/ai/explain', {
        method: 'POST',
        body: JSON.stringify({
          correctTerm: currentCard.term,
          definition: currentCard.definition,
          selectedOption: option,
        }),
      });
      setExplanation(result.explanation || '');
    } catch {
      setExplanation('Could not load AI explanation.');
    } finally {
      setIsLoadingExplanation(false);
      setShowExplanation(true);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Type-your-answer                                                 */
  /* ---------------------------------------------------------------- */
  const handleTypedSubmit = () => {
    if (!currentCard || typedSubmitted || !typedAnswer.trim()) return;
    setTypedSubmitted(true);
    const isCorrect = typedAnswer.trim().toLowerCase() === currentCard.term.toLowerCase();
    if (isCorrect) {
      handleQuizSelect(currentCard.term);
    } else {
      // Treat as wrong — show correct answer
      handleQuizSelect(typedAnswer.trim());
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Voice input                                                      */
  /* ---------------------------------------------------------------- */
  const startListening = async () => {
    if (isListening) return;
    setIsListening(true);
    setTranscription('Listening...');
    setSimilarityScore(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const chunks: Int16Array[] = [];
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
        }
        chunks.push(pcmData);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setTimeout(() => {
        if (isListening) stopListening(chunks);
      }, 5000);
    } catch {
      setIsListening(false);
      setTranscription('Error accessing microphone.');
    }
  };

  const stopListening = async (chunks?: Int16Array[]) => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsListening(false);

    if (chunks && chunks.length > 0 && currentCard) {
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(merged.buffer)));

      setIsLoadingExplanation(true);
      try {
        const result = await fetchJson<{ transcription: string }>('/api/ai/transcribe', {
          method: 'POST',
          body: JSON.stringify({ audio: base64Data, expectedTerm: currentCard.term }),
        });
        setTranscription(result.transcription || '');

        const compareResult = await fetchJson<{ score: number; feedback: string; isMatch: boolean }>('/api/ai/compare', {
          method: 'POST',
          body: JSON.stringify({ transcription: result.transcription, correctTerm: currentCard.term }),
        });
        setSimilarityScore(compareResult.score);
        if (compareResult.isMatch) {
          handleQuizSelect(currentCard.term);
        } else {
          setExplanation(`AI Feedback: ${compareResult.feedback} (Match: ${compareResult.score}%)`);
          setShowExplanation(true);
        }
      } catch {
        setTranscription('Transcription failed.');
      } finally {
        setIsLoadingExplanation(false);
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Wrong-answer review mode                                         */
  /* ---------------------------------------------------------------- */
  const enterReviewMode = () => {
    setReviewMode(true);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSelectedOption(null);
    setShowExplanation(false);
  };

  const exitReviewMode = () => {
    setReviewMode(false);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Export wrong answers as PDF                                       */
  /* ---------------------------------------------------------------- */
  const exportWrongAnswersPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const wrongTerms = terms.filter((t) => wrongAnswers.includes(t.id));

    doc.setFontSize(18);
    doc.text('Study Sheet — Wrong Answers', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleDateString()} | ${wrongTerms.length} terms`, 14, 28);

    let y = 40;
    const pageHeight = doc.internal.pageSize.getHeight();

    wrongTerms.forEach((term, i) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${i + 1}. ${term.term}`, 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(term.definition, 180);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 8;
    });

    doc.save('wrong-answers-study-sheet.pdf');
  };

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */
  const resetStats = () => {
    setScore({ correct: 0, incorrect: 0 });
    setCompletedTermIds(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
    setWrongAnswers([]);
    setReviewMode(false);
    clearSession();
  };

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case ' ':
          if (mode === 'flashcard') {
            e.preventDefault();
            setIsFlipped((f) => !f);
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          if (mode === 'quiz' && !selectedOption && quizOptions.length > 0) {
            const idx = parseInt(e.key) - 1;
            if (idx < quizOptions.length) {
              e.preventDefault();
              handleQuizSelect(quizOptions[idx]);
            }
          } else if (mode === 'flashcard' && isFlipped) {
            e.preventDefault();
            handleDifficultyRating(parseInt(e.key) as DifficultyRating);
          }
          break;
        }
        case 'Enter':
          if (mode === 'quiz' && showExplanation && !isLoadingExplanation) {
            e.preventDefault();
            handleNext();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNext, handlePrev, mode, isFlipped, selectedOption, quizOptions, showExplanation, isLoadingExplanation, handleDifficultyRating]);

  /* ---------------------------------------------------------------- */
  /*  Bookmark helpers                                                 */
  /* ---------------------------------------------------------------- */
  const isCurrentBookmarked = currentCard ? bookmarkedSlugs.has(slug(currentCard.term)) : false;

  const handleToggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentCard) return;
    toggleBookmark(slug(currentCard.term));
  };

  /* ---------------------------------------------------------------- */
  /*  Layout / header                                                  */
  /* ---------------------------------------------------------------- */
  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => setShowAdminPanel(true)}
    />
  );

  const setupPath = homeChoice === 'flashcards' ? '/flashcards' : '/quiz';

  /* ---------------------------------------------------------------- */
  /*  Empty / completed states                                         */
  /* ---------------------------------------------------------------- */

  // No terms found
  if (terms.length === 0) {
    const sectionLabel = homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz';
    const topBarEmpty: GlobalTopBarProps = { sectionLabel, stepLabel: 'No terms', showBack: true, onBack: () => { stopAudio(); navigate(setupPath); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBarEmpty} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
            <h2 className="text-xl font-semibold text-[var(--stint-primary)] mb-2">No terms found</h2>
            <p className="text-sm text-[var(--stint-text-muted)] mb-6">Try selecting one or more topics above.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => navigate(setupPath)}
                className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Change topics
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium hover:bg-[var(--stint-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Home
              </button>
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  // All flashcards completed
  if (homeChoice === 'flashcards' && mode === 'flashcard' && termsToShow.length === 0 && !reviewMode) {
    const topBarAllDone: GlobalTopBarProps = { sectionLabel: 'Flashcards', stepLabel: 'All done', showBack: true, onBack: () => { stopAudio(); navigate(setupPath); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBarAllDone} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
            <h2 className="text-xl font-semibold text-[var(--stint-primary)] mb-2">All cards completed</h2>
            <p className="text-sm text-[var(--stint-text-muted)] mb-6">You marked every card correct in this round.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => { setCompletedTermIds(new Set()); setCurrentIndex(0); }}
                className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Study again
              </button>
              {wrongAnswers.length > 0 && (
                <button
                  onClick={enterReviewMode}
                  className="px-6 py-3 rounded-full bg-rose-500 text-white font-medium hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                >
                  Review {wrongAnswers.length} wrong answer{wrongAnswers.length !== 1 ? 's' : ''}
                </button>
              )}
              <button
                onClick={() => navigate(setupPath)}
                className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium hover:bg-[var(--stint-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                Back to topics
              </button>
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  // Quiz completed (went through all cards)
  const quizFinished = mode === 'quiz' && !reviewMode && currentIndex >= terms.length - 1 && selectedOption !== null && showExplanation && !isLoadingExplanation;

  if (!currentCard) return null;

  const sectionLabelStudy = reviewMode ? 'Review' : (homeChoice === 'flashcards' ? 'Flashcards' : 'Quiz');
  const stepLabelStudy = `${studyIndex + 1} / ${studyLength}`;
  const topBarStudy: GlobalTopBarProps = { sectionLabel: sectionLabelStudy, stepLabel: stepLabelStudy, showBack: true, onBack: () => { stopAudio(); reviewMode ? exitReviewMode() : navigate(setupPath); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBarStudy} bottomNav={bottomNavProps}>
        <div className="w-full max-w-4xl mx-auto px-4 flex flex-col min-h-0 flex-1">
          {/* Session resume banner */}
          {showResumeBanner && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex-shrink-0 mb-2 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3"
            >
              <p className="text-sm font-medium text-amber-800">Resume your previous session?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleResumeSession}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
                >
                  Resume
                </button>
                <button
                  onClick={handleStartFresh}
                  className="px-4 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors"
                >
                  Start fresh
                </button>
              </div>
            </motion.div>
          )}

          {/* Review mode banner */}
          {reviewMode && (
            <div className="flex-shrink-0 mb-2 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-rose-700">Reviewing {wrongAnswers.length} wrong answer{wrongAnswers.length !== 1 ? 's' : ''}</p>
              <button
                onClick={exitReviewMode}
                className="px-4 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors"
              >
                Exit review
              </button>
            </div>
          )}

          {/* Toolbar: mode switch + progress + stats */}
          <div className="flex-shrink-0 flex items-center gap-4 py-3 border-b border-[var(--stint-border)]">
            <div className="flex rounded-xl bg-[var(--stint-bg)] p-1">
              <button
                onClick={() => setMode('flashcard')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  mode === 'flashcard' ? "bg-[var(--stint-bg-elevated)] text-[var(--stint-primary)] shadow-sm" : "text-[var(--stint-text-muted)] hover:text-[var(--stint-text)]"
                )}
              >
                <BookOpen size={18} strokeWidth={2} />
                <span className="hidden sm:inline">Flashcards</span>
              </button>
              <button
                onClick={() => setMode('quiz')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  mode === 'quiz' ? "bg-[var(--stint-bg-elevated)] text-[var(--stint-primary)] shadow-sm" : "text-[var(--stint-text-muted)] hover:text-[var(--stint-text)]"
                )}
              >
                <BrainCircuit size={18} strokeWidth={2} />
                <span className="hidden sm:inline">Quiz</span>
              </button>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-[var(--stint-border)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--stint-primary)] transition-all duration-300" style={{ width: `${studyLength > 0 ? ((studyIndex + 1) / studyLength) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-medium text-[var(--stint-text-muted)] tabular-nums">{studyIndex + 1}/{studyLength}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 text-emerald-600" title="Correct"><CheckCircle2 size={16} /><span className="text-sm font-semibold tabular-nums">{score.correct}</span></span>
              <span className="flex items-center gap-1 text-rose-500" title="Incorrect"><XCircle size={16} /><span className="text-sm font-semibold tabular-nums">{score.incorrect}</span></span>

              {/* Shuffle toggle */}
              <button
                onClick={handleToggleShuffle}
                className={cn(
                  "p-2 rounded-lg transition-colors flex items-center gap-1",
                  shuffleOn
                    ? "text-[var(--stint-primary)] bg-[var(--stint-primary)]/10"
                    : "text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)]"
                )}
                title={shuffleOn ? 'Shuffle ON — click to disable' : 'Shuffle OFF — click to enable'}
              >
                <Shuffle size={18} />
                {shuffleOn ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>

              <button onClick={resetStats} className="p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] transition-colors" title="Reset"><RotateCcw size={18} /></button>

              {/* Keyboard shortcut hint */}
              <button
                onClick={() => setShowKbHint((v) => !v)}
                className="p-2 rounded-lg text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] hover:text-[var(--stint-primary)] transition-colors"
                title="Keyboard shortcuts"
              >
                <Keyboard size={18} />
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts tooltip */}
          <AnimatePresence>
            {showKbHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex-shrink-0 overflow-hidden"
              >
                <div className="py-2 px-3 text-xs text-[var(--stint-text-muted)] flex flex-wrap gap-x-4 gap-y-1 bg-[var(--stint-bg)] rounded-lg mt-2">
                  <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] font-mono text-[10px]">Space</kbd> Flip card</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] font-mono text-[10px]">&larr;</kbd> <kbd className="px-1.5 py-0.5 rounded bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] font-mono text-[10px]">&rarr;</kbd> Navigate</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] font-mono text-[10px]">1-4</kbd> Rate / Select</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] font-mono text-[10px]">Enter</kbd> Next (quiz)</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content Area */}
          <main className="flex-1 min-h-0 flex flex-col py-3 md:py-4">
            <div className="relative flex-1 min-h-[50vh] w-full perspective-1000 flex items-stretch justify-center">
              <AnimatePresence mode="wait">
                {mode === 'flashcard' ? (
                  <motion.div
                    key={`card-${currentCard.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={isFlipped ? 'Show term' : 'Show definition'}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="w-full min-h-[50vh] flex-1 cursor-pointer flex items-stretch justify-center px-0 max-w-3xl mx-auto focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 rounded-2xl"
                    onClick={() => setIsFlipped(!isFlipped)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsFlipped(!isFlipped); } }}
                  >
                    <div className={cn(
                      "relative w-full min-h-[50vh] flex-1 transition-all duration-500 preserve-3d",
                      isFlipped && "rotate-y-180"
                    )}>
                      {/* Front */}
                      <div className="absolute inset-0 backface-hidden card-surface rounded-2xl md:rounded-3xl flex flex-col items-center justify-center p-8 md:p-12 lg:p-16 text-center min-h-[48vh]">
                        <span className="absolute top-5 left-5 px-3 py-1 rounded-full bg-[var(--stint-primary)]/10 text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider">
                          {currentCard.category}
                        </span>
                        <div className="absolute top-5 right-5 flex items-center gap-2">
                          {/* Bookmark button */}
                          <button
                            onClick={handleToggleBookmark}
                            className={cn(
                              "p-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2",
                              isCurrentBookmarked
                                ? "bg-amber-50 text-amber-500 hover:bg-amber-100"
                                : "bg-[var(--stint-bg)] text-[var(--stint-text-muted)] hover:text-amber-500 hover:bg-amber-50"
                            )}
                            aria-label={isCurrentBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                          >
                            {isCurrentBookmarked ? <BookmarkCheck size={24} strokeWidth={2} /> : <Bookmark size={24} strokeWidth={2} />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); speakTerm(currentCard.term); }}
                            className={cn(
                              "p-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2",
                              isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/10"
                            )}
                            aria-label="Play audio"
                          >
                            <Volume2 size={24} strokeWidth={2} />
                          </button>
                        </div>
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[var(--stint-text)] leading-tight max-w-[85%]">
                          {currentCard.term}
                        </h2>
                        <p className="mt-8 text-sm text-[var(--stint-text-muted)] flex items-center gap-2 opacity-70">
                          <span className="inline-block w-5 h-5 rounded-md border border-[var(--stint-border)] text-[10px] font-mono flex items-center justify-center leading-none">⎵</span>
                          Tap or press Space to flip
                        </p>
                      </div>

                      {/* Back */}
                      <div className="absolute inset-0 backface-hidden rotate-y-180 card-surface rounded-2xl md:rounded-3xl flex flex-col p-6 md:p-10 lg:p-12 min-h-[48vh] overflow-y-auto">
                        <div className="flex justify-between items-start gap-4 mb-4 flex-shrink-0">
                          <h3 className="text-sm font-semibold text-[var(--stint-primary)] uppercase tracking-wider">
                            Definition
                          </h3>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={handleToggleBookmark}
                              className={cn(
                                "p-2.5 rounded-xl transition-all",
                                isCurrentBookmarked
                                  ? "bg-amber-50 text-amber-500 hover:bg-amber-100"
                                  : "bg-[var(--stint-bg)] text-[var(--stint-text-muted)] hover:text-amber-500 hover:bg-amber-50"
                              )}
                              aria-label={isCurrentBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                            >
                              {isCurrentBookmarked ? <BookmarkCheck size={20} strokeWidth={2} /> : <Bookmark size={20} strokeWidth={2} />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); speakTerm(currentCard.term); }}
                              className={cn(
                                "p-2.5 rounded-xl transition-all flex-shrink-0",
                                isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/10"
                              )}
                              aria-label="Play audio"
                            >
                              <Volume2 size={20} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                        <p className="text-lg md:text-xl leading-relaxed text-[var(--stint-text)] mb-6 flex-shrink-0">
                          {currentCard.definition}
                        </p>
                        <div className="space-y-4 flex-shrink-0">
                          <div className="bg-[var(--stint-bg)] p-4 rounded-xl">
                            <h4 className="text-xs font-semibold text-[var(--stint-primary)] uppercase tracking-wider mb-2 flex items-center gap-2">
                              <Lightbulb size={14} /> Example
                            </h4>
                            <p className="text-base text-[var(--stint-text-muted)]">{currentCard.example}</p>
                          </div>
                          <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-100">
                            <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                              <Trophy size={14} /> Quiz tip
                            </h4>
                            <p className="text-base text-emerald-800">{currentCard.quizTip}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`quiz-${currentCard.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-3xl mx-auto min-h-[50vh] flex flex-col card-surface rounded-2xl md:rounded-3xl p-6 md:p-10 lg:p-12 overflow-y-auto"
                  >
                    <div className="flex justify-between items-start gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[var(--stint-text-muted)]">{currentCard.category}</span>
                        {/* Bookmark on quiz card */}
                        <button
                          onClick={handleToggleBookmark}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            isCurrentBookmarked
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-[var(--stint-text-muted)] hover:text-amber-500 hover:bg-amber-50"
                          )}
                          aria-label={isCurrentBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                        >
                          {isCurrentBookmarked ? <BookmarkCheck size={18} strokeWidth={2} /> : <Bookmark size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      <button
                        onClick={isListening ? () => stopListening() : startListening}
                        disabled={!!selectedOption}
                        className={cn(
                          "p-3 rounded-xl transition-all flex-shrink-0",
                          isListening ? "bg-rose-500 text-white" : "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)]",
                          selectedOption && "opacity-50 cursor-not-allowed"
                        )}
                        aria-label={isListening ? "Stop listening" : "Speak answer"}
                      >
                        {isListening ? <MicOff size={24} strokeWidth={2} /> : <Mic size={24} strokeWidth={2} />}
                      </button>
                    </div>

                    <h3 className="text-xl font-semibold text-[var(--stint-text)] mb-4 leading-relaxed">
                      Which term matches this definition?
                    </h3>
                    <p className="text-lg md:text-xl text-[var(--stint-primary)] font-medium mb-8 leading-relaxed">"{currentCard.definition}"</p>

                    {transcription && (
                      <div className="mb-6 p-4 bg-emerald-50/80 rounded-xl border border-emerald-100 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                          <Mic size={16} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Spoken answer</p>
                          <p className="text-sm font-medium text-emerald-900 truncate">"{transcription}"</p>
                          {similarityScore !== null && (
                            <p className="text-xs text-emerald-600 mt-0.5">Match: {similarityScore}%</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Multiple choice options */}
                    <div className="grid grid-cols-1 gap-3">
                      {quizOptions.map((option, idx) => (
                        <button
                          key={option}
                          disabled={!!selectedOption}
                          onClick={() => handleQuizSelect(option)}
                          className={cn(
                            "w-full p-5 rounded-xl text-left text-base font-medium transition-all border flex items-center gap-3",
                            !selectedOption && "border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] hover:border-[var(--stint-primary)] hover:bg-[var(--stint-bg)]",
                            selectedOption === option && option === currentCard.term && "bg-emerald-50 border-emerald-400 text-emerald-800",
                            selectedOption === option && option !== currentCard.term && "bg-rose-50 border-rose-400 text-rose-700",
                            selectedOption && option === currentCard.term && option !== selectedOption && "bg-emerald-50 border-emerald-200 text-emerald-800"
                          )}
                        >
                          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[var(--stint-bg)] border border-[var(--stint-border)] flex items-center justify-center text-xs font-bold text-[var(--stint-text-muted)]">
                            {idx + 1}
                          </span>
                          {option}
                        </button>
                      ))}
                    </div>

                    {/* Type your answer input */}
                    {!selectedOption && (
                      <div className="mt-4 flex gap-2">
                        <input
                          ref={typedInputRef}
                          type="text"
                          value={typedAnswer}
                          onChange={(e) => setTypedAnswer(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleTypedSubmit();
                            }
                          }}
                          placeholder="Or type your answer here..."
                          disabled={!!selectedOption || typedSubmitted}
                          className="flex-1 px-4 py-3 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] text-base text-[var(--stint-text)] placeholder:text-[var(--stint-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:border-transparent disabled:opacity-50"
                        />
                        <button
                          onClick={handleTypedSubmit}
                          disabled={!typedAnswer.trim() || typedSubmitted}
                          className="px-5 py-3 rounded-xl bg-[var(--stint-primary)] text-white font-semibold text-sm hover:bg-[var(--stint-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Submit
                        </button>
                      </div>
                    )}

                    {showExplanation && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-[var(--stint-bg)] rounded-xl text-sm text-[var(--stint-text)] markdown-body"
                      >
                        {isLoadingExplanation ? (
                          <div className="flex items-center gap-2 animate-pulse">
                            <Loader2 size={16} className="animate-spin" />
                            Generating AI insight...
                          </div>
                        ) : (
                          <Markdown>{explanation}</Markdown>
                        )}
                      </motion.div>
                    )}
                    {showExplanation && !isLoadingExplanation && (
                      <>
                        <button
                          type="button"
                          onClick={handleNext}
                          className="mt-4 w-full py-3 rounded-full bg-[var(--stint-primary)] text-white font-semibold text-base focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
                        >
                          Next question &rarr;
                        </button>
                        {/* Show "Review wrong answers" and "Download PDF" at end of quiz */}
                        {quizFinished && wrongAnswers.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={enterReviewMode}
                              className="flex-1 py-3 rounded-full bg-rose-500 text-white font-semibold text-sm hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                            >
                              Review {wrongAnswers.length} wrong answer{wrongAnswers.length !== 1 ? 's' : ''}
                            </button>
                            <button
                              onClick={exportWrongAnswersPDF}
                              className="flex items-center justify-center gap-2 px-5 py-3 rounded-full border-2 border-rose-300 text-rose-600 font-semibold text-sm hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                            >
                              <Download size={16} />
                              Download PDF
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="flex-shrink-0 mt-4 md:mt-6 flex justify-between items-center gap-4">
              <button
                onClick={handlePrev}
                className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-[var(--stint-border)] bg-[var(--stint-bg-elevated)] text-[var(--stint-text)] hover:bg-[var(--stint-bg)] font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2"
              >
                <ChevronLeft size={22} strokeWidth={2} />
                Prev
              </button>

              {/* Spaced-repetition difficulty buttons (flashcard mode, after flip) */}
              {mode === 'flashcard' && isFlipped && (
                <div className="flex gap-2">
                  {DIFFICULTY_BUTTONS.map(({ rating, label, color, bgColor, borderColor }) => (
                    <button
                      key={rating}
                      onClick={() => handleDifficultyRating(rating)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors flex flex-col items-center gap-0.5",
                        borderColor,
                        bgColor,
                        color,
                      )}
                      title={`Rate: ${label} (${rating})`}
                    >
                      <span className="text-xs opacity-60">{rating}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2 focus:ring-offset-[var(--stint-bg)]"
              >
                Next
                <ChevronRight size={22} strokeWidth={2} />
              </button>
            </div>
          </main>
        </div>
      </AppLayout>
    </>
  );
}
