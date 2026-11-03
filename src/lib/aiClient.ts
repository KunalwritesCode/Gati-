// Browser side of Gati AI.
//
// Common bus and mess questions are answered on the device first: instant,
// works offline, and uses none of the free AI plan's small shared quota. Only
// questions the on-device parser doesn't recognise go to the serverless AI
// endpoint. If that fails for any reason, the on-device answer is used.
// Set VITE_AI_ALWAYS=1 at build time to send every question to the AI.

import { answerLocally, type AssistantAnswer } from './localAssistant';
import type { Prefs, ToolCtx } from './tools';

export type FallbackReason = 'offline' | 'not_configured' | 'rate_limited' | 'unavailable' | null;

export interface GatiAnswer extends AssistantAnswer {
  fallback: FallbackReason;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const AI_FIRST = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AI_ALWAYS === '1';
let skipAiUntil = 0;
const TIMEOUT_MS = 25_000;

function endpoint(): string {
  return new URL('api/chat', document.baseURI).toString();
}

export async function askGati(history: ChatTurn[], prefs: Prefs, ctx: ToolCtx): Promise<GatiAnswer> {
  const question = history[history.length - 1]?.content ?? '';
  const onDevice = answerLocally(question, ctx);
  const local = (fallback: FallbackReason): GatiAnswer => ({ ...onDevice, fallback });

  if (!AI_FIRST && onDevice.understood) return local(null);

  if (typeof navigator !== 'undefined' && !navigator.onLine) return local('offline');
  if (Date.now() < skipAiUntil) return local('not_configured');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? 500 : 1500) })), prefs: { stopId: prefs.stopId, destinationId: prefs.destinationId } }),
      signal: ac.signal,
    });
    if (res.status === 429) return local('rate_limited');
    if (res.status === 503 || res.status === 404 || res.status === 405) {
      // Not deployed with a key (or no backend at all): stop trying for a while.
      skipAiUntil = Date.now() + 10 * 60_000;
      return local('not_configured');
    }
    if (!res.ok) return local('unavailable');
    const body = (await res.json()) as Partial<AssistantAnswer>;
    if (typeof body.reply !== 'string' || !Array.isArray(body.cards)) return local('unavailable');
    return {
      reply: body.reply,
      cards: body.cards,
      suggestions: Array.isArray(body.suggestions) ? body.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 4) : [],
      source: body.source === 'ai' ? 'ai' : 'offline',
      lang: body.lang ?? 'en',
      fallback: null,
    };
  } catch {
    return local('unavailable');
  } finally {
    clearTimeout(timer);
  }
}
