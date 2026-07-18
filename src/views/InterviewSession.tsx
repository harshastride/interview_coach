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
import { useSTT } from '../hooks/useSTT';
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

interface LiveStats {
  accuracy: number;
  pronunciation: number;
  clarity: number;
  fluency: number;
  confidence: number;
  overall_score: number;
}

interface FallingEmoji {
  id: number;
  char: string;
  x: number;
  delay: number;
  duration: number;
  fontSize: number;
}

function normalizeWord(w: string): string {
  let cleaned = w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mappings: { [key: string]: string } = {
    "sequel": "sql",
    "databases": "database",
    "datacenter": "data",
    "datacenters": "data",
    "vm": "virtual",
    "vms": "virtual",
    "api": "apis",
    "url": "urls",
    "dns": "domain",
    "ip": "address",
    "vpn": "vpns",
    "http": "https",
  };
  return mappings[cleaned] || cleaned;
}

function calculateLiveStats(userAnswer: string, idealText: string): LiveStats {
  const clean = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).map(normalizeWord);
  const userWords = clean(userAnswer);
  const idealWords = clean(idealText);
  
  if (idealWords.length === 0) {
    return { accuracy: 0, pronunciation: 0, clarity: 0, fluency: 0, confidence: 0, overall_score: 1 };
  }

  const userWordSet = new Set(userWords);
  const matched = idealWords.filter(w => userWordSet.has(w)).length;
  const matchRatio = matched / idealWords.length;

  const score = Math.max(1, Math.min(10, Math.round(matchRatio * 10)));
  const accuracy = Math.round(matchRatio * 100);
  const fluency = Math.min(100, Math.max(0, Math.round(matchRatio * 90 + (userWords.length > 0 ? 10 : 0))));
  const clarity = Math.min(100, Math.max(0, Math.round(matchRatio * 85 + (userWords.length > 0 ? 15 : 0))));
  const confidence = Math.min(100, Math.max(0, Math.round(matchRatio * 88 + (userWords.length > 0 ? 12 : 0))));
  const pronunciation = Math.min(100, Math.max(0, Math.round(matchRatio * 92 + (userWords.length > 0 ? 8 : 0))));

  return {
    accuracy,
    pronunciation,
    clarity,
    fluency,
    confidence,
    overall_score: score
  };
}

