import { useState, useRef, useCallback, useEffect } from 'react';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

/* Browser SpeechRecognition types (not in all TS libs) */
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string; readonly confidence: number };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}
interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export interface EvaluationResult {
  overall_score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  missed_words: string[];
  strengths: string[];
  improvements: string[];
  coaching: string;
}

export function useSTT() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const finalTextRef = useRef('');
  const isVoiceActiveRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());

  // Cache the SpeechRecognition constructor once to avoid repeated window lookups
  const speechRecognitionCtorRef = useRef<SpeechRecognitionCtor | null>(
    typeof window === 'undefined' ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
  );
  const isSupported = !!speechRecognitionCtorRef.current;

  // Helper to stop and clear the current recognition instance
  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        // remove handlers then stop to avoid callbacks after clearing
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    finalTextRef.current = '';
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    stopRecognition();
    setIsListening(false);
    setInterimTranscript('');

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [stopRecognition]);

  const startListening = useCallback((stream?: MediaStream | null) => {
    const SpeechRecognitionClass = speechRecognitionCtorRef.current;
    if (!SpeechRecognitionClass) return;

    // Stop any existing recognition cleanly
    stopRecognition();

    resetTranscript();
    setIsListening(true);
    isListeningRef.current = true;
    lastActiveTimeRef.current = Date.now();

    const startSession = () => {
      if (!isListeningRef.current) return;
      
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Update the active time since speech engine successfully transcribed words
        lastActiveTimeRef.current = Date.now();

        let interim = '';
        let currentFinal = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            currentFinal += result[0].transcript + ' ';
          } else {
            interim += result[0].transcript;
          }
        }
        if (currentFinal) {
          finalTextRef.current += currentFinal;
          setTranscript(finalTextRef.current.trim());
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: Event) => {
        console.warn('SpeechRecognition error:', (event as any).error);
      };

      recognition.onend = () => {
        // Auto-restart if we should still be listening
        if (isListeningRef.current) {
          setTimeout(() => {
            startSession();
          }, 100);
        } else {
          setIsListening(false);
          setInterimTranscript('');
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Failed to start SpeechRecognition:', err);
      }
    };

    // Add a 300ms delay to let the browser release the audio capture interface
    setTimeout(() => {
      startSession();
    }, 300);
  }, [resetTranscript, stopRecognition]);

  /** Call the AI evaluation endpoint to score reading quality */
  const evaluateAnswer = useCallback(async (
    question: string,
    userAnswer: string,
    idealAnswer: string,
    role?: string,
    category?: string,
  ): Promise<EvaluationResult | null> => {
    try {
      const response = await fetch('/api/ai/evaluate-answer', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: JSON.stringify({ question, userAnswer, idealAnswer, role, category }),
      });

      if (!response.ok) {
        throw new Error(`Evaluation failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Evaluation Error:', error);
      return null;
    }
  }, []);

  const getSilenceDuration = useCallback(() => {
    return (Date.now() - lastActiveTimeRef.current) / 1000;
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    evaluateAnswer,
    getSilenceDuration,
  };
}
