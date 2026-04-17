import { useState, useRef, useCallback, useEffect } from 'react';

const FETCH_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
};

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef<Record<string, AudioBuffer>>({});
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Cleanup on unmount: stop any playing audio and pending retries
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch {}
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
        audioContextRef.current = null;
      }
    };
  }, []);

  const getAudioContext = (): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const decodeBase64ToBuffer = async (base64: string): Promise<AudioBuffer> => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    const ctx = getAudioContext();
    const sampleRate = 24000;
    const audioBuffer = ctx.createBuffer(1, pcmData.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768;
    }
    return audioBuffer;
  };

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const playBuffer = useCallback((buffer: AudioBuffer, onEnded?: () => void) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Stop any currently playing audio
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
    }
    setIsSpeaking(true);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      sourceNodeRef.current = null;
      if (!unmountedRef.current) {
        setIsSpeaking(false);
        onEnded?.();
      }
    };
    sourceNodeRef.current = source;
    source.start();
  }, []);

  const scheduleRetry = useCallback((fn: () => void, delay: number) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!unmountedRef.current) fn();
    }, delay);
  }, []);

  const speakTerm = useCallback(async (text: string, retryCount = 0, onEnded?: () => void) => {
    if (unmountedRef.current) return;
    if (isSpeaking && retryCount === 0) return;
    const normalizedText = text.toLowerCase();

    // In-memory cache check
    if (audioCacheRef.current[normalizedText] && retryCount === 0) {
      playBuffer(audioCacheRef.current[normalizedText], onEnded);
      return;
    }

    setIsSpeaking(true);
    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: JSON.stringify({ text }),
      });

      if (unmountedRef.current) return;

      if (!response.ok) {
        if (response.status === 429 && retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          scheduleRetry(() => speakTerm(text, retryCount + 1, onEnded), delay);
          return;
        }
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const { audio } = await response.json();
      if (unmountedRef.current) return;
      if (audio) {
        const buffer = await decodeBase64ToBuffer(audio);
        audioCacheRef.current[normalizedText] = buffer;
        playBuffer(buffer, onEnded);
      } else {
        setIsSpeaking(false);
        onEnded?.();
      }
    } catch (error: any) {
      console.error('TTS Error:', error);
      if (unmountedRef.current) return;
      if (error?.message?.includes('429') && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 2000;
        scheduleRetry(() => speakTerm(text, retryCount + 1, onEnded), delay);
        return;
      }
      setIsSpeaking(false);
      onEnded?.();
    }
  }, [isSpeaking, playBuffer, scheduleRetry]);

  const speakAnswer = useCallback(async (
    questionText: string,
    answerText: string,
    retryCount = 0,
    onEnded?: () => void,
  ) => {
    if (unmountedRef.current) return;
    if (!answerText) return;
    if (isSpeaking && retryCount === 0) return;

    const slug = questionText
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 60);
    const cacheKey = `interview_answer_${slug}`;

    // In-memory cache check
    if (audioCacheRef.current[cacheKey] && retryCount === 0) {
      playBuffer(audioCacheRef.current[cacheKey], onEnded);
      return;
    }

    setIsSpeaking(true);
    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        credentials: 'include',
        headers: FETCH_HEADERS,
        body: JSON.stringify({ text: answerText }),
      });

      if (unmountedRef.current) return;

      if (!response.ok) {
        if (response.status === 429 && retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          scheduleRetry(() => speakAnswer(questionText, answerText, retryCount + 1, onEnded), delay);
          return;
        }
        throw new Error(`Answer TTS request failed: ${response.status}`);
      }

      const { audio } = await response.json();
      if (unmountedRef.current) return;
      if (audio) {
        const buffer = await decodeBase64ToBuffer(audio);
        audioCacheRef.current[cacheKey] = buffer;
        playBuffer(buffer, onEnded);
      } else {
        setIsSpeaking(false);
        onEnded?.();
      }
    } catch (error: any) {
      console.error('Answer TTS error:', error);
      if (unmountedRef.current) return;
      if (error?.message?.includes('429') && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 2000;
        scheduleRetry(() => speakAnswer(questionText, answerText, retryCount + 1, onEnded), delay);
        return;
      }
      setIsSpeaking(false);
      onEnded?.();
    }
  }, [isSpeaking, playBuffer, scheduleRetry]);

  return { isSpeaking, speakTerm, speakAnswer, stopAudio };
}
