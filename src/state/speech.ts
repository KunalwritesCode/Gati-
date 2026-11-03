import { useCallback, useEffect, useRef, useState } from 'react';

// Thin wrapper over the browser's Web Speech API (Chrome, Edge, Safari).

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SR {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRCtor = new () => SR;

function ctor(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechLang = 'en-IN' | 'hi-IN';

export type SpeechError = 'no-speech' | 'not-allowed' | 'audio-capture' | 'network' | 'other';

export function speechErrorMessage(e: SpeechError): string {
  switch (e) {
    case 'no-speech':
      return 'I didn’t hear anything. Tap the mic and try again.';
    case 'not-allowed':
      return 'Microphone access is blocked. Allow it in your browser settings, or pick stops instead.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Voice input needs an internet connection in this browser. Pick stops instead.';
    default:
      return 'Voice input stopped unexpectedly. Try again.';
  }
}

export function useSpeech(onFinal: (alternatives: string[]) => void) {
  const supported = !!ctor();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);
  const rec = useRef<SR | null>(null);
  const finalCb = useRef(onFinal);
  finalCb.current = onFinal;
  const gotFinal = useRef(false);
  const timer = useRef<number>();

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    try {
      rec.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  /** Must be called from a click/tap handler so the browser can ask for the microphone. */
  const start = useCallback(
    (lang: SpeechLang) => {
      const C = ctor();
      if (!C) return;
      try {
        rec.current?.abort();
      } catch {
        /* ignore */
      }
      const r = new C();
      r.lang = lang;
      r.interimResults = true;
      r.maxAlternatives = 4;
      r.continuous = false;
      gotFinal.current = false;
      setInterim('');
      setError(null);
      r.onstart = () => setListening(true);
      r.onresult = (e) => {
        let live = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) {
            const alts: string[] = [];
            for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
            gotFinal.current = true;
            setInterim(alts[0] ?? '');
            finalCb.current(alts);
          } else live += res[0]?.transcript ?? '';
        }
        if (live) setInterim(live);
      };
      r.onerror = (e) => {
        const map: Record<string, SpeechError> = { 'no-speech': 'no-speech', 'not-allowed': 'not-allowed', 'service-not-allowed': 'not-allowed', 'audio-capture': 'audio-capture', network: 'network' };
        if (e.error !== 'aborted') setError(map[e.error] ?? 'other');
      };
      r.onend = () => {
        clearTimeout(timer.current);
        setListening(false);
      };
      rec.current = r;
      try {
        r.start();
        setListening(true);
        // Safety net: never leave the mic open.
        timer.current = window.setTimeout(() => stop(), 10_000);
      } catch {
        setListening(false);
        setError('other');
      }
    },
    [stop],
  );

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      try {
        rec.current?.abort();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported, listening, interim, error, start, stop };
}
