import { useState, useRef, useCallback } from 'react';

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

  const isSupported = !!getSpeechRecognition();

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    resetTranscript();
    setIsListening(true);

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalText = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + ' ';
          setTranscript(finalText.trim());
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: Event) => {
      console.warn('SpeechRecognition error:', (event as any).error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [resetTranscript]);

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

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    evaluateAnswer,
  };
}
