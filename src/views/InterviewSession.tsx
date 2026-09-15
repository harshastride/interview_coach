import ReadingDeliveryCoach from '../components/ReadingDeliveryCoach';
import MicrophoneCheck from '../components/MicrophoneCheck';
import ReadingNextStep from '../components/ReadingNextStep';
import ReadingAssessmentDetails from '../components/ReadingAssessmentDetails';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Volume2, Video, VideoOff, Download, Mic, Square, RefreshCw, Loader2, TrendingUp } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppLayout } from '../components/GlobalNav';
import type { GlobalTopBarProps } from '../components/GlobalNav';
import AdminPanel from '../components/AdminPanel';
import type { AuthUser } from '../hooks/useAuth';
import { useAuth } from '../hooks/useAuth';
import { useTTS } from '../hooks/useTTS';
import { useAnswerRecorder, analyzeReading, saveReadingAttempt, MAX_RECORDING_SEC } from '../hooks/useAnswerRecorder';
import type { ReadingAnalysis, RecordingResult } from '../hooks/useAnswerRecorder';
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

/* ── Reading practice score bar ───────────────────────── */
function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-[10px] font-semibold text-[var(--stint-text-muted)] mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--stint-border)] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-400')}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

type PracticeState = 'idle' | 'starting' | 'recording' | 'analyzing' | 'feedback';

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
    revisionFocus?: { words: string[]; improvements: string[] };
  }) ?? {};

  const [sessionQuestions] = useState<InterviewEntry[]>((routeState.sessionQuestions ?? []).filter(q=>!q.id||uploadedInterviewRaw.some(p=>p.id===q.id)).map(q=>uploadedInterviewRaw.find(p=>q.id&&p.id===q.id)??q));
  const [selectedRole] = useState<string>(routeState.selectedRole ?? '');
  const [candidateName] = useState<string>(routeState.candidateName ?? 'Candidate');

  const [interviewPhase, setInterviewPhase] = useState<'intro' | 'in_progress' | 'complete'>('intro');
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [questionAudioDone, setQuestionAudioDone] = useState(false);
  const [typewriterDisplayed, setTypewriterDisplayed] = useState('');
  const [typewriterSpeed, setTypewriterSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [wantCamera, setWantCamera] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [micError, setMicError] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const pendingSave = useRef<Parameters<typeof saveReadingAttempt>[0] | null>(null);
  const persistReport = async (payload: Parameters<typeof saveReadingAttempt>[0]) => {
    pendingSave.current = payload; setSaveStatus('saving');
    try { await saveReadingAttempt(payload); if (pendingSave.current === payload) setSaveStatus('saved'); }
    catch { if (pendingSave.current === payload) setSaveStatus('error'); }
  };
  useEffect(() => () => { if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);
  const [isPlayingFullSession, setIsPlayingFullSession] = useState(false);
  const [slideDir, setSlideDir] = useState(1);
  const [startTime] = useState(() => Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readingPaneRef = useRef<HTMLDivElement | null>(null);
  const readingCursorRef = useRef<HTMLSpanElement | null>(null);
  const [followReading, setFollowReading] = useState(true);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  /* ── Reading practice state ─────────────────────────── */
  const [practiceState, setPracticeState] = useState<PracticeState>('idle');
  const [analysis, setAnalysis] = useState<ReadingAnalysis | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [attemptScores, setAttemptScores] = useState<Record<number, number[]>>({});
  const practiceVersion = useRef(0);
  const hasHybridAssessment = useRef(false);
  const readyQuestionRef = useRef<number | null>(null);
  const autoStartedRef = useRef(false);

  const handleRecordingComplete = useCallback(async (rec: RecordingResult) => {
    const version = practiceVersion.current;
    const entry = sessionQuestions[interviewIndex];
    if (!entry) { setPracticeState('idle'); return; }
    if (rec.durationSec < 2) {
      setPracticeError("That was too short — we couldn't hear you. Try again.");
      setPracticeState('idle');
      return;
    }
    setRecordingUrl(URL.createObjectURL(rec.blob));
    setPracticeState('analyzing');
    let result: ReadingAnalysis | null;
    try { result = await analyzeReading(rec, entry.ideal_answer, entry.question, entry.id); }
    catch (error) {
      if (version !== practiceVersion.current) return;
      setPracticeError(error instanceof Error ? error.message : 'Analysis failed. Please try again.');
      setPracticeState('idle'); return;
    }
    // Navigation/cancellation must not show the previous question's metrics.
    if (version !== practiceVersion.current) return;
    if (!result) {
      setPracticeError('Analysis failed — please try reading again.');
      setPracticeState('idle');
      return;
    }
    if (!result.transcript.trim()) {
      setPracticeError("We couldn't hear any speech — check your mic and try again.");
      setPracticeState('idle');
      return;
    }
    const attemptNo = (attemptScores[interviewIndex]?.length ?? 0) + 1;
    if (result.assessment) hasHybridAssessment.current = true;
    setAnalysis(result);
    setAttemptScores((prev) => ({
      ...prev,
      [interviewIndex]: [...(prev[interviewIndex] ?? []), result.scores.overall],
    }));
    setPracticeState('feedback');
    void persistReport({ submissionId: crypto.randomUUID(), contentId:entry.id, question_ref: entry.question, role: selectedRole, attempt_no: attemptNo, analysis: result });
  }, [sessionQuestions, interviewIndex, attemptScores, selectedRole]);

  const recorder = useAnswerRecorder(handleRecordingComplete);

  const beginReading = async () => {
    if (practiceState === 'starting' || practiceState === 'recording' || practiceState === 'analyzing') return;
    const version = ++practiceVersion.current;
    stopAudio();
    playbackRef.current?.pause();
    if (saveStatus === 'saving' || saveStatus === 'error') return;
    setPracticeError(null);
    setAnalysis(null);
    setPracticeState('starting');
    try {
      await recorder.start(mediaStreamRef.current);
      if (version !== practiceVersion.current) return;
      setPracticeState('recording');
    } catch {
      if (version !== practiceVersion.current) return;
      setPracticeError('Could not access the microphone. Check browser permissions and try again.');
      setPracticeState('idle');
    }
  };

  const resetPractice = useCallback(() => {
    practiceVersion.current += 1;
    recorder.cancel();
    playbackRef.current?.pause();
    setRecordingUrl('');
    pendingSave.current = null; setSaveStatus('idle');
    setPracticeState('idle');
    setAnalysis(null);
    setPracticeError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.cancel]);

  useEffect(() => () => { practiceVersion.current += 1; }, []);

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
    if (practiceState === 'analyzing') return 'thinking';
    if (interviewPhase === 'in_progress' && questionAudioDone) return 'listening';
    if (interviewPhase === 'in_progress') return 'idle';
    return 'thinking';
  }, [isSpeaking, questionAudioDone, interviewPhase, practiceState]);

  /* ── Camera management ──────────────────────────────── */
  const startCamera = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: wantCamera, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setMicGranted(true);
      setCameraOn(wantCamera);
    } catch {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = audioStream;
        setMicGranted(true);
        setCameraOn(false);
      } catch {
        setMicError('Microphone access was denied. Allow it in your browser settings, then try again.');
      }
    }
  };

  const toggleCamera = () => {
    if (!mediaStreamRef.current || !mediaStreamRef.current.getVideoTracks().length) return;
    mediaStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOn((prev) => !prev);
  };

  useEffect(() => {
    if (videoRef.current && mediaStreamRef.current) videoRef.current.srcObject = mediaStreamRef.current;
  }, [interviewPhase, cameraOn, micGranted]);

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
    readyQuestionRef.current = null;
    autoStartedRef.current = false;
    setTypewriterDisplayed('');
    setFollowReading(true);
    if (readingPaneRef.current) readingPaneRef.current.scrollTop = 0;
    resetPractice();
    const q = sessionQuestions[idx].question;
    let active = true;
    speakTerm(q, 0, () => {
      if (!active) return;
      readyQuestionRef.current = idx;
      setQuestionAudioDone(true);
    });
    return () => { active = false; };
  }, [interviewPhase, interviewIndex, sessionQuestions.length]);

  // Begin one recording per question as its answer starts revealing.
  // Cancel/errors leave the user in control; retries are explicit.
  useEffect(() => {
    if (interviewPhase !== 'in_progress' || !questionAudioDone ||
        readyQuestionRef.current !== interviewIndex || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (recorder.isSupported && sessionQuestions[interviewIndex]?.ideal_answer.trim()) {
      void beginReading();
    }
  }, [interviewPhase, questionAudioDone, interviewIndex]);

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

  useEffect(() => {
    const pane = readingPaneRef.current;
    const cursor = readingCursorRef.current;
    if (!followReading || !pane || !cursor) return;
    // Scroll only the reading pane, leaving metrics and controls in place.
    const bottom = cursor.getBoundingClientRect().bottom;
    const visibleBottom = pane.getBoundingClientRect().bottom - 28;
    if (bottom > visibleBottom) pane.scrollTop += bottom - visibleBottom;
  }, [typewriterDisplayed, followReading]);

  /* ── Navigation ─────────────────────────────────────── */
  const goNext = () => {
    if (saveStatus === "saving" || saveStatus === "error") return;
    resetPractice();
    if (interviewIndex >= totalQuestions - 1) {
      const closing = `Thank you for your time, ${name}. We'll be in touch soon.`;
      speakTerm(closing, 0, () => setInterviewPhase('complete'));
    } else {
      setSlideDir(1);
      setInterviewIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (saveStatus === "saving" || saveStatus === "error") return;
    if (interviewIndex > 0) {
      resetPractice();
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
            <div className="w-full max-w-xs flex flex-row gap-3 mb-6">
              <div className="flex-1 aspect-video rounded-2xl overflow-hidden border border-[var(--stint-border)] shadow-lg">
                <InterviewAvatar state={isSpeaking ? 'speaking' : 'idle'} compact />
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
              Listen to each question. Recording starts automatically when the answer appears. Read aloud, then press Done for coaching on your next attempt.
            </p>
            {routeState.revisionFocus && (routeState.revisionFocus.words.length > 0 || routeState.revisionFocus.improvements.length > 0) && <div className="w-full mb-5"><ReadingNextStep feedback={{missed_words:routeState.revisionFocus.words, improvements:routeState.revisionFocus.improvements}} onListen={word => speakTerm(word)} /></div>}
            <details className="w-full mb-5 rounded-xl border border-[var(--stint-border)] p-3"><summary className="cursor-pointer text-sm font-semibold">Prepare a natural delivery before recording</summary><div className="mt-3"><ReadingDeliveryCoach key={interviewIndex} feedback={{}} reference={sessionQuestions[interviewIndex]?.ideal_answer} onListen={sampleBusy ? undefined : sentence => speakTerm(sentence)} /></div></details>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              {!micGranted && <label className="text-sm"><input type="checkbox" checked={wantCamera} onChange={e=>setWantCamera(e.target.checked)} /> Enable camera preview (optional)</label>}
              {micError && <p role="alert" className="text-sm">{micError}</p>}
              {micGranted && mediaStreamRef.current && <MicrophoneCheck stream={mediaStreamRef.current} onBusy={setSampleBusy} />}
              {!micGranted ? (
                <button onClick={startCamera} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold text-base hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg">
                  <Mic size={20} /> {wantCamera ? "Allow Camera & Mic" : "Allow microphone"}
                </button>
              ) : (
                <button disabled={sampleBusy} onClick={beginInterview} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold text-base hover:bg-[var(--stint-primary-dark)] transition-all shadow-lg shadow-[var(--stint-primary)]/25">
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
    const practicedBest = Object.values(attemptScores).map((scores) => Math.max(...scores));
    const totalReps = Object.values(attemptScores).reduce((sum, scores) => sum + scores.length, 0);
    const avgBestScore = practicedBest.length
      ? Math.round(practicedBest.reduce((a, b) => a + b, 0) / practicedBest.length)
      : null;
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
                {!hasHybridAssessment.current && avgBestScore !== null && (
                  <>
                    <div className="w-px bg-[var(--stint-border)]" />
                    <div>
                      <div className={cn('text-2xl font-bold', avgBestScore >= 80 ? 'text-emerald-500' : avgBestScore >= 60 ? 'text-amber-500' : 'text-red-400')}>{avgBestScore}</div>
                      <div className="text-xs text-[var(--stint-text-muted)]">Avg Score</div>
                    </div>
                    <div className="w-px bg-[var(--stint-border)]" />
                    <div>
                      <div className="text-2xl font-bold text-[var(--stint-primary)]">{totalReps}</div>
                      <div className="text-xs text-[var(--stint-text-muted)]">Readings</div>
                    </div>
                  </>
                )}
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
  const questionAttempts = attemptScores[interviewIndex] ?? [];

  const topBar: GlobalTopBarProps = {
    sectionLabel: 'Interview Practice',
    stepLabel: `Q${interviewIndex + 1} of ${totalQuestions}`,
    showBack: true,
    onBack: () => { resetPractice(); stopAudio(); setInterviewPhase('intro'); },
    onHome: () => { stopAudio(); navigate('/'); },
    rightSlot: headerRightSlot,
  };

  const captureActive = practiceState === 'recording' || practiceState === 'starting';
  const buttonStyle = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--stint-border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--stint-bg)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--stint-primary)]';

  return (
    <>
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} currentUser={currentUser} onContentRefresh={onContentRefresh} />}
      <AppLayout topBar={topBar} bottomNav={bottomNavProps}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-3 p-3 xl:gap-4 xl:p-6 md:min-h-[580px]">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--stint-primary)]">Reading studio · Guided practice</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Explain the idea, one phrase at a time.</h2>
              <p className="mt-1 text-xs text-[var(--stint-text-muted)]">{role} · Question {interviewIndex + 1} of {totalQuestions}</p>
            </div>
            <div className="flex items-center gap-2" aria-label="Session participants">
              <div className="relative h-[76px] w-[112px] overflow-hidden rounded-xl border border-[var(--stint-border)] bg-slate-900">
                <InterviewAvatar state={avatarState} compact />
                <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] text-white">AI coach</span>
              </div>
              <div className="relative h-[76px] w-[112px] overflow-hidden rounded-xl border border-[var(--stint-border)] bg-slate-900">
                {cameraOn ? <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover scale-x-[-1]" /> : <div className="flex h-full items-center justify-center text-slate-400"><VideoOff size={20} /></div>}
                <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] text-white">You</span>
                <button disabled={!mediaStreamRef.current?.getVideoTracks().length} onClick={toggleCamera} aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'} className="absolute right-1 bottom-1 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80">
                  {cameraOn ? <Video size={13} /> : <VideoOff size={13} />}
                </button>
              </div>
            </div>
          </header>
          <div role="progressbar" aria-label="Interview progress" aria-valuemin={0} aria-valuemax={totalQuestions} aria-valuenow={interviewIndex + 1} className="h-1 shrink-0 overflow-hidden rounded-full bg-[var(--stint-border)]">
            <div className="h-full rounded-full bg-[var(--stint-primary)] transition-all" style={{ width: `${((interviewIndex + 1) / totalQuestions) * 100}%` }} />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] px-4 py-3 text-xs" aria-label="Practice steps">
            {['Read aloud', 'Review feedback', 'Practise again'].map((step, index) => <span key={step} className={cn('flex items-center gap-2', (practiceState === 'feedback' ? index === 1 : index === 0) ? 'font-semibold text-[var(--stint-primary)]' : 'text-[var(--stint-text-muted)]')}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--stint-bg)]">{index + 1}</span>{step}</span>)}
            <span className="ml-auto text-[var(--stint-text-muted)]">Answer stays visible · Read at your own pace</span>
          </div>
          <div className="grid flex-1 gap-4 md:min-h-[440px] md:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)] xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
            <section aria-label="Reading text" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-sm md:min-h-0">
              <div className="shrink-0 border-b border-[var(--stint-border)] p-4 xl:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--stint-text-muted)]">Question {String(interviewIndex + 1).padStart(2, '0')}</span>
                  {entry.category && <span className="rounded-full bg-[var(--stint-primary)]/5 px-2.5 py-1 text-[10px] font-medium text-[var(--stint-primary)]">{entry.category}</span>}
                </div>
                <div className="flex items-start gap-2">
                  <h3 className="flex-1 text-base xl:text-lg font-semibold leading-snug tracking-tight">{entry.question}</h3>
                  <button onClick={() => speakTerm(entry.question)} disabled={captureActive} title="Listen to Question" className={`${buttonStyle} shrink-0 !px-2`}><Volume2 size={14} /><span className="sr-only">Listen to Question</span></button>
                </div>
              </div>
              <div ref={readingPaneRef} className="min-h-[220px] flex-1 overflow-y-auto p-4 xl:p-6" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">Read aloud</p>
                  <div className="flex items-center gap-1 rounded-lg bg-[var(--stint-bg)] p-1" aria-label="Text reveal speed">
                    {(['slow', 'medium', 'fast'] as const).map((speed) => <button key={speed} onClick={() => setTypewriterSpeed(speed)} aria-pressed={typewriterSpeed === speed} className={cn('rounded-md px-2 py-1 text-[10px] font-medium capitalize', typewriterSpeed === speed ? 'bg-[var(--stint-bg-card)] text-[var(--stint-primary)] shadow-sm' : 'text-[var(--stint-text-muted)]')}>{speed}</button>)}
                  </div>
                </div>
                {questionAudioDone ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <button onClick={() => setFollowReading((value) => !value)} aria-pressed={followReading} className={buttonStyle}>{followReading ? 'Auto-scroll on' : 'Auto-scroll off'}</button>
                      {!typewriterDone && <button onClick={() => { setFollowReading(false); setTypewriterDisplayed(idealFull); }} className={buttonStyle}>Show full answer</button>}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-base leading-[1.85] xl:text-lg">{typewriterDisplayed}<span ref={readingCursorRef} aria-hidden="true" className={cn('ml-1 inline-block h-4 w-0.5', !typewriterDone && 'animate-pulse bg-[var(--stint-primary)]')} /></p>
                    <button onClick={() => speakAnswer(entry.question, entry.ideal_answer)} disabled={captureActive} className={`${buttonStyle} mt-5`}><Volume2 size={14} />Listen to Answer</button>
                    {practiceState === 'feedback' && analysis && <div className="mt-6 border-t border-[var(--stint-border)] pt-5"><h4 className="mb-2 text-xs font-semibold text-[var(--stint-primary)]">Your recorded transcript</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--stint-text-muted)]">{analysis.transcript}</p></div>}
                  </>
                ) : <p className="text-sm leading-relaxed text-[var(--stint-text-muted)]">Listening to the question... Your answer will appear here and recording will start automatically.</p>}
              </div>
              <div className="shrink-0 border-t border-[var(--stint-border)] bg-[var(--stint-bg)]/50 p-3 xl:p-4" aria-label="Recording controls">
                {practiceError && <p role="alert" className="mb-3 text-xs text-red-500">{practiceError}</p>}
                {!recorder.isSupported ? <p className="text-xs">Audio recording isn't supported in this browser. Try Chrome, Edge, or Safari.</p> : practiceState === 'recording' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Recording <span className="font-normal text-[var(--stint-text-muted)] tabular-nums">{Math.floor(recorder.elapsedSec / 60)}:{String(recorder.elapsedSec % 60).padStart(2, '0')} / {Math.floor(MAX_RECORDING_SEC / 60)}:00</span></p><p className="mt-1 text-[11px] text-[var(--stint-text-muted)]">Press Done after you finish speaking.</p></div>
                    <div className="flex gap-2"><button onClick={resetPractice} className={buttonStyle}>Cancel</button><button onClick={() => recorder.stop()} className="flex items-center gap-2 rounded-xl bg-[var(--stint-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90"><Square size={12} />Done — Get Coaching</button></div>
                  </div>
                ) : practiceState === 'starting' ? <div role="status" className="flex items-center gap-2 text-xs"><Loader2 size={15} className="animate-spin" />Preparing microphone...<button onClick={resetPractice} className={`${buttonStyle} ml-auto`}>Cancel</button></div>
                  : practiceState === 'analyzing' ? <div role="status" className="flex items-center gap-2 text-xs text-[var(--stint-text-muted)]"><Loader2 size={15} className="animate-spin" />Analyzing your reading...</div>
                  : questionAudioDone ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="hidden xl:block text-xs text-[var(--stint-text-muted)]">{practiceState === 'feedback' ? 'Another reading, another step forward.' : 'Ready when you are. Read the answer aloud.'}</p><button onClick={beginReading} className="flex items-center gap-2 rounded-xl bg-[var(--stint-primary)] px-4 py-2.5 text-xs font-semibold text-white"><Mic size={14} />{questionAttempts.length ? 'Read Again' : 'Start Reading'}</button></div>
                  : <p className="text-xs text-[var(--stint-text-muted)]">Your microphone will start when the answer appears.</p>}
              </div>
            </section>

            <aside aria-label="Reading metrics" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-sm md:min-h-0">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stint-border)] p-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--stint-primary)]">Personal feedback</p><h3 className="mt-1 text-base font-semibold">Your reading report</h3></div>
                {questionAttempts.length > 0 && <span className="text-[10px] text-[var(--stint-text-muted)]">{questionAttempts.length} attempt{questionAttempts.length > 1 ? 's' : ''}</span>}
              </div>
              <div className="flex-1 overflow-y-auto p-5 md:min-h-0">
                {practiceState === 'feedback' && analysis ? <div className="flex flex-col gap-4">
                            <div role={saveStatus === 'error' ? 'alert' : 'status'} className="text-sm">
                              {saveStatus === 'saving' ? 'Saving your report…' : saveStatus === 'saved' ? 'Report saved to your reading history.' : saveStatus === 'error' ? 'Save failed. Keep this passage open and retry before recording again.' : ''}
                              {saveStatus === 'error' && <button className="ml-2 font-semibold text-[var(--stint-primary)]" onClick={()=>pendingSave.current && void persistReport(pendingSave.current)}>Retry saving report</button>}
                              {saveStatus === 'error' && <button className="ml-2 underline" onClick={()=>{pendingSave.current=null;setSaveStatus('idle');setAnalysis(null);setPracticeState('idle');}}>Discard unsaved report and re-record</button>}
                            </div>
                            {recordingUrl && <section className="space-y-2"><h4 className="text-sm font-semibold">Listen and compare</h4><p className="text-xs text-[var(--stint-text-muted)]">Play a model sentence, then replay your recording. Use the playback timeline to revisit that sentence. Recording audio is available only in this session.</p><audio ref={playbackRef} className="w-full" controls src={recordingUrl} onPlay={stopAudio} aria-label="Your reading playback" /><details><summary className="cursor-pointer text-sm text-[var(--stint-primary)]">Model sentences</summary><div className="mt-2 space-y-2">{(entry.ideal_answer.match(/[^.!?]+[.!?]*/g) ?? [entry.ideal_answer]).filter(t=>t.trim()).map((sentence,i)=><button key={i} className="block w-full rounded-lg border border-[var(--stint-border)] p-2 text-left text-xs" onClick={()=>{playbackRef.current?.pause();speakTerm(sentence.trim());}}>Listen {i+1}: {sentence.trim()}</button>)}</div></details></section>}
                            <ReadingDeliveryCoach key={`${interviewIndex}-${analysis.receiptId ?? questionAttempts.length}`} reference={entry.ideal_answer} feedback={analysis} onListen={word => { playbackRef.current?.pause(); speakTerm(word); }} onRepeat={saveStatus === 'saved' ? beginReading : undefined} />
                            <ReadingAssessmentDetails assessment={analysis.assessment} />
                            {/* Overall + delta */}
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="text-center">
                                <div className={cn('text-5xl font-semibold tracking-tight tabular-nums', analysis.scores.overall >= 80 ? 'text-emerald-500' : analysis.scores.overall >= 60 ? 'text-amber-500' : 'text-red-400')}>
                                  {analysis.scores.overall}
                                </div>
                                <div className="text-[10px] text-[var(--stint-text-muted)] font-semibold uppercase tracking-wide">Reading estimate</div>
                              </div>
                              {!analysis.assessment && questionAttempts.length > 1 && (
                                <div className={cn('flex items-center gap-1 text-sm font-semibold', analysis.scores.overall >= questionAttempts[questionAttempts.length - 2] ? 'text-emerald-500' : 'text-red-400')}>
                                  <TrendingUp size={16} />
                                  {analysis.scores.overall - questionAttempts[questionAttempts.length - 2] >= 0 ? '+' : ''}
                                  {analysis.scores.overall - questionAttempts[questionAttempts.length - 2]} vs last attempt
                                </div>
                              )}
                              {!analysis.assessment && questionAttempts.length > 1 && <div className="ml-auto text-xs text-[var(--stint-text-muted)] tabular-nums">{questionAttempts.join(' → ')}</div>}
                            </div>

                            {/* Dimension bars */}
                            <div className="flex flex-col gap-3">
                              <ScoreBar label="Accuracy" value={analysis.scores.accuracy} />
                              <ScoreBar label="Fluency" value={analysis.scores.fluency} />
                              <ScoreBar label="Reading coverage" value={analysis.scores.completeness} />
                            </div>

                            {/* Delivery metrics */}
                            <div className="grid grid-cols-1 gap-2 text-[11px] font-medium xl:grid-cols-3">
                              <span className={cn('px-2.5 py-1 rounded-full', analysis.delivery.pace === 'good' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                                {analysis.delivery.wpm} wpm {analysis.delivery.pace === 'good' ? '· good pace' : analysis.delivery.pace === 'fast' ? '· slow down' : '· speed up a little'}
                              </span>
                              <span className="px-2.5 py-1 rounded-full bg-[var(--stint-bg-elevated)] text-[var(--stint-text-muted)] border border-[var(--stint-border)]">
                                fillers: {analysis.delivery.filler_count}
                              </span>
                              <span className="px-2.5 py-1 rounded-full bg-[var(--stint-bg-elevated)] text-[var(--stint-text-muted)] border border-[var(--stint-border)]">
                                long pauses: {analysis.delivery.long_pauses}
                              </span>
                            </div>




                            {/* Missed words — tap to hear pronunciation */}
                            {analysis.missed_words.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-text-muted)] mb-1.5">Missed or unclear — tap to hear</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {analysis.missed_words.map((w) => (
                                    <button
                                      key={w}
                                      onClick={() => { playbackRef.current?.pause(); speakTerm(w); }}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors"
                                    >
                                      <Volume2 size={11} /> {w}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {analysis.strengths.length > 0 && (
                              <div className="rounded-xl bg-emerald-500/5 p-3">
                                <p className="text-xs font-semibold text-emerald-600 mb-2">What went well</p>
                                <ul className="text-xs space-y-1">{analysis.strengths.map((strength, i) => <li key={i}>{strength}</li>)}</ul>
                              </div>
                            )}
                            {/* Tips + coaching */}
                            {analysis.improvements.length > 0 && (
                              <ul aria-label="Improvements to practise" className="rounded-xl border border-[var(--stint-border)] p-4 text-sm text-[var(--stint-text)] space-y-3">
                                {analysis.improvements.map((tip, i) => (
                                  <li key={i} className="flex gap-2"><span className="text-[var(--stint-primary)]">•</span>{tip}</li>
                                ))}
                              </ul>
                            )}
                            {analysis.coaching && (
                              <div className="rounded-xl bg-[var(--stint-bg)] p-4"><h4 className="mb-2 text-xs font-semibold">Coach’s notes</h4><p className="text-sm leading-relaxed text-[var(--stint-text-muted)]">{analysis.coaching}</p></div>
                            )}


                </div> : (
                  <div className="flex min-h-full flex-col justify-center gap-6 py-6">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--stint-primary)]/5 text-[var(--stint-primary)]">{practiceState === 'analyzing' ? <Loader2 size={22} className="animate-spin" /> : <TrendingUp size={22} />}</div>
                    <div className="text-center"><h4 className="text-sm font-semibold">{practiceState === 'analyzing' ? 'Turning your reading into feedback' : captureActive ? 'Focus on your words' : 'A clearer picture of your progress'}</h4><p className="mx-auto mt-2 max-w-[260px] text-xs leading-relaxed text-[var(--stint-text-muted)]">{practiceState === 'analyzing' ? 'We’re checking your accuracy, fluency, and delivery.' : 'Finish your recording to see how you did. Your answer stays beside your feedback.'}</p></div>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3" aria-label="Metrics available after recording">{['Word accuracy', 'Speaking fluency', 'Answer completeness', 'Words per minute', 'Filler words', 'Long pauses'].map((label) => <div key={label} className="rounded-xl border border-dashed border-[var(--stint-border)] p-2.5 text-center"><span className="text-xl text-[var(--stint-text-muted)]/40">—</span><p className="mt-1 text-[10px] leading-relaxed text-[var(--stint-text-muted)]">{label}</p></div>)}</div>
                    <p className="text-center text-[10px] text-[var(--stint-text-muted)]">Metrics appear after recording. No scores yet.</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3">
            <button onClick={goPrev} disabled={interviewIndex === 0} className={buttonStyle}><ChevronLeft size={16} />Previous</button>
            <span className="hidden text-[11px] text-[var(--stint-text-muted)] sm:block">Small repetitions. Lasting confidence.</span>
            <button disabled={saveStatus === "saving" || saveStatus === "error"} onClick={goNext} className={buttonStyle}>{isLast ? 'Finish Interview' : <>Next Question<ChevronRight size={16} /></>}</button>
          </footer>
        </div>
      </AppLayout>
    </>
  );
}
