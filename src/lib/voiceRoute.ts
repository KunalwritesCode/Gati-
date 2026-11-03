// Turns a spoken phrase into a From/To pair. Handles how speech engines
// actually spell our stops ("j r h a", "you corridor", "gate one") and
// Hindi in Devanagari. Never guesses: unrecognised places are reported.

import type { BusData } from './types';
import { matchRoute } from './bus';
import { findStops, normalize } from './localAssistant';

export interface RoutePair {
  from: string | null;
  to: string | null;
}

export type VoiceRouteResult =
  | { ok: true; from: string | null; to: string | null; heard: string; summary: string }
  | { ok: false; reason: 'no_stop' | 'no_route'; heard: string; message: string };

const DEVANAGARI: [RegExp, string][] = [
  [/जे\s*आर\s*एच\s*ए|जेआरएचए|जे\.आर\.एच\.ए/g, ' jrha '],
  [/गेट\s*(?:नंबर|नं\.?)?\s*(?:1|१|एक|वन)/g, ' gate 1 '],
  [/रिसर्च\s*पार्क(?:\s*सर्कल)?/g, ' research park circle '],
  [/यू\s*(?:कॉरिडोर|कोरिडोर|कॉरीडोर|कोरीडोर)/g, ' u corridor '],
  [/ए\s*बी\s*(?:1|१|एक|वन)|एबी\s*(?:1|१|एक|वन)/g, ' ab1 '],
  [/मेस\s*पार्किंग/g, ' mess parking '],
  [/कुडासन|कुडासण|कुडासान/g, ' kudasan '],
  [/रक्षा\s*शक्ति(?:\s*सर्कल)?/g, ' rakshashakti circle '],
  [/जी\s*ट|जीत|जित/g, ' jeet '],
  [/रॉयल|रोयल|रायल|रॉयल्/g, ' royal '],
  [/\s*से(?=\s|$)/g, ' se '],
  [/\s*तक(?=\s|$)/g, ' tak '],
  [/\s*को(?=\s|$)/g, ' ko '],
  [/जाना|जाने|जाऊं|जाना है/g, ' jaana '],
];

const SPOKEN: [RegExp, string][] = [
  [/([a-z])\.(?=[a-z])/g, '$1'], // j.r.h.a
  [/\b(?:you|yu|yoo)\s*-?\s*corr?idor\b/g, 'u corridor'],
  [/\bu\s*-\s*corridor\b/g, 'u corridor'],
  [/\bgate\s*(?:number|no\.?|num)?\s*(?:one|won|1)\b/g, 'gate 1'],
  [/\b(?:a\s*b|ab|abe|a\.b\.)\s*(?:one|won|1)\b/g, 'ab1'],
  [/\b(?:academic block|academic)\s*(?:one|1)?\s*parking\b/g, 'ab1 parking'],
  [/\bkuda\s*-?\s*(?:san|sun|saan)\b|\bkudasun\b|\bkudasaan\b|\bkudaasan\b/g, 'kudasan'],
  [/\braksha\s*shakti\b/g, 'rakshashakti'],
  [/\b(?:j\s*r\s*h\s*a|jrh\s*a|j\s*rha|jr\s*ha)\b/g, 'jrha'],
  [/\b(?:jeat|jeete|jeeth|jeeta|geet|gheet|jit)\b/g, 'jeet'],
  [/\b(?:royale|royel|royall)\b/g, 'royal'],
  [/\bresearch\s*park\b/g, 'research park'],
];

export function normalizeSpoken(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const [re, rep] of DEVANAGARI) t = t.replace(re, rep);
  t = t.replace(/[,!?]/g, ' ');
  // collapse letters spelled out one by one: "j r h a" → "jrha"
  t = t.replace(/\b(?:[a-z]\s){2,}[a-z]\b/g, (m) => m.replace(/\s/g, ''));
  for (const [re, rep] of SPOKEN) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim();
}

