import { useState, useRef, useCallback } from 'react';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

export function useSTT() {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Strip the data URL prefix (e.g. "data:audio/webm;base64,")
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const sendAudioToServer = useCallback(async (contextTerm: string) => {
    const chunks = audioChunksRef.current;
    if (chunks.length === 0) {
      setTranscription('No audio recorded.');
      return;
    }

    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
    audioChunksRef.current = [];

    try {
      const base64Audio = await blobToBase64(blob);
      const mimeType = blob.type || 'audio/webm';

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: JSON.stringify({
          audio: base64Audio,
          mimeType,
          context: contextTerm,
        }),
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const { text } = await response.json();
      setTranscription(text || '');
      return text || '';
    } catch (error) {
      console.error('Transcription Error:', error);
      setTranscription('Error transcribing audio.');
      return undefined;
    }
  }, []);

  const stopListening = useCallback(async (contextTerm?: string) => {
    // Clear auto-stop timer
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsListening(false);

    // Send recorded audio to server if we have a context term
    if (contextTerm) {
      return sendAudioToServer(contextTerm);
    }
  }, [sendAudioToServer]);

  const startListening = useCallback(async (contextTerm: string) => {
    if (isListening) return;

    setIsListening(true);
    setTranscription('Listening...');
    setSimilarityScore(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // When recording stops, send audio to the server
        const text = await sendAudioToServer(contextTerm);
        if (text) {
          setTranscription(text);
        }
      };

      mediaRecorder.start();

      // Auto-stop after 5 seconds
      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        setIsListening(false);
      }, 5000);
    } catch (error) {
      console.error('Mic Error:', error);
      setIsListening(false);
      setTranscription('Error accessing microphone.');
    }
  }, [isListening, sendAudioToServer]);

  const compareAnswer = useCallback(async (
    userTranscription: string,
    correctTerm: string,
  ): Promise<{ score: number; feedback: string; isMatch: boolean } | null> => {
    try {
      const response = await fetch('/api/ai/compare', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: JSON.stringify({
          transcription: userTranscription,
          correctTerm,
        }),
      });

      if (!response.ok) {
        throw new Error(`Compare failed: ${response.status}`);
      }

      const result = await response.json();
      setSimilarityScore(result.score);
      return result;
    } catch (error) {
      console.error('Comparison Error:', error);
      return null;
    }
  }, []);

  return {
    isListening,
    transcription,
    similarityScore,
    startListening,
    stopListening,
    compareAnswer,
    setTranscription,
    setSimilarityScore,
  };
}
