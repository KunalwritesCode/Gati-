import { useEffect, useState } from 'react';
import { hhmmToMinutes, startOfDayMs, isDateKey } from '../lib/time';

/**
 * App clock. Normally the device clock. For testing and demos the URL can
 * pin a simulated IST time: ?now=2026-11-03T22:50 (the app then shows a
 * "Simulated time" banner so it is never mistaken for the real time).
 */
let offsetMs = 0;
let simulated = false;

function initFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('now') ?? new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('now');
    if (!q) return;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(q);
    if (!m || !isDateKey(m[1])) return;
    offsetMs = startOfDayMs(m[1]) + hhmmToMinutes(m[2]) * 60_000 - Date.now();
    simulated = true;
  } catch {
    /* ignore */
  }
}
if (typeof window !== 'undefined') initFromUrl();

export function appNow(): number {
  return Date.now() + offsetMs;
}

export function isSimulatedTime(): boolean {
  return simulated;
}

/**
 * Re-renders every `intervalMs`, aligned to the wall clock, and immediately
 * when the app regains focus or visibility.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(appNow);
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(appNow());
      const n = appNow();
      timer = window.setTimeout(tick, intervalMs - (n % intervalMs) + 5);
    };
    timer = window.setTimeout(tick, intervalMs - (appNow() % intervalMs) + 5);
    const wake = () => document.visibilityState === 'visible' && setNow(appNow());
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [intervalMs]);
  return now;
}
