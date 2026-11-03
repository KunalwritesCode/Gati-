import { useEffect, useState } from 'react';
import { Check, Mic, MicOff } from 'lucide-react';
import type { BusData } from '../lib/types';
import { bestRoute, type RoutePair, type VoiceRouteResult } from '../lib/voiceRoute';
import { speechErrorMessage, useSpeech, type SpeechLang } from '../state/speech';
import { Button, Segmented, Sheet, cx } from './ui';

const EXAMPLES: Record<SpeechLang, string[]> = {
  'en-IN': ['From Gate 1 to U Corridor', 'Jeet se U Corridor', 'Mess Parking to Kudasan'],
  'hi-IN': ['गेट 1 से यू कॉरिडोर', 'जीत से यू कॉरिडोर', 'कुडासन जाना है'],
};

function loadLang(): SpeechLang {
  try {
    return localStorage.getItem('gati:voiceLang') === 'hi-IN' ? 'hi-IN' : 'en-IN';
  } catch {
    return 'en-IN';
  }
}

/**
 * Mic button plus the listening sheet. Recognition starts inside the tap
 * handler so the browser can prompt for the microphone.
 */
export function VoiceRouteButton({ bus, current, onApply, onPickManually, label = 'Change stops by voice', className }: { bus: BusData; current: RoutePair; onApply: (p: RoutePair) => void; onPickManually?: () => void; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<SpeechLang>(loadLang);
  const [result, setResult] = useState<VoiceRouteResult | null>(null);
  const speech = useSpeech((alts) => {
    const r = bestRoute(alts, bus, current);
    setResult(r);
    if (r.ok) onApply({ from: r.from, to: r.to });
  });

  // Close shortly after a successful change so the card underneath is visible.
  useEffect(() => {
    if (!open || !result?.ok) return;
    const t = window.setTimeout(() => setOpen(false), 1400);
    return () => clearTimeout(t);
  }, [open, result]);

  const listen = () => {
    setResult(null);
    if (speech.supported) speech.start(lang);
  };
  const openAndListen = () => {
    setOpen(true);
    listen();
  };
  const close = () => {
    speech.stop();
    setOpen(false);
  };
  const changeLang = (l: SpeechLang) => {
    setLang(l);
    try {
      localStorage.setItem('gati:voiceLang', l);
    } catch {
      /* ignore */
    }
  };

  const status = !speech.supported
    ? 'Voice input isn’t available in this browser. Chrome, Edge and Safari support it.'
    : speech.listening
      ? 'Listening… say where you’re boarding and where you’re going.'
      : speech.error
        ? speechErrorMessage(speech.error)
        : result && !result.ok
          ? result.message
          : result?.ok
            ? null
            : 'Tap the mic and speak.';

  return (
    <>
      <button onClick={openAndListen} aria-label={label} title={label} className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent hover:bg-accent/15', className)}>
        <Mic size={17} />
      </button>
      <Sheet
        open={open}
        onClose={close}
        title="Say your trip"
        footer={
          <div className="flex items-center justify-between gap-3">
            {onPickManually ? (
              <Button
                variant="quiet"
                onClick={() => {
                  close();
                  onPickManually();
                }}
              >
                Pick stops instead
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={close}>Done</Button>
          </div>
        }
      >
        <div className="flex flex-col items-center pb-2 pt-1 text-center">
          <Segmented<SpeechLang>
            label="Voice language"
            value={lang}
            onChange={changeLang}
            options={[
              { value: 'en-IN', label: 'English' },
              { value: 'hi-IN', label: 'हिन्दी' },
            ]}
          />
          <button
            onClick={speech.listening ? speech.stop : listen}
            disabled={!speech.supported}
            aria-label={speech.listening ? 'Stop listening' : 'Start listening'}
            aria-pressed={speech.listening}
            className={cx(
              'relative my-6 grid h-20 w-20 place-items-center rounded-full text-white transition-colors disabled:bg-line disabled:text-muted',
              result?.ok ? 'bg-meal' : 'bg-accent',
            )}
          >
            {speech.listening && <span className="pulse-dot absolute inset-[-8px] rounded-full bg-accent/20" aria-hidden />}
            {!speech.supported ? <MicOff size={30} /> : result?.ok ? <Check size={32} /> : <Mic size={30} />}
          </button>

          <p className="min-h-[24px] text-[17px] font-medium" aria-live="polite">
            {result?.ok ? result.summary : speech.interim ? `“${speech.interim}”` : ''}
          </p>
          {status && (
            <p className={cx('mt-1 max-w-[320px] text-[14px] leading-snug', speech.error || (result && !result.ok) ? 'text-ink' : 'text-muted')} role="status">
              {status}
            </p>
          )}
          {result?.ok && <p className="mt-1 text-[14px] text-meal">Updated. Showing buses for this trip.</p>}
        </div>

        {!result?.ok && (
          <div className="mt-2 rounded-tile bg-sunken px-4 py-3">
            <p className="mb-1.5 text-[13px] font-medium text-muted">You can say</p>
            <ul className="space-y-1 text-[14px]">
              {EXAMPLES[lang].map((e) => (
                <li key={e}>“{e}”</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-muted">Your browser’s speech service turns speech into text and may process audio online. Gati only uses the text, and only for this trip.</p>
      </Sheet>
    </>
  );
}