const nameOf = (bus: BusData, id: string | null) => (id ? bus.stops.find((s) => s.id === id)?.name ?? id : null);

export function routeExists(bus: BusData, from: string | null, to: string | null): boolean {
  if (from && to && from === to) return false;
  return bus.routes.some((r) => matchRoute(r, from, to));
}

export function describePair(bus: BusData, p: RoutePair): string {
  const f = nameOf(bus, p.from);
  const t = nameOf(bus, p.to);
  if (f && t) return `${f} → ${t}`;
  if (f) return `From ${f}, any direction`;
  if (t) return `Buses to ${t}`;
  return 'All stops';
}

/** Interpret one transcript against the student's current trip. */
export function parseRouteUtterance(text: string, bus: BusData, current: RoutePair): VoiceRouteResult {
  const heard = text.trim();
  const t = ` ${normalize(normalizeSpoken(heard))} `;
  const mentions = findStops(bus, t);
  if (!mentions.length) {
    return { ok: false, reason: 'no_stop', heard, message: 'I didn’t catch a stop name. Try “from Gate 1 to U Corridor”.' };
  }
  let from: string | null = null;
  let to: string | null = null;
  for (const m of mentions) {
    if (m.role === 'from' && !from) from = m.id;
    else if (m.role === 'to' && !to) to = m.id;
  }
  for (const m of mentions) {
    if (m.role || m.id === from || m.id === to) continue;
    if (!from && !to && mentions.length === 1) {
      // a single unmarked place: off-campus places are destinations, campus ones are where you board
      const stop = bus.stops.find((s) => s.id === m.id)!;
      if (stop.area === 'city') to = m.id;
      else from = m.id;
    } else if (!from) from = m.id;
    else if (!to) to = m.id;
  }

  // "from <something we don't know>" must not silently fall back to the current stop.
  const saidFrom = /\bfrom\s+([a-z0-9-]+(?:\s+[a-z0-9-]+)?)/.exec(t);
  if (!from && saidFrom) {
    const phrase = saidFrom[1].replace(/\s+(to|towards|se|tak)\b.*$/, '');
    return { ok: false, reason: 'no_stop', heard, message: `I didn’t recognise “${phrase}” as a stop. Try saying it again.` };
  }

  // Only a destination: keep the current boarding stop when that ride exists.
  if (!from && to) {
    if (current.from && current.from !== to && routeExists(bus, current.from, to)) from = current.from;
  }

  if (from && to && !routeExists(bus, from, to)) {
    return { ok: false, reason: 'no_route', heard, message: from === to ? `${nameOf(bus, from)} is both the start and the end. Say where you’re going.` : `No bus route goes from ${nameOf(bus, from)} to ${nameOf(bus, to)}.` };
  }
  if (from && !to && !routeExists(bus, from, null)) {
    return { ok: false, reason: 'no_route', heard, message: `Buses don’t start from ${nameOf(bus, from)}; it’s the end of the line.` };
  }
  if (!from && to && !routeExists(bus, null, to)) {
    return { ok: false, reason: 'no_route', heard, message: `No bus route ends at ${nameOf(bus, to)}.` };
  }
  return { ok: true, from, to, heard, summary: describePair(bus, { from, to }) };
}

/** Try every alternative the recogniser offered; first one that names a valid trip wins. */
export function bestRoute(alternatives: string[], bus: BusData, current: RoutePair): VoiceRouteResult {
  let firstFailure: VoiceRouteResult | null = null;
  let routeFailure: VoiceRouteResult | null = null;
  for (const alt of alternatives) {
    if (!alt.trim()) continue;
    const r = parseRouteUtterance(alt, bus, current);
    if (r.ok) return r;
    if (r.reason === 'no_route' && !routeFailure) routeFailure = r;
    if (!firstFailure) firstFailure = r;
  }
  return routeFailure ?? firstFailure ?? { ok: false, reason: 'no_stop', heard: '', message: 'I didn’t hear anything. Tap the mic and try again.' };
}
