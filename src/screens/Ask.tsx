import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, CloudOff, RotateCcw, Sparkles } from 'lucide-react';
import { useData } from '../state/data';
import { usePrefs } from '../state/prefs';
import { askGati, type FallbackReason, type ChatTurn } from '../lib/aiClient';
import type { Card as CardT } from '../lib/tools';
import { appNow } from '../state/clock';
import { ResultCard } from '../components/ResultCards';
import { cx } from '../components/ui';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  cards?: CardT[];
  suggestions?: string[];
  source?: 'ai' | 'offline';
  fallback?: FallbackReason;
}

// Kept at module level so the conversation survives switching tabs.
let store: Msg[] = [];
let seq = 1;

const STARTERS = ['When is my next bus?', 'Is there any bus after 7 PM?', "What's for lunch today?", "What is tomorrow's dinner?", 'Paneer kab milega?', 'आज आखिरी बस कब है?'];

function sourceLine(m: Msg): string {
  if (m.source === 'ai') return 'Gati AI, using the published timetable';
  switch (m.fallback) {
    case 'offline':
      return "You're offline. Answered on this device from saved schedules.";
    case 'not_configured':
      return 'Answered on this device from the published timetable.';
    case 'rate_limited':
      return 'Gati AI is busy. Answered on this device from the published timetable.';
    case 'unavailable':
      return "Gati AI didn't respond. Answered on this device from the published timetable.";
    default:
      return 'Answered instantly on this device from the published timetable.';
  }
}

function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');
}

export function Ask({ now, params }: { now: number; params: URLSearchParams }) {
  const { data } = useData();
  const { prefs } = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>(store);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    store = msgs;
  }, [msgs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length, busy]);

  const send = async (text: string) => {
    const q = text.trim().slice(0, 500);
    if (!q || busy) return;
    const user: Msg = { id: seq++, role: 'user', text: q };
    const next = [...store, user];
    setMsgs(next);
    setInput('');
    setBusy(true);
    const history: ChatTurn[] = next.map((m) => ({ role: m.role, content: m.text }));
    const ans = await askGati(history, prefs, { data, now: appNow(), prefs });
    setMsgs((cur) => [...cur, { id: seq++, role: 'assistant', text: ans.reply, cards: ans.cards, suggestions: ans.suggestions, source: ans.source, fallback: ans.fallback }]);
    setBusy(false);
  };

  // Question handed over from the home search.
  const q = params.get('q');
  useEffect(() => {
    if (q && handled.current !== q) {
      handled.current = q;
      try {
        history.replaceState(null, '', `${location.pathname}${location.search}#/ask`);
      } catch {
        /* sandboxed frame */
      }
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const last = msgs[msgs.length - 1];

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col lg:min-h-[calc(100vh-80px)]">
      <header className="mb-4 flex items-center justify-between pt-2">
        <div>
          <h1 className="flex items-center gap-2 text-[30px] font-bold tracking-[-0.02em]">
            <Sparkles size={24} className="text-accent" /> Gati AI
          </h1>
          <p className="text-[14px] text-muted">Ask about buses or the mess in English, हिन्दी or Hinglish.</p>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => setMsgs([])} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-sunken hover:text-ink">
            <RotateCcw size={14} /> New chat
          </button>
        )}
      </header>

      <div className="flex-1 space-y-5 pb-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="pt-4">
            <p className="mb-3 text-[15px] text-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => void send(s)} className="rounded-full bg-surface px-3.5 py-2 text-[14px] ring-1 ring-line hover:bg-sunken">
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-6 max-w-prose text-[13px] leading-relaxed text-muted">
              Gati AI looks every answer up in the published timetable and menu. It never guesses times or dishes, and it can't see where buses are right now.
            </p>
          </div>
        )}

        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-white">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="max-w-[640px] space-y-3">
              <p className="whitespace-pre-line text-[16px] leading-relaxed">{plain(m.text)}</p>
              {m.cards?.map((c, i) => <ResultCard key={i} card={c} now={now} />)}
              <p className="flex items-center gap-1.5 text-[12px] text-muted">
                {m.fallback === 'offline' ? <CloudOff size={12} /> : m.source === 'ai' ? <Sparkles size={12} /> : null}
                {sourceLine(m)}
              </p>
              {m === last && m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {m.suggestions.map((s) => (
                    <button key={s} onClick={() => void send(s)} disabled={busy} className="rounded-full bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line hover:bg-sunken">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 text-[14px] text-muted" role="status">
            <span className="flex gap-1">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-muted [animation-delay:200ms]" />
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-muted [animation-delay:400ms]" />
            </span>
            Checking the schedule
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 -mx-4 bg-bg/90 px-4 pb-3 pt-2 backdrop-blur-xl lg:bottom-0 lg:mx-0 lg:px-0">
        <div className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-4 pr-1.5 shadow-card ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <input id="ask-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask Gati anything..." className="h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" autoComplete="off" enterKeyHint="send" />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Send" className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:bg-line disabled:text-muted')}>
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
