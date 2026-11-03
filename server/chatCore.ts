// Gati AI request handling, independent of the hosting platform.
// The provider key never leaves the server. The model only chooses tools and
// phrases the answer; every fact comes from runTool().
//
// Works with any OpenAI-compatible chat completions API. The default is
// Groq's free plan (no card) running openai/gpt-oss-20b.

import { bundledDataset } from '../src/data/bundled';
import type { Dataset } from '../src/lib/types';
import { runTool, followUps, toolDefinitions, type Card, type Prefs } from '../src/lib/tools';
import { answerLocally, detectLang } from '../src/lib/localAssistant';
import { formatMinutes, formatDateLong } from '../src/lib/format';
import { zoned } from '../src/lib/time';
import { RateLimiter } from './rateLimit';

export interface ChatEnv {
  /** groq (default) | openai | custom */
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_REASONING_EFFORT?: string;
  /** convenience: the provider's own variable name also works */
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

const ENV_KEYS = ['AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AI_REASONING_EFFORT', 'GROQ_API_KEY', 'OPENAI_API_KEY'] as const;

/** Pick the AI settings out of process.env or Vite's loaded env. */
export function aiEnvFrom(source: Record<string, string | undefined>): ChatEnv {
  const out: ChatEnv = {};
  for (const k of ENV_KEYS) if (source[k]) out[k] = source[k];
  return out;
}

export interface AIConfig {
  provider: string;
  key: string;
  base: string;
  model: string;
  reasoning?: string;
  temperature?: number;
}

const PRESETS: Record<string, { base: string; model: string }> = {
  groq: { base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
};

/** Settings for the chosen provider, or null when no key is configured. */
export function resolveAI(env: ChatEnv): AIConfig | null {
  const provider = (env.AI_PROVIDER || 'groq').toLowerCase();
  const key = env.AI_API_KEY || (provider === 'groq' ? env.GROQ_API_KEY : provider === 'openai' ? env.OPENAI_API_KEY : undefined);
  const preset = PRESETS[provider];
  const base = (env.AI_BASE_URL || preset?.base || '').replace(/\/$/, '');
  const model = env.AI_MODEL || preset?.model || '';
  if (!key || !base || !model) return null;
  return {
    provider,
    key,
    base,
    model,
    // gpt-oss models reason before answering; keep it short so replies stay fast and cheap.
    reasoning: env.AI_REASONING_EFFORT || (/gpt-oss/.test(model) ? 'low' : undefined),
    temperature: provider === 'groq' ? 0.2 : undefined,
  };
}

export interface ChatOptions {
  ip: string;
  env: ChatEnv;
  now?: number;
  fetchImpl?: typeof fetch;
  data?: Dataset;
  limiter?: RateLimiter;
}

export interface ChatResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface InMsg {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGES = 12;
const MAX_USER_CHARS = 500;
const MAX_ASSISTANT_CHARS = 1500;
const MAX_ROUNDS = 4;
const UPSTREAM_TIMEOUT_MS = 20_000;

export const defaultLimiter = new RateLimiter([
  { windowMs: 60_000, max: 12 },
  { windowMs: 60 * 60_000, max: 80 },
]);

function bad(msg: string): ChatResponse {
  return { status: 400, body: { error: 'bad_request', message: msg } };
}

export function validateInput(input: unknown, data: Dataset): { messages: InMsg[]; prefs: Prefs } | string {
  if (typeof input !== 'object' || input === null) return 'Body must be a JSON object.';
  const { messages, prefs } = input as { messages?: unknown; prefs?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return `messages must be an array of 1–${MAX_MESSAGES} items.`;
  const clean: InMsg[] = [];
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) return 'Each message must be an object.';
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return 'role must be "user" or "assistant".';
    if (typeof content !== 'string' || !content.trim()) return 'content must be a non-empty string.';
    const limit = role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    if (content.length > limit) return `A ${role} message is longer than ${limit} characters.`;
    clean.push({ role, content: content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') });
  }
  if (clean[clean.length - 1].role !== 'user') return 'The last message must be from the user.';
  const p: Prefs = {};
  if (prefs && typeof prefs === 'object') {
    const { stopId, destinationId } = prefs as Record<string, unknown>;
    const ids = new Set(data.bus.stops.map((s) => s.id));
    if (typeof stopId === 'string' && ids.has(stopId)) p.stopId = stopId;
    if (typeof destinationId === 'string' && ids.has(destinationId)) p.destinationId = destinationId;
  }
  return { messages: clean, prefs: p };
}

export function systemPrompt(data: Dataset, now: number, prefs: Prefs): string {
  const z = zoned(now);
  const stop = (id?: string | null) => (id ? data.bus.stops.find((s) => s.id === id)?.name : null);
  const stops = data.bus.stops.map((s) => (s.nickname ? `${s.name} (also called ${s.nickname})` : s.name)).join(', ');
  return [
    'You are Gati AI inside Gati, a campus utility for IIT Gandhinagar students (not an official institute app). You answer questions about the bus schedule and the mess menu.',
    `Now: ${formatDateLong(z.dateKey)} ${z.year}, ${formatMinutes(Math.floor(z.minutes))} IST. Preferred stop: ${stop(prefs.stopId) ?? 'not set'}. Usual destination: ${stop(prefs.destinationId) ?? 'not set'}.`,
    `Stops: ${stops}. Buses run about 7 AM to 2 AM; after-midnight buses belong to the previous evening.`,
    'Rules:',
    '- Call a tool before stating any bus time, route, stop, serving time or dish. Never answer these from memory or estimate.',
    '- If a tool errors or finds nothing, say you cannot verify it and point to the Bus or Mess tab.',
    '- These are scheduled departures, not live tracking. Never imply GPS or delays.',
    '- Times are published only at JRHA, U Corridor, Mess Parking and Kudasan. For other stops say the bus passes shortly after leaving its starting stop.',
    '- "A or B" dishes mean either is served.',
    '- Reply in the student\'s language: English, Hindi (Devanagari) or Hinglish (Latin script).',
    '- One to three short sentences, 12-hour times like 7:15 AM, at most three items. The app shows detailed cards under your reply.',
    '- For anything except buses and the mess, say you can only help with those.',
  ].join('\n');
}

const TIME_LIKE = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b/i;

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export async function handleChat(input: unknown, opts: ChatOptions): Promise<ChatResponse> {
  const data = opts.data ?? bundledDataset;
  const now = opts.now ?? Date.now();
  const doFetch = opts.fetchImpl ?? fetch;

  const wait = (opts.limiter ?? defaultLimiter).check(opts.ip, now);
  if (wait > 0) return { status: 429, body: { error: 'rate_limited', retryAfter: wait }, headers: { 'Retry-After': String(wait) } };

  const parsed = validateInput(input, data);
  if (typeof parsed === 'string') return bad(parsed);
  const { messages, prefs } = parsed;
  const lastUser = messages[messages.length - 1].content;
  const lang = detectLang(lastUser);

  const ai = resolveAI(opts.env);
  if (!ai) return { status: 503, body: { error: 'ai_unavailable', message: 'Gati AI is not configured on this server.' } };

  const ctx = { data, now, prefs };
  const convo: ChatMessage[] = [{ role: 'system', content: systemPrompt(data, now, prefs) }, ...messages];
  const cards: Card[] = [];
  const toolsUsed: string[] = [];
  let toolFailRetried = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: Record<string, unknown> = { model: ai.model, messages: convo, tools: toolDefinitions, tool_choice: 'auto', max_completion_tokens: 1500 };
    if (ai.reasoning) body.reasoning_effort = ai.reasoning;
    if (ai.temperature != null) body.temperature = ai.temperature;
    if (round === MAX_ROUNDS - 1) body.tool_choice = 'none';

    let retryRound = false;
    let json: { choices?: { message?: { content?: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] } }[] } | null = null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await doFetch(`${ai.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (res.status === 429) {
        // The free plan's quota is shared by every student. Say "busy" so the app answers on the device.
        const wait = Math.min(300, Math.max(1, Math.ceil(Number(res.headers.get('retry-after')) || 30)));
        console.warn('[gati-ai] upstream rate limit');
        return { status: 429, body: { error: 'rate_limited', upstream: true, retryAfter: wait }, headers: { 'Retry-After': String(wait) } };
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[gati-ai] upstream error', res.status, detail.slice(0, 300));
        // Some open models occasionally emit a malformed tool call; one retry usually fixes it.
        if (res.status === 400 && /tool_use_failed/.test(detail) && !toolFailRetried) {
          toolFailRetried = true;
          retryRound = true;
        } else {
          return { status: 502, body: { error: 'ai_failed', upstreamStatus: res.status } };
        }
      } else {
        json = await res.json();
      }
    } catch (e) {
      console.error('[gati-ai] request failed', (e as Error).name);
      return { status: 504, body: { error: 'ai_timeout' } };
    } finally {
      clearTimeout(timer);
    }

    if (retryRound) {
      round--;
      continue;
    }
    const msg = json?.choices?.[0]?.message;
    if (!msg) return { status: 502, body: { error: 'ai_failed' } };
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function').slice(0, 4);

    if (calls.length && round < MAX_ROUNDS - 1) {
      convo.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: unknown = {};
        try {
          args = JSON.parse(c.function.arguments || '{}');
        } catch {
          args = {};
        }
        const r = runTool(c.function.name, args, ctx);
        toolsUsed.push(c.function.name);
        if (r.card) cards.push(r.card);
        const payload = JSON.stringify(r.ok ? r.data : { error: r.error });
        convo.push({ role: 'tool', tool_call_id: c.id, content: payload.slice(0, 8000) });
      }
      continue;
    }

    let reply = (msg.content ?? '').trim().slice(0, 1200);
    // Guard: a reply that states times without consulting the schedule is discarded.
    if (!reply || (toolsUsed.length === 0 && TIME_LIKE.test(reply))) {
      const local = answerLocally(lastUser, ctx);
      return { status: 200, body: { ...local, source: 'offline', guarded: true } };
    }
    return {
      status: 200,
      body: { reply, cards: cards.slice(-3), suggestions: followUps(toolsUsed, lang), source: 'ai', lang },
    };
  }
  return { status: 502, body: { error: 'ai_failed' } };
}

/** Read a JSON body from a Node request (used by the dev server and as a fallback on Vercel). */
export async function readJsonBody(req: AsyncIterable<Uint8Array | string>, limitBytes = 32_000): Promise<unknown> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    size += buf.length;
    if (size > limitBytes) throw new Error('too_large');
    chunks.push(buf);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  return text ? JSON.parse(text) : {};
}
