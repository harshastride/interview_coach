import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Volume2, Video, VideoOff, Download } from 'lucide-react';
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
import InterviewAvatar from '../components/InterviewAvatar';
import type { AvatarState } from '../components/InterviewAvatar';

/* ── PDF export ───────────────────────────────────────── */
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
    const qLines = doc.splitTextToSize(`Q${i + 1}. ${qa.question}`, contentWidth);
    doc.text(qLines, margin, y); y += qLines.length * 6 + 3;
    doc.setFontSize(10).setFont('helvetica', 'normal');
    const aLines = doc.splitTextToSize(qa.ideal_answer, contentWidth);
    doc.text(aLines, margin, y); y += aLines.length * 5 + 8;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y); y += 6;
  });

  doc.save(`interview-${session.role.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}

/* ── Component ────────────────────────────────────────── */
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
  const [cameraOn, setCameraOn] = useState(true);
  const [isPlayingFullSession, setIsPlayingFullSession] = useState(false);
  const [slideDir, setSlideDir] = useState(1);
  const [startTime] = useState(() => Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

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

  /* ── Avatar state ───────────────────────────────────── */
  const avatarState: AvatarState = useMemo(() => {
    if (isSpeaking) return 'speaking';
    if (interviewPhase === 'in_progress' && questionAudioDone) return 'listening';
    if (interviewPhase === 'in_progress') return 'idle';
    return 'thinking';
  }, [isSpeaking, questionAudioDone, interviewPhase]);

  /* ── Camera management ──────────────────────────────── */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setMicGranted(true);
      setCameraOn(true);
    } catch {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = audioStream;
        setMicGranted(true);
        setCameraOn(false);
      } catch {
        console.warn('Camera/mic access denied');
      }
    }
  };

  const toggleCamera = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOn((prev) => !prev);
  };

  useEffect(() => {
    if (videoRef.current && mediaStreamRef.current) videoRef.current.srcObject = mediaStreamRef.current;
  }, [interviewPhase]);

  useEffect(() => () => { mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  /* ── Progress reporting ─────────────────────────────── */
  useEffect(() => {
    if (!currentUser) return;
    const answered = interviewPhase === 'complete'
      ? sessionQuestions.length
      : interviewPhase === 'in_progress' ? Math.min(interviewIndex + 1, sessionQuestions.length) : 0;
    const timer = setTimeout(() => {
      fetch('/api/progress', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ module: 'interview', total_terms: 0, completed_terms: 0, quiz_correct: 0, quiz_incorrect: 0, interview_total: sessionQuestions.length, interview_answered: answered }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [currentUser, interviewPhase, interviewIndex, sessionQuestions.length]);

  /* ── Play question TTS on index change ──────────────── */
  useEffect(() => {
    if (interviewPhase !== 'in_progress' || sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    setQuestionAudioDone(false);
    setTypewriterDisplayed('');
    const q = sessionQuestions[idx].question;
    speakTerm(q, 0, () => setQuestionAudioDone(true));
  }, [interviewPhase, interviewIndex, sessionQuestions.length]);

  /* ── Typewriter effect (starts after question TTS) ──── */
  const typewriterMs = { slow: 120, medium: 60, fast: 30 }[typewriterSpeed];
  useEffect(() => {
    if (interviewPhase !== 'in_progress' || !questionAudioDone) return;
    if (sessionQuestions.length === 0) return;
    const idx = interviewIndex;
    if (idx < 0 || idx >= sessionQuestions.length) return;
    const full = sessionQuestions[idx].ideal_answer;
    if (typewriterDisplayed.length >= full.length) return;
    const t = setTimeout(() => {
      setTypewriterDisplayed((prev) => full.slice(0, prev.length + 1));
    }, typewriterMs);
    return () => clearTimeout(t);
  }, [interviewPhase, questionAudioDone, interviewIndex, sessionQuestions, typewriterDisplayed, typewriterMs]);

  /* ── Navigation ─────────────────────────────────────── */
  const goNext = () => {
    if (interviewIndex >= totalQuestions - 1) {
      const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
      speakTerm(closing, 0, () => setInterviewPhase('complete'));
    } else {
      setSlideDir(1);
      setInterviewIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (interviewIndex > 0) {
      setSlideDir(-1);
      setInterviewIndex((i) => i - 1);
    }
  };

  /* ── Swipe gestures ─────────────────────────────────── */
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) goNext(); else goPrev();
  };

  /* ── No questions fallback ──────────────────────────── */
  if (sessionQuestions.length === 0) {
    const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'No questions', showBack: true, onBack: () => { stopAudio(); navigate('/interview'); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[50vh]">
            <p className="text-[var(--stint-primary)] font-semibold mb-2">No questions available</p>
            <button onClick={() => navigate('/')} className="px-6 py-3 rounded-full bg-[var(--stint-primary)] text-white font-medium">Home</button>
          </div>
        </AppLayout>
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: INTRO
     ═══════════════════════════════════════════════════════ */
  if (interviewPhase === 'intro') {
    const beginInterview = () => {
      const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
      speakTerm(greeting, 0, () => setInterviewPhase('in_progress'));
    };
    const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Setup', showBack: true, onBack: () => { stopAudio(); navigate('/interview'); }, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };
    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col items-center">
            <div className="w-full flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex-1 aspect-video rounded-2xl overflow-hidden border border-[var(--stint-border)] shadow-lg">
                <InterviewAvatar state={isSpeaking ? 'speaking' : 'idle'} />
              </div>
              <div className="flex-1 aspect-video rounded-2xl overflow-hidden border border-[var(--stint-border)] shadow-lg bg-slate-900 flex items-center justify-center">
                {micGranted && cameraOn ? (
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                ) : (
                  <div className="text-center text-slate-400">
                    <Video size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Camera preview</p>
                  </div>
                )}
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-serif font-bold text-[var(--stint-primary)] text-center mb-2">
              Interview Practice: {role}
            </h1>
            <p className="text-sm text-[var(--stint-text-muted)] text-center mb-1">
              {totalQuestions} questions &middot; Listen and read along
            </p>
            <p className="text-xs text-[var(--stint-text-muted)] text-center mb-6 max-w-sm">
              Turn on your camera to simulate a real video interview. Listen to questions and read through answers to learn the terminology.
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              {!micGranted ? (
                <button onClick={startCamera} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold text-base hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg">
                  <Video size={20} /> Allow Camera & Mic
                </button>
              ) : (
                <button onClick={beginInterview} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold text-base hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg shadow-[var(--stint-primary)]/25">
                  Begin Interview <ChevronRight size={20} />
                </button>
              )}
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: COMPLETE
     ═══════════════════════════════════════════════════════ */
  if (interviewPhase === 'complete') {
    const elapsed = Math.round((Date.now() - startTime) / 60000);
    const playFullSession = () => {
      const greeting = `Hi ${name}, welcome to your interview for ${role}. Let's begin.`;
      const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
      const steps: ({ type: 'speak'; text: string } | { type: 'answer'; q: string; a: string })[] = [
        { type: 'speak', text: greeting },
        ...sessionQuestions.flatMap((e) => [
          { type: 'speak' as const, text: e.question },
          { type: 'answer' as const, q: e.question, a: e.ideal_answer },
        ]),
        { type: 'speak', text: closing },
      ];
      let i = 0;
      const next = () => {
        if (i >= steps.length) { setIsPlayingFullSession(false); return; }
        const step = steps[i++];
        if (step.type === 'speak') speakTerm(step.text, 0, next);
        else speakAnswer(step.q, step.a, 0, next);
      };
      setIsPlayingFullSession(true);
      next();
    };

    const topBar: GlobalTopBarProps = { sectionLabel: 'Interview Practice', stepLabel: 'Complete', showBack: false, onBack: () => {}, onHome: () => { stopAudio(); navigate('/'); }, rightSlot: headerRightSlot };

    return (
      <>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
        <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
          <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-5">
            {/* Session summary */}
            <div className="rounded-2xl bg-gradient-to-br from-[var(--stint-primary)]/10 to-[var(--stint-primary)]/5 border border-[var(--stint-primary)]/20 p-6 text-center">
              <h1 className="text-2xl font-serif font-bold text-[var(--stint-primary)] mb-1">Great practice, {name}!</h1>
              <p className="text-sm text-[var(--stint-text-muted)] mb-4">Session complete</p>
              <div className="flex justify-center gap-6">
                <div>
                  <div className="text-2xl font-bold text-[var(--stint-primary)]">{totalQuestions}</div>
                  <div className="text-xs text-[var(--stint-text-muted)]">Questions</div>
                </div>
                <div className="w-px bg-[var(--stint-border)]" />
                <div>
                  <div className="text-2xl font-bold text-[var(--stint-primary)]">{elapsed || '<1'}</div>
                  <div className="text-xs text-[var(--stint-text-muted)]">Minutes</div>
                </div>
                <div className="w-px bg-[var(--stint-border)]" />
                <div>
                  <div className="text-2xl font-bold text-[var(--stint-primary)]">{role}</div>
                  <div className="text-xs text-[var(--stint-text-muted)]">Role</div>
                </div>
              </div>
            </div>

            {/* Full session audio */}
            <button
              onClick={playFullSession}
              disabled={isPlayingFullSession}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-base border-2 transition-all',
                isPlayingFullSession
                  ? 'border-[var(--stint-primary)]/50 text-[var(--stint-primary)] bg-[var(--stint-primary)]/10'
                  : 'border-[var(--stint-primary)] text-[var(--stint-primary)] hover:bg-[var(--stint-primary)] hover:text-white',
              )}
            >
              <Volume2 size={20} className={isPlayingFullSession ? 'animate-pulse' : ''} />
              {isPlayingFullSession ? 'Playing session...' : 'Replay Full Session'}
            </button>

            {/* Confidence rating */}
            <div className="text-center">
              <p className="text-sm font-semibold text-[var(--stint-text)] mb-3">How confident do you feel?</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setFeedbackRating(n)} className={cn('w-11 h-11 rounded-xl font-bold text-sm transition-all', feedbackRating === n ? 'bg-[var(--stint-primary)] text-white shadow-lg shadow-[var(--stint-primary)]/25' : 'bg-[var(--stint-bg-elevated)] border border-[var(--stint-border)] hover:border-[var(--stint-primary)]')}>{n}</button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => downloadInterviewPDF({ candidateName: name, role, company: sessionQuestions[0]?.company ?? '', questions: sessionQuestions.map((q) => ({ question: q.question, ideal_answer: q.ideal_answer })) })} className="flex items-center gap-2 px-5 py-2.5 bg-[var(--stint-primary)] text-white rounded-2xl font-semibold shadow-lg">
                <Download size={16} /> Download PDF
              </button>
              <button onClick={() => { setInterviewPhase('intro'); setInterviewIndex(0); setFeedbackRating(null); setIsPlayingFullSession(false); }} className="px-5 py-2.5 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold shadow-lg">Practice Again</button>
              <button onClick={() => { stopAudio(); navigate('/interview'); }} className="px-5 py-2.5 rounded-2xl border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-semibold">New Topics</button>
              <button onClick={() => { stopAudio(); navigate('/'); }} className="px-5 py-2.5 rounded-2xl border-2 border-[var(--stint-border)] text-[var(--stint-text-muted)] font-semibold">Home</button>
            </div>
          </div>
        </AppLayout>
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: IN PROGRESS
     ═══════════════════════════════════════════════════════ */
  const entry = sessionQuestions[interviewIndex];
  const idealFull = entry?.ideal_answer ?? '';
  const typewriterDone = typewriterDisplayed.length >= idealFull.length;
  const isLast = interviewIndex >= totalQuestions - 1;

  const topBar: GlobalTopBarProps = {
    sectionLabel: 'Interview Practice',
    stepLabel: `Q${interviewIndex + 1} of ${totalQuestions}`,
    showBack: true,
    onBack: () => { stopAudio(); setInterviewPhase('intro'); },
    onHome: () => { stopAudio(); navigate('/'); },
    rightSlot: headerRightSlot,
  };

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="w-full max-w-3xl mx-auto flex flex-col h-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* ── Progress bar ─────────────────────────────── */}
          <div className="flex-shrink-0 px-4 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 rounded-full bg-[var(--stint-border)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--stint-primary)] to-[var(--stint-accent)]"
                  initial={false}
                  animate={{ width: `${((interviewIndex + 1) / totalQuestions) * 100}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <span className="text-xs font-semibold text-[var(--stint-text-muted)] tabular-nums">{interviewIndex + 1}/{totalQuestions}</span>
            </div>
          </div>

          {/* ── Video split: Avatar + Webcam ──────────────── */}
          <div className="flex-shrink-0 px-4 pb-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 aspect-video rounded-2xl overflow-hidden border border-[var(--stint-border)] shadow-md">
                <InterviewAvatar state={avatarState} />
              </div>
              <div className="flex-1 aspect-video rounded-2xl overflow-hidden border border-[var(--stint-border)] shadow-md bg-slate-900 relative">
                {cameraOn ? (
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500"><VideoOff size={28} /></div>
                )}
                <button onClick={toggleCamera} className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors" title={cameraOn ? 'Turn off camera' : 'Turn on camera'}>
                  {cameraOn ? <Video size={14} /> : <VideoOff size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* ── Question / Answer area ────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={interviewIndex}
                initial={{ opacity: 0, x: slideDir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDir * -40 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-sm overflow-hidden"
              >
                {/* Question */}
                <div className="p-5 pb-3 border-b border-[var(--stint-border)] bg-[var(--stint-bg)]/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-primary)]">Question {interviewIndex + 1}</span>
                    {entry.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--stint-primary)]/10 text-[var(--stint-primary)] font-medium">{entry.category}</span>
                    )}
                  </div>
                  <p className="text-base md:text-lg font-serif font-semibold text-[var(--stint-text)] leading-relaxed">{entry.question}</p>
                  <button
                    onClick={() => speakTerm(entry.question)}
                    className={cn('mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all', isSpeaking ? 'bg-[var(--stint-primary)] text-white' : 'bg-[var(--stint-bg-elevated)] text-[var(--stint-primary)] border border-[var(--stint-border)] hover:border-[var(--stint-primary)]')}
                  >
                    <Volume2 size={16} className={isSpeaking ? 'animate-pulse' : ''} />
                    {isSpeaking ? 'Playing...' : 'Listen to Question'}
                  </button>
                </div>

                {/* Answer — appears after question TTS finishes */}
                {questionAudioDone && (
                  <div className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">Answer</p>
                    <p className="text-lg md:text-xl leading-relaxed text-[var(--stint-text)] whitespace-pre-wrap">
                      {typewriterDisplayed}
                      {!typewriterDone && (
                        <span className="inline-block w-2 h-4 ml-0.5 bg-[var(--stint-primary)] animate-pulse align-middle" aria-hidden="true" />
                      )}
                    </p>

                    {typewriterDone && (
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={() => speakAnswer(entry.question, entry.ideal_answer)}
                          className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all', isSpeaking ? 'bg-[var(--stint-primary)] text-white' : 'bg-[var(--stint-bg-elevated)] text-[var(--stint-primary)] border border-[var(--stint-border)] hover:border-[var(--stint-primary)]')}
                        >
                          <Volume2 size={16} className={isSpeaking ? 'animate-pulse' : ''} />
                          {isSpeaking ? 'Playing...' : 'Listen to Answer'}
                        </button>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] text-[var(--stint-text-muted)]">Speed</span>
                          {(['slow', 'medium', 'fast'] as const).map((s) => (
                            <button key={s} onClick={() => setTypewriterSpeed(s)} className={cn('px-2 py-1 rounded-lg text-[10px] font-semibold transition-all', typewriterSpeed === s ? 'bg-[var(--stint-primary)] text-white' : 'text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)]')}>{s}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Coaching prompt */}
                <div className="px-5 pb-4">
                  <p className="text-xs text-[var(--stint-text-muted)] italic">
                    {!questionAudioDone
                      ? 'Listening to the question...'
                      : !typewriterDone
                        ? 'Read through the answer to learn the terminology'
                        : 'Tap "Next Question" when ready to continue'}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Bottom action buttons ─────────────────────── */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3">
            <button
              onClick={goPrev}
              disabled={interviewIndex === 0}
              className={cn('p-3 rounded-xl transition-all', interviewIndex === 0 ? 'text-[var(--stint-text-muted)]/30 cursor-not-allowed' : 'text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg)] border border-[var(--stint-border)]')}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold text-base hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg shadow-[var(--stint-primary)]/20"
            >
              {isLast ? 'Finish Interview' : <>Next Question <ChevronRight size={18} /></>}
            </button>
          </div>
        </div>
      </AppLayout>
    </>
  );
}
