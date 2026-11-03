import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export interface Preferences {
  /** preferred boarding stop id */
  stopId: string | null;
  /** usual destination stop id, null = any direction */
  destinationId: string | null;
  theme: Theme;
  /** remind before my next bus, minutes; 0 = off */
  reminderMinutes: number;
  onboarded: boolean;
}

const KEY = 'gati:prefs';
const DEFAULTS: Preferences = { stopId: null, destinationId: null, theme: 'system', reminderMinutes: 0, onboarded: false };

function load(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const p = { ...DEFAULTS };
    if (typeof raw.stopId === 'string' || raw.stopId === null) p.stopId = raw.stopId;
    if (typeof raw.destinationId === 'string' || raw.destinationId === null) p.destinationId = raw.destinationId;
    if (['system', 'light', 'dark'].includes(raw.theme)) p.theme = raw.theme;
    if ([0, 5, 10, 15].includes(raw.reminderMinutes)) p.reminderMinutes = raw.reminderMinutes;
    p.onboarded = raw.onboarded === true;
    return p;
  } catch {
    return { ...DEFAULTS };
  }
}

interface PrefsCtx {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(load);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage full or blocked: keep in memory */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setPrefs({ ...DEFAULTS });
  }, []);

  // Theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#101319' : '#F5F6F8'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);

  // Other tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setPrefs(load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ prefs, update, reset }), [prefs, update, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrefs outside provider');
  return c;
}
