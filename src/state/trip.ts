import { useSyncExternalStore } from 'react';

// A temporary From/To for "right now" (set by voice). It overrides the saved
// preferences on Home until reset, and lasts for this browser session only.

export interface Trip {
  from: string | null;
  to: string | null;
}

const KEY = 'gati:trip';
let trip: Trip | null = load();
const listeners = new Set<() => void>();

function load(): Trip | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (raw && (typeof raw.from === 'string' || raw.from === null) && (typeof raw.to === 'string' || raw.to === null)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function setTrip(next: Trip | null) {
  trip = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useTrip(): Trip | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => trip,
    () => null,
  );
}
