import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Volume2, Mic, Download } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import { useAuth } from '../hooks/useAuth';
import { useTTS } from '../hooks/useTTS';
import type { InterviewEntry } from '../constants';
import { HeaderRightSlot, useBottomNav } from './shared';

async function downloadInterviewPDF(session: {
  candidateName: string;
  role: string;
  company: string;
  questions: { question: string; ideal_answer: string }[];
}) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text('Stint Academy', margin, y); y += 8;
  doc.setFontSize(12).setFont('helvetica', 'normal');
  doc.text('Interview Practice Session', margin, y); y += 6;
  doc.line(margin, y, pageWidth - margin, y); y += 6;

  doc.setFontSize(10);
  doc.text(`Candidate: ${session.candidateName}`, margin, y); y += 5;
  doc.text(`Role: ${session.role}`, margin, y); y += 5;
  doc.text(`Company: ${session.company}`, margin, y); y += 5;
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y);
  y += 10;

  session.questions.forEach((qa, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const questionLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question}`, contentWidth);
    doc.text(questionLines, margin, y);
    y += questionLines.length * 6 + 3;
    doc.setFontSize(10).setFont('helvetica', 'normal');
    const answerLines = doc.splitTextToSize(qa.ideal_answer, contentWidth);
    doc.text(answerLines, margin, y);
    y += answerLines.length * 5 + 8;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  });

  doc.save(`interview-${session.role.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}

interface InterviewSessionProps {
  uploadedInterviewRaw: InterviewEntry[];
  currentUser: AuthUser | null;
  onContentRefresh: () => void;
}

export default function InterviewSession({ uploadedInterviewRaw, currentUser, onContentRefresh }: InterviewSessionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleLogout } = useAuth();
  const { isSpeaking, speakTerm, speakAnswer, stopAudio } = useTTS();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // Get session data from route state
  const routeState = (location.state as {
    sessionQuestions?: InterviewEntry[];
    selectedRole?: string;
    candidateName?: string;
  }) ?? {};

  const [sessionQuestions] = useState<InterviewEntry[]>(routeState.sessionQuestions ?? []);
  const [selectedRole] = useState<string>(routeState.selectedRole ?? '');
  const [candidateName] = useState<string>(routeState.candidateName ?? 'Candidate');

  const [interviewPhase, setInterviewPhase] = useState<'intro' | 'in_progress' | 'complete'>('intro');
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [questionAudioDone, setQuestionAudioDone] = useState(false);
  const [typewriterDisplayed, setTypewriterDisplayed] = useState('');
  const [typewriterSpeed, setTypewriterSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [isPlayingFullSession, setIsPlayingFullSession] = useState(false);
  const interviewChatEndRef = useRef<HTMLDivElement | null>(null);
  const interviewSwipeStartX = useRef<number>(0);
  const interviewSwipeStartY = useRef<number>(0);

  const totalQuestions = sessionQuestions.length;
  const role = selectedRole;
  const name = candidateName;

  const bottomNavProps = useBottomNav('interview');

  const headerRightSlot = (
    <HeaderRightSlot
      currentUser={currentUser}
      canUpload={canUpload}
      onLogout={handleLogout}
      onOpenAdmin={() => setShowAdminPanel(true)}
    />
  );

  // Progress reporting
  useEffect(() => {
    if (!currentUser) return;
    const interviewAnswered = interviewPhase === 'complete'
      ? sessionQuestions.length
      : interviewPhase === 'in_progress'
        ? Math.min(interviewIndex + 1, sessionQuestions.length)
        : 0;

    const payload = {
      module: 'interview',
      total_terms: 0,
      completed_terms: 0,
      quiz_correct: 0,
      quiz_incorrect: 0,
      interview_total: sessionQuestions.length,
      interview_answered: interviewAnswered,
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
  }, [currentUser, interviewPhase, interviewIndex, sessionQuestions.length]);

  // Play question TTS when in_progress
  useEffect(() => {
    if (interviewPhase !== 'in_progress' || sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    setQuestionAudioDone(false);
    setTypewriterDisplayed('');
    const q = sessionQuestions[idx].question;
    speakTerm(q, 0, () => setQuestionAudioDone(true));
  }, [interviewPhase, interviewIndex, sessionQuestions.length]);

  // Scroll chat to bottom
  useEffect(() => {
    if (interviewPhase !== 'in_progress') return;
    interviewChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewPhase, interviewIndex, typewriterDisplayed]);

  // Typewriter effect
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

  // Redirect if no session questions
  if (sessionQuestions.length === 0) {
    const topBarEmpty: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'No questions', showBack: true, onBack: () => { stopAudio(); navigate('/interview'); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBarEmpty} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh]">
            <p className="text-[var(--stint-primary)] font-semibold mb-2">No questions available</p>
            <p className="text-sm text-[var(--stint-text-muted)] mb-4">Try a different role.</p>
            <button onClick={() => navigate('/')} className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--stint-primary)] focus:ring-offset-2">Home</button>
          </div>
        </AppLayout>
      </>
    );
  }

  // Phase: intro
  if (interviewPhase === 'intro') {
    const requestMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((t) => t.stop());
        setMicGranted(true);
      } catch (e) {
        console.warn('Mic access denied', e);
      }
    };
    const beginInterview = () => {
      const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
      speakTerm(greeting, 0, () => setInterviewPhase('in_progress'));
    };
    const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Intro', showBack: true, onBack: () => { stopAudio(); navigate('/interview'); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-[var(--stint-primary)] text-center mb-4">
              Your interview for {role} is about to begin.
            </h1>
            <p className="text-[var(--stint-text)]/70 text-center mb-6 max-w-md">
              We'll use your microphone so you can practice speaking your answers aloud. Click below to allow mic access, then Begin.
            </p>
            {!micGranted ? (
              <button
                onClick={requestMic}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)]"
              >
                <Mic size={20} />
                Allow microphone
              </button>
            ) : (
              <button
                onClick={beginInterview}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium hover:bg-[var(--stint-primary-dark)]"
              >
                Begin
              </button>
            )}
          </div>
        </AppLayout>
      </>
    );
  }

  // Phase: complete
  if (interviewPhase === 'complete') {
    const playFullSession = () => {
      const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
      const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
      const steps: ({ type: 'speak'; text: string } | { type: 'answer'; q: string; a: string })[] = [
        { type: 'speak' as const, text: greeting },
        ...sessionQuestions.flatMap((e) => [
          { type: 'speak' as const, text: e.question },
          { type: 'answer' as const, q: e.question, a: e.ideal_answer },
        ]),
        { type: 'speak' as const, text: closing },
      ];
      let i = 0;
      const next = () => {
        if (i >= steps.length) {
          setIsPlayingFullSession(false);
          return;
        }
        const step = steps[i++];
        if (step.type === 'speak') {
          speakTerm(step.text, 0, next);
        } else {
          speakAnswer(step.q, step.a, 0, next);
        }
      };
      setIsPlayingFullSession(true);
      next();
    };

    const topBarComplete: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Complete', showBack: false, onBack: () => {}, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBarComplete} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
            <h1 className="text-2xl font-serif font-bold text-[var(--stint-primary)] text-center mb-2">
              Thank you for your time, {name}.
            </h1>
            <p className="text-[var(--stint-text)]/70 text-center mb-6">We'll be in touch soon.</p>

            <section className="w-full max-w-sm mb-6">
              <p className="text-sm font-semibold text-[var(--stint-primary)] mb-2">Listen to full session</p>
              <p className="text-xs text-[var(--stint-text)]/60 mb-3">Play greeting, all questions and answers, then closing.</p>
              <button
                onClick={playFullSession}
                disabled={isPlayingFullSession}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium border-2 transition-all",
                  isPlayingFullSession
                    ? "border-[var(--stint-primary)]/50 text-[var(--stint-primary)] bg-[var(--stint-primary)]/10"
                    : "border-[var(--stint-primary)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)] hover:text-white"
                )}
              >
                <Volume2 size={20} />
                {isPlayingFullSession ? 'Playing\u2026' : 'Play full session audio'}
              </button>
            </section>

            <section className="w-full max-w-sm mb-8">
              <p className="text-sm font-semibold text-[var(--stint-primary)] mb-3">How confident do you feel? (optional)</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setFeedbackRating(n)}
                    className={cn(
                      "w-10 h-10 rounded-full font-bold text-sm transition-all",
                      feedbackRating === n ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] hover:border-[var(--stint-primary)]"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => downloadInterviewPDF({ candidateName: name, role, company: (sessionQuestions[0]?.company ?? ''), questions: sessionQuestions.map((q) => ({ question: q.question, ideal_answer: q.ideal_answer })) })}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--stint-primary)] text-white rounded-full font-medium"
              >
                <Download size={16} />
                Download PDF
              </button>
              <button
                onClick={() => {
                  setInterviewPhase('intro');
                  setInterviewIndex(0);
                  setFeedbackRating(null);
                  setIsPlayingFullSession(false);
                }}
                className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium"
              >
                Practice again
              </button>
              <button
                onClick={() => { stopAudio(); navigate('/'); }}
                className="px-6 py-3 rounded-full border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-medium"
              >
                Home
              </button>
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  // Phase: in_progress
  const entry = sessionQuestions[interviewIndex];
  const isLast = interviewIndex >= totalQuestions - 1;
  const idealFull = entry?.ideal_answer ?? '';
  const typewriterDone = typewriterDisplayed.length >= idealFull.length;

  const goNext = () => {
    if (isLast) {
      const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
      speakTerm(closing, 0, () => setInterviewPhase('complete'));
    } else {
      setInterviewIndex((i) => i + 1);
    }
  };
  const goPrev = () => {
    if (interviewIndex > 0) setInterviewIndex((i) => i - 1);
  };

  const topBarInProgress: GlobalTopBarProps = {
    sectionLabel: 'Interview Practice',
    stepLabel: `Question ${interviewIndex + 1} of ${totalQuestions}`,
    showBack: true,
    onBack: () => { stopAudio(); setInterviewPhase('intro'); },
    onHome: () => { stopAudio(); navigate('/'); },
    rightSlot: headerRightSlot,
  };

  const SWIPE_THRESHOLD = 60;
  const handleTouchStart = (e: React.TouchEvent) => {
    interviewSwipeStartX.current = e.touches[0].clientX;
    interviewSwipeStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - interviewSwipeStartX.current;
    const deltaY = endY - interviewSwipeStartY.current;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (deltaX > 0) goNext();
    else goPrev();
  };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBarInProgress} bottomNav={bottomNavProps}>
        <div className="w-full max-w-2xl mx-auto px-4 flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between py-3 mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--stint-text-muted)]">Speed:</span>
              {(['slow', 'medium', 'fast'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setTypewriterSpeed(s)}
                  className={cn("px-2 py-1 rounded text-xs font-medium", typewriterSpeed === s ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)]")}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <main
            className="flex-1 min-h-0 w-full flex flex-col overflow-hidden touch-pan-y -mx-4 px-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <p className="flex-shrink-0 text-[10px] text-[var(--stint-text-muted)] text-center py-1 md:hidden">Swipe right &rarr; next &middot; Swipe left &rarr; previous</p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
              {sessionQuestions.slice(0, interviewIndex + 1).map((item, i) => {
                const isCurrent = i === interviewIndex;
                const answerText = isCurrent ? typewriterDisplayed : item.ideal_answer;
                const showCursor = isCurrent && questionAudioDone && !typewriterDone;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-sm overflow-hidden"
                  >
                    <div className="p-4 border-b border-[var(--stint-border)] bg-[var(--stint-bg)]/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-1">Q{i + 1}</p>
                      <p className="text-base font-serif font-semibold text-[var(--stint-primary)]">{item.question}</p>
                      <button
                        onClick={() => speakTerm(item.question)}
                        className={cn("mt-2 p-1.5 rounded-full", isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg-elevated)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/20 border border-[var(--stint-border)]")}
                        title="Play question"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                    <div className="p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-primary)] mb-1">Answer</p>
                      <p className="text-sm leading-relaxed text-[var(--stint-text)] whitespace-pre-wrap">
                        {answerText}
                        {showCursor && <span className="inline-block w-2 h-3.5 ml-0.5 bg-[var(--stint-primary)] animate-pulse align-middle" aria-hidden="true" />}
                      </p>
                      <button
                        onClick={() => speakAnswer(item.question, item.ideal_answer)}
                        className={cn("mt-2 p-1.5 rounded-full", isSpeaking ? "bg-[var(--stint-primary)] text-white" : "bg-[var(--stint-bg)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)]/20 border border-[var(--stint-border)]")}
                        title="Play answer"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={interviewChatEndRef} />
            </div>

            <div className="flex-shrink-0 py-3 flex justify-end">
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] font-medium"
              >
                {isLast ? 'Finish' : 'Next'}
                <ChevronRight size={20} />
              </button>
            </div>
          </main>
        </div>
      </AppLayout>
    </>
  );
}