function checkReadingCompleted(userAnswer: string, idealAnswer: string): boolean {
  const clean = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).map(normalizeWord);
  const userWords = clean(userAnswer);
  const idealWords = clean(idealAnswer);
  if (idealWords.length === 0) return false;
  
  const userWordSet = new Set(userWords);
  const matchedCount = idealWords.filter(w => userWordSet.has(w)).length;
  const matchRatio = matchedCount / idealWords.length;
  
  const lastWord = idealWords[idealWords.length - 1];
  const spokeLastWord = userWords.slice(-3).includes(lastWord);
  
  return matchRatio >= 0.85 || (matchRatio >= 0.70 && spokeLastWord);
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  const totalQuestions = sessionQuestions.length;
  const role = selectedRole;
  const name = candidateName;

  const entry = sessionQuestions[interviewIndex];
  const idealFull = entry?.ideal_answer ?? '';
  const typewriterDone = typewriterDisplayed.length >= idealFull.length;
  const isLast = interviewIndex >= totalQuestions - 1;
  const bottomNavProps = useBottomNav('interview');

  // Speech-to-Text Voice Evaluation hook & state
  const { isListening, transcript, interimTranscript, startListening, stopListening, resetTranscript, evaluateAnswer, getSilenceDuration } = useSTT();
  const combinedTranscript = `${transcript} ${interimTranscript}`.trim();
  const liveStats = calculateLiveStats(combinedTranscript, typewriterDisplayed);
  const [evaluationPopup, setEvaluationPopup] = useState<{
    overall_score: number;
    accuracy: number;
    pronunciation: number;
    clarity: number;
    fluency: number;
    confidence: number;
    speaking_pace: number;
    performance: string;
    feedback: string;
    suggestion: string;
    missed_words: string[];
  } | null>(null);

  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeEmojis, setActiveEmojis] = useState<FallingEmoji[]>([]);
  const [sessionEvaluations, setSessionEvaluations] = useState<any[]>([]);
  const emojiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const triggerEmojiRain = (score: number) => {
    if (emojiTimerRef.current) clearTimeout(emojiTimerRef.current);
    const emojiChar = score >= 8 ? '💐' : '😓';
    const list: FallingEmoji[] = [];
    for (let i = 0; i < 200; i++) {
      list.push({
        id: i,
        char: emojiChar,
        x: Math.random() * 100,
        delay: Math.random() * 5.0, // spread start over first 5s
        duration: 2.0 + Math.random() * 1.0, // takes 2-3s to fall
        fontSize: 18 + Math.random() * 22,
      });
    }
    setActiveEmojis(list);
    setCountdown(8);
    emojiTimerRef.current = setTimeout(() => {
      setActiveEmojis([]);
    }, 8000);
  };

  const showEvaluationPopup = (evalResult: any) => {
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    setEvaluationPopup(evalResult);
    setSessionEvaluations((prev) => [...prev, evalResult]);
    triggerEmojiRain(evalResult.overall_score);
  };

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      if (emojiTimerRef.current) clearTimeout(emojiTimerRef.current);
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (isListening && mediaStreamRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const source = audioCtx.createMediaStreamSource(mediaStreamRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!canvasRef.current) return;
        animationFrameIdRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = 3;
        const gap = 2;
        const barsCount = Math.floor(canvas.width / (barWidth + gap));
        
        ctx.fillStyle = 'var(--stint-primary)';

        for (let i = 0; i < barsCount; i++) {
          const dataIndex = Math.abs(i - Math.floor(barsCount / 2)) % bufferLength;
          const value = dataArray[dataIndex];
          
          const percent = value / 255;
          const minHeight = 4;
          const maxHeight = canvas.height - 4;
          const barHeight = minHeight + percent * maxHeight;

          const x = i * (barWidth + gap);
          const y = (canvas.height - barHeight) / 2;

          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 1.5);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, barHeight);
          }
        }
      };

      draw();
    }

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [isListening]);

  const renderEvaluationPopup = () => {
    if (!evaluationPopup) return null;
    return (
      <>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .eval-popup {
            animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}</style>
        <div className="fixed right-6 top-20 z-50 w-80 rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] shadow-2xl p-5 eval-popup space-y-4 text-left max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--stint-border)] pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--stint-text-muted)]">Voice Evaluation</p>
              <h4 className={cn(
                "text-lg font-bold",
                evaluationPopup.overall_score >= 9 ? "text-emerald-500" :
                evaluationPopup.overall_score >= 5 ? "text-amber-500" : "text-red-500"
              )}>
                {evaluationPopup.performance}
              </h4>
            </div>
            <div className="flex flex-col items-center justify-center bg-[var(--stint-primary)]/10 text-[var(--stint-primary)] w-12 h-12 rounded-xl border border-[var(--stint-primary)]/20">
              <span className="text-lg font-black">{evaluationPopup.overall_score}</span>
              <span className="text-[9px] uppercase font-bold text-[var(--stint-text-muted)] -mt-1">/ 10</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Accuracy</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.accuracy}%</span>
            </div>
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Pronunciation</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.pronunciation}%</span>
            </div>
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Clarity</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.clarity}%</span>
            </div>
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Fluency</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.fluency}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Confidence</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.confidence}%</span>
            </div>
            <div className="bg-[var(--stint-bg)]/40 p-2.5 rounded-xl border border-[var(--stint-border)]/50">
              <span className="text-[10px] text-[var(--stint-text-muted)] font-medium block">Speaking Pace</span>
              <span className="font-bold text-[var(--stint-text)]">{evaluationPopup.speaking_pace}%</span>
            </div>
          </div>

          {evaluationPopup.missed_words && evaluationPopup.missed_words.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 text-xs text-[var(--stint-text)]">
              <p className="font-medium text-red-500 mb-1">Missed/Incorrect Words:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {evaluationPopup.missed_words.map((w: string, idx: number) => (
                  <span key={idx} className="bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-red-500/20">{w}</span>
                ))}
              </div>
            </div>
          )}

          {evaluationPopup.feedback && (
            <div className="bg-[var(--stint-bg)]/40 border border-[var(--stint-border)]/50 rounded-xl p-3 text-xs text-[var(--stint-text-muted)]">
              <p className="font-semibold text-[var(--stint-text)] mb-1">Overall Feedback:</p>
              <p>{evaluationPopup.feedback}</p>
            </div>
          )}

          {evaluationPopup.suggestion && (
            <div className="bg-[var(--stint-primary)]/5 border border-[var(--stint-primary)]/10 rounded-xl p-3 text-xs text-[var(--stint-text)]">
              <p className="font-medium text-[var(--stint-primary)] mb-1">Suggestion:</p>
              <p>{evaluationPopup.suggestion}</p>
            </div>
          )}
        </div>
      </>
    );
  };

  // Automatically start recording when typewriter starts
  useEffect(() => {
    if (interviewPhase === 'in_progress' && questionAudioDone) {
      startListening(mediaStreamRef.current);
    }
    return () => {
      stopListening();
    };
  }, [interviewPhase, questionAudioDone, interviewIndex]);

  // Trigger auto-completion detection when user reads the answer
  useEffect(() => {
    if (interviewPhase === 'in_progress' && isListening && combinedTranscript) {
      const clean = (s: string) => String(s || "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).map(normalizeWord);
      const userWords = clean(combinedTranscript);
      const idealWords = clean(idealFull);
      if (idealWords.length === 0) return;
      
      const userWordSet = new Set(userWords);
      const matchedCount = idealWords.filter(w => userWordSet.has(w)).length;
      const matchRatio = matchedCount / idealWords.length;
      
      // Find the last significant words of the ideal answer
      const sigWords = idealWords.filter(w => w.length >= 3);
      const targetEndWords = sigWords.slice(-2);
      if (targetEndWords.length === 0) targetEndWords.push(...idealWords.slice(-2));

      // Check if the user spoke any of the final target words recently (larger window for STT batching)
      const spokeEndWords = targetEndWords.some(w => userWords.slice(-12).includes(w));
      const silenceDuration = getSilenceDuration();

      // Trigger if:
      // 1. Immediate: Reached the end (spoke an end word) AND matched at least 60% of the text.
      // 2. Short silence: Matched >= 80% and paused for 1.5s.
      // 3. Medium silence: Matched >= 60% and paused for 3.0s.
      // 4. Fallback: Paused for 5.0s (user gave up).
      //
      // CRITICAL: We MUST also enforce that the typewriter has finished displaying the text on screen. 
      // Otherwise, speaking a keyword early will prematurely cut the user off while they are still waiting to read.
      const isCompleted = typewriterDone && (
                          (matchRatio >= 0.60 && spokeEndWords) || 
                          (matchRatio >= 0.80 && silenceDuration > 1.5) || 
                          (matchRatio >= 0.60 && silenceDuration > 3.0) || 
                          (silenceDuration > 5.0)
                        );

      if (isCompleted) {
        stopListening();
        evaluateAnswer(entry.question, combinedTranscript, idealFull, role, entry.category)
          .then((res) => {
            if (res) {
              showEvaluationPopup(res);
            }
          })
          .catch((err) => console.error('Auto-evaluation failed:', err));
      }
    }
  }, [combinedTranscript, interviewPhase, isListening, idealFull, entry, role, evaluateAnswer, getSilenceDuration, typewriterDone]);

  // Trigger overall score celebration/motivation emoji rain on complete page
  useEffect(() => {
    if (interviewPhase === 'complete') {
      const totalScore = sessionEvaluations.reduce((sum, ev) => sum + (ev?.overall_score ?? 0), 0);
      const avgScore = sessionEvaluations.length > 0 ? totalScore / sessionEvaluations.length : 8;
      
      const t = setTimeout(() => {
        triggerEmojiRain(avgScore);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [interviewPhase, sessionEvaluations]);

  // Cleanly purge previous question transcripts when moving to a new index
  useEffect(() => {
    resetTranscript();
  }, [interviewIndex, resetTranscript]);

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
  const applyDenoiseToStream = async (stream: MediaStream): Promise<MediaStream> => {
    try {
      if (!(window as any).Shiguredo) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = "https://cdn.jsdelivr.net/npm/@shiguredo/noise-suppression@latest/dist/noise_suppression.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load RNNoise"));
          document.head.appendChild(script);
        });
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && (window as any).Shiguredo) {
        const assetsPath = "https://cdn.jsdelivr.net/npm/@shiguredo/noise-suppression@latest/dist";
        const processor = new (window as any).Shiguredo.NoiseSuppressionProcessor(assetsPath);
        const processedTrack = await processor.startProcessing(audioTrack);

        const tracks = [processedTrack];
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) tracks.push(videoTrack);
        
        console.log("RNNoise suppression node initialized successfully.");
        return new MediaStream(tracks);
      }
    } catch (err) {
      console.warn("RNNoise initialization failed, falling back to raw mic:", err);
    }
    return stream;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const processedStream = await applyDenoiseToStream(stream);
      mediaStreamRef.current = processedStream;
      if (videoRef.current) videoRef.current.srcObject = processedStream;
      setMicGranted(true);
      setCameraOn(true);
    } catch {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const processedAudioStream = await applyDenoiseToStream(audioStream);
        mediaStreamRef.current = processedAudioStream;
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
    if (videoRef.current && mediaStreamRef.current) {
      if (videoRef.current.srcObject !== mediaStreamRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
      }
    }
  }, [interviewPhase, micGranted, cameraOn]);

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

  /* ── Auto-scroll on new typewriter text ────────────── */
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [typewriterDisplayed]);

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

  const handleNextQuestion = () => {
    if (isListening && !evaluationPopup) {
      const spokenText = combinedTranscript.trim();
      const currentQuestion = entry?.question ?? '';
      const currentIdeal = entry?.ideal_answer ?? '';

      // Stop listening to release mic
      stopListening();

      // Trigger evaluation in the background
      evaluateAnswer(currentQuestion, spokenText, currentIdeal, role, entry?.category)
        .then((res) => {
          if (res) {
            showEvaluationPopup(res);
          }
        })
        .catch((err) => console.error('Evaluation failed:', err));
      
      return;
    }

    setEvaluationPopup(null);
    goNext();
  };

  const goPrev = () => {
    stopListening();
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
    if (countdown > 0) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) handleNextQuestion(); else goPrev();
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
        {renderEvaluationPopup()}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: INTRO
     ═══════════════════════════════════════════════════════ */
  if (interviewPhase === 'intro') {
    const beginInterview = () => {
      const greeting = `Hello ${name}, welcome to your interview for ${role}. Let's begin.`;
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
              Hello {name}
            </h1>
            <p className="text-sm text-[var(--stint-text-muted)] text-center mb-1">
              Interview Practice: {role} &middot; {totalQuestions} questions
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
        {renderEvaluationPopup()}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: COMPLETE
     ═══════════════════════════════════════════════════════ */
  if (interviewPhase === 'complete') {
    const elapsed = Math.round((Date.now() - startTime) / 60000);
    const playFullSession = () => {
      const greeting = `Hello ${name}, welcome to your interview for ${role}. Let's begin.`;
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
              <button onClick={() => { setInterviewPhase('intro'); setInterviewIndex(0); setFeedbackRating(null); setIsPlayingFullSession(false); setSessionEvaluations([]); }} className="px-5 py-2.5 rounded-2xl bg-[var(--stint-primary)] text-white font-semibold shadow-lg">Practice Again</button>
              <button onClick={() => { stopAudio(); navigate('/interview'); setSessionEvaluations([]); }} className="px-5 py-2.5 rounded-2xl border-2 border-[var(--stint-primary)] text-[var(--stint-primary)] font-semibold">New Topics</button>
              <button onClick={() => { stopAudio(); navigate('/'); setSessionEvaluations([]); }} className="px-5 py-2.5 rounded-2xl border-2 border-[var(--stint-border)] text-[var(--stint-text-muted)] font-semibold">Home</button>
            </div>
          </div>
        </AppLayout>
        {renderEvaluationPopup()}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: IN PROGRESS
     ═══════════════════════════════════════════════════════ */

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
        <div className="w-full max-w-3xl mx-auto flex flex-col flex-1 min-h-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2" ref={scrollContainerRef}>
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
                <div className="px-5 pb-4 space-y-3">
                  <p className="text-xs text-[var(--stint-text-muted)] italic">
                    {!questionAudioDone
                      ? 'Listening to the question...'
                      : isListening
                        ? '🎙️ Listening... Read the answer aloud as it appears'
                        : 'Tap "Next Question" when ready to continue'}
                  </p>
                  {isListening && (
                    <div className="space-y-3">
                      {/* Live waveform indicator */}
                      <div className="flex justify-center items-center h-10 w-full bg-[var(--stint-bg)]/30 rounded-xl border border-[var(--stint-border)]/50 p-2">
                        <canvas ref={canvasRef} width={280} height={30} className="w-[280px] h-[30px]" />
                      </div>
                      {/* Live speech-to-text transcription preview */}
                      {combinedTranscript && (
                        <div className="px-3 py-2 rounded-xl bg-[var(--stint-bg)]/50 border border-[var(--stint-border)] text-xs text-[var(--stint-text-muted)] max-h-16 overflow-y-auto text-left">
                          <span className="font-semibold text-[var(--stint-primary)] mr-1">Captured speech:</span>
                          "{combinedTranscript}"
                        </div>
                      )}
                      
                      {/* Live metrics display */}
                      <div className="grid grid-cols-5 gap-1.5 text-[10px] text-center mt-2">
                        <div className="bg-[var(--stint-bg)]/40 py-1.5 px-1 rounded-lg border border-[var(--stint-border)]/40">
                          <span className="text-[9px] text-[var(--stint-text-muted)] block">Accuracy</span>
                          <span className="font-bold text-[var(--stint-text)]">{liveStats.accuracy}%</span>
                        </div>
                        <div className="bg-[var(--stint-bg)]/40 py-1.5 px-1 rounded-lg border border-[var(--stint-border)]/40">
                          <span className="text-[9px] text-[var(--stint-text-muted)] block">Pronunc.</span>
                          <span className="font-bold text-[var(--stint-text)]">{liveStats.pronunciation}%</span>
                        </div>
                        <div className="bg-[var(--stint-bg)]/40 py-1.5 px-1 rounded-lg border border-[var(--stint-border)]/40">
                          <span className="text-[9px] text-[var(--stint-text-muted)] block">Clarity</span>
                          <span className="font-bold text-[var(--stint-text)]">{liveStats.clarity}%</span>
                        </div>
                        <div className="bg-[var(--stint-bg)]/40 py-1.5 px-1 rounded-lg border border-[var(--stint-border)]/40">
                          <span className="text-[9px] text-[var(--stint-text-muted)] block">Fluency</span>
                          <span className="font-bold text-[var(--stint-text)]">{liveStats.fluency}%</span>
                        </div>
                        <div className="bg-[var(--stint-bg)]/40 py-1.5 px-1 rounded-lg border border-[var(--stint-border)]/40">
                          <span className="text-[9px] text-[var(--stint-text-muted)] block">Score</span>
                          <span className="font-bold text-[var(--stint-primary)]">{liveStats.overall_score}/10</span>
                        </div>
                      </div>
                    </div>
                  )}
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
              onClick={handleNextQuestion}
              disabled={countdown > 0}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-base transition-all shadow-lg",
                countdown > 0
                  ? "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-[var(--stint-primary)] text-white hover:bg-[var(--stint-primary-dark)] shadow-[var(--stint-primary)]/20"
              )}
            >
              {countdown > 0 ? (
                <span>Next Question in {countdown}s</span>
              ) : isLast ? (
                'Finish Interview'
              ) : (
                <>Next Question <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </div>
      </AppLayout>
      {renderEvaluationPopup()}
    </>
  );
}
