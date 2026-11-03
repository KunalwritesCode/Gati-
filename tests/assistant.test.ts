import { describe, expect, it, vi } from 'vitest';
import { bundledDataset as data } from '../src/data/bundled';
import { answerLocally, detectLang, parseIntent } from '../src/lib/localAssistant';
import { runTool, type ToolCtx } from '../src/lib/tools';
import { hhmmToMinutes, startOfDayMs } from '../src/lib/time';
import { aiEnvFrom, handleChat, resolveAI, systemPrompt, validateInput } from '../server/chatCore';
import { RateLimiter } from '../server/rateLimit';

const ist = (date: string, hhmm: string) => startOfDayMs(date) + hhmmToMinutes(hhmm) * 60_000;
const TUE = '2026-11-03';
const ctx = (hhmm: string, date = TUE): ToolCtx => ({ data, now: ist(date, hhmm), prefs: { stopId: 'jrha', destinationId: 'ucorridor' } });
const firstTimes = (a: ReturnType<typeof answerLocally>) => (a.cards[0] && a.cards[0].kind === 'departures' ? a.cards[0].items.map((i) => i.time) : []);

describe('on-device understanding', () => {
  it('recognises bus and mess questions so they never need the AI', () => {
    for (const q of ['When is my next bus?', "What's for lunch today?", 'Is there any bus after 7 PM?', 'agli bus kab hai?', 'आज आखिरी बस कब है?', 'paneer kab milega', 'Show buses from Hostel Gate']) {
      expect(answerLocally(q, ctx('08:00')).understood, q).toBe(true);
    }
  });
  it('leaves open-ended questions for the AI', () => {
    for (const q of ["I'm heading out soon, anything I should know?", 'what is the weather like', 'and after that one?']) {
      expect(answerLocally(q, ctx('08:00')).understood, q).toBe(false);
    }
  });
  it('Jeet and Jeet Royal are JRHA', () => {
    expect(answerLocally('Next bus from Jeet Royal', ctx('08:00', TUE)).reply).toMatch(/Next bus from JRHA is at 8:15 AM/);
    const a = answerLocally('Next bus from Jeet', ctx('08:00', TUE));
    expect(a.reply).toMatch(/Next bus from JRHA is at 8:15 AM/);
    expect(answerLocally('jeet se u corridor kab', ctx('13:20')).cards[0]).toMatchObject({ kind: 'departures' });
  });
});

describe('language detection', () => {
  it('detects English, Hinglish and Hindi', () => {
    expect(detectLang('When is my next bus?')).toBe('en');
    expect(detectLang('agli bus kab hai')).toBe('hinglish');
    expect(detectLang('अगली बस कब है?')).toBe('hi');
  });
});

describe('offline assistant', () => {
  it('next bus uses the preferred stop', () => {
    const a = answerLocally('When is my next bus?', ctx('08:00'));
    expect(firstTimes(a)[0]).toBe('8:15 AM');
    expect(a.reply).toMatch(/Next bus from JRHA is at 8:15 AM \(Bus 1\), in 15 min/);
    expect(a.source).toBe('offline');
  });
  it('academic block before 9 AM', () => {
    const a = answerLocally('Is there a bus to the academic block before 9 AM?', ctx('08:00'));
    expect(firstTimes(a)).toEqual(['8:15 AM', '8:45 AM']);
    expect(a.reply).toMatch(/^Yes — 2 scheduled departures/);
  });
  it('academic block before 9 AM when it is already 10 AM → honest empty', () => {
    const a = answerLocally('Is there a bus to the academic block before 9 AM?', ctx('10:00'));
    expect(firstTimes(a)).toEqual([]);
    expect(a.reply).toMatch(/No scheduled bus/);
  });
  it('unknown stop is reported, not guessed', () => {
    const a = answerLocally('Show buses from Hostel Gate', ctx('08:00'));
    expect(a.reply).toMatch(/Unknown stop "hostel gate"/);
    expect(a.cards).toEqual([]);
  });
  it('last bus to an unknown place', () => {
    expect(answerLocally('When is the last bus to the hostel?', ctx('20:00')).reply).toMatch(/Unknown stop "hostel"/);
  });
  it('last bus from U Corridor crosses midnight', () => {
    const a = answerLocally('last bus from u corridor', ctx('23:00'));
    expect(a.reply).toMatch(/1:45 AM/);
  });
  it('after 7 PM', () => {
    const a = answerLocally('Is there any bus after 7 PM?', ctx('12:00'));
    expect(firstTimes(a)[0]).toBe('7:00 PM');
    expect(firstTimes(a)).toHaveLength(5);
  });
  it('Hinglish bus question gets a Hinglish reply', () => {
    const a = answerLocally('agli bus kab hai?', ctx('13:10'));
    expect(a.reply).toMatch(/JRHA se agli bus 1:45 PM par hai/);
  });
  it('Kudasan bus from campus', () => {
    const a = answerLocally('Kudasan bus kab hai', ctx('12:00'));
    expect(firstTimes(a)[0]).toBe('4:30 PM');
  });
  it("lunch today", () => {
    const a = answerLocally("What's for lunch today?", ctx('09:00'));
    expect(a.reply).toMatch(/^Lunch \(12:15 PM – 2:15 PM\): Dal Palak, Soya Chunks Curry/);
  });
  it("tomorrow's dinner in Hindi", () => {
    const a = answerLocally('कल रात के खाने में क्या है?', ctx('09:00'));
    expect(a.lang).toBe('hi');
    expect(a.cards[0]).toMatchObject({ kind: 'menu', dateKey: '2026-11-04' });
    expect(a.reply).toMatch(/Dinner/);
  });
  it('weekly menu', () => {
    expect(parseIntent("Show me this week's mess menu", data.bus)[0]?.tool).toBe('get_weekly_menu');
  });
  it('dish search in Hinglish', () => {
    const a = answerLocally('paneer kab milega', ctx('09:00'));
    expect(a.cards[0]?.kind).toBe('meal-hits');
    expect(a.reply).toMatch(/Dhaabe wala Paneer is on Tuesday dinner|Tuesday ke dinner/);
  });
  it('off-topic gets help, not a guess', () => {
    const a = answerLocally('what is the weather like', ctx('09:00'));
    expect(a.cards).toEqual([]);
    expect(a.reply).toMatch(/bus timings and the mess menu/);
  });
  it('full schedule for Bus 2', () => {
    const a = answerLocally('show full schedule for bus 2', ctx('09:00'));
    expect(a.cards[0]?.kind).toBe('departures');
    if (a.cards[0]?.kind === 'departures') expect(a.cards[0].items).toHaveLength(42);
  });
});

describe('tools', () => {
  it('rejects bad arguments without throwing', () => {
    expect(runTool('get_next_bus', { after: '25:99' }, ctx('08:00')).error).toMatch(/HH:MM/);
    expect(runTool('get_next_bus', { from: 'Narnia' }, ctx('08:00')).error).toMatch(/Unknown stop/);
    expect(runTool('nope', {}, ctx('08:00')).error).toMatch(/Unknown tool/);
    expect(runTool('search_meals', {}, ctx('08:00')).error).toMatch(/query is required/);
    expect(runTool('get_weekly_menu', { day: 'someday' }, ctx('08:00')).error).toMatch(/day must be/);
  });
  it('"after 1 AM" means the end of the service day', () => {
    const r = runTool('get_next_bus', { from: 'U Corridor', after: '01:00' }, ctx('22:00'));
    const d = r.data as { departures: { scheduled_departure: string }[] };
    expect(d.departures.map((x) => x.scheduled_departure)).toEqual(['1:15 AM', '1:45 AM']);
  });
  it('first bus tomorrow', () => {
    const r = runTool('get_next_bus', { first: true, day: 'tomorrow' }, ctx('22:00'));
    expect((r.data as { departures: { scheduled_departure: string; date: string }[] }).departures[0]).toMatchObject({ scheduled_departure: '7:15 AM', date: '2026-11-04' });
  });
  it('menu for a date outside the published month is refused', () => {
    const r = runTool('get_weekly_menu', { day: '2026-12-02' }, ctx('08:00'));
    expect((r.data as { menu_available: boolean }).menu_available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AI handler with a mocked OpenAI

function mockOpenAI(responses: unknown[]) {
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: String((init.headers as Record<string, string>).Authorization), body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (next instanceof Response) return next;
    return new Response(JSON.stringify(next), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const base = (over: Partial<Parameters<typeof handleChat>[1]> = {}) => ({
  ip: '1.2.3.4',
  env: { AI_API_KEY: 'sk-test' },
  now: ist(TUE, '08:00'),
  limiter: new RateLimiter([{ windowMs: 60_000, max: 100 }]),
  ...over,
});
const ask = (content: string) => ({ messages: [{ role: 'user', content }], prefs: { stopId: 'jrha' } });

describe('AI provider settings', () => {
  it('defaults to Groq with a fast open model and a free-plan-friendly setup', () => {
    expect(resolveAI({ GROQ_API_KEY: 'k' })).toMatchObject({ provider: 'groq', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', reasoning: 'low', temperature: 0.2, key: 'k' });
    expect(resolveAI({ AI_API_KEY: 'a', GROQ_API_KEY: 'g' })?.key).toBe('a');
  });
  it('only sets a reasoning effort for models that reason', () => {
    expect(resolveAI({ AI_API_KEY: 'k', AI_MODEL: 'llama-3.3-70b-versatile' })?.reasoning).toBeUndefined();
    expect(resolveAI({ AI_API_KEY: 'k', AI_MODEL: 'openai/gpt-oss-120b' })?.reasoning).toBe('low');
    expect(resolveAI({ AI_API_KEY: 'k', AI_REASONING_EFFORT: 'medium' })?.reasoning).toBe('medium');
  });
  it('supports OpenAI and custom endpoints, and needs a key', () => {
    expect(resolveAI({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' })).toMatchObject({ base: 'https://api.openai.com/v1', model: 'gpt-5-mini', temperature: undefined });
    expect(resolveAI({ AI_PROVIDER: 'custom', AI_API_KEY: 'k' })).toBeNull(); // no base URL or model
    expect(resolveAI({ AI_PROVIDER: 'custom', AI_API_KEY: 'k', AI_BASE_URL: 'https://x.test/v1/', AI_MODEL: 'm' })).toMatchObject({ base: 'https://x.test/v1', model: 'm' });
    expect(resolveAI({})).toBeNull();
  });
  it('ignores unrelated environment variables', () => {
    expect(aiEnvFrom({ PATH: '/bin', AI_MODEL: 'm', SECRET: 'x' })).toEqual({ AI_MODEL: 'm' });
  });
  it('keeps the per-question prompt small enough for a free plan', () => {
    const sys = systemPrompt(data, ist(TUE, '08:00'), { stopId: 'jrha' });
    expect(sys.length).toBeLessThan(1700);
    expect(sys).toContain('JRHA (also called Jeet Royal)');
  });
});

describe('AI handler', () => {
  it('returns 503 without an API key so the client can fall back', async () => {
    const r = await handleChat(ask('next bus?'), base({ env: {} }));
    expect(r.status).toBe(503);
  });
  it('validates input', async () => {
    expect((await handleChat({ messages: [] }, base())).status).toBe(400);
    expect((await handleChat({ messages: [{ role: 'system', content: 'x' }] }, base())).status).toBe(400);
    expect((await handleChat(ask('x'.repeat(501)), base())).status).toBe(400);
    expect(validateInput({ messages: [{ role: 'user', content: 'hi' }], prefs: { stopId: '<script>' } }, data)).toMatchObject({ prefs: {} });
  });
  it('rate limits per IP', async () => {
    const limiter = new RateLimiter([{ windowMs: 60_000, max: 2 }]);
    const o = base({ env: {}, limiter });
    await handleChat(ask('a'), o);
    await handleChat(ask('a'), o);
    const r = await handleChat(ask('a'), o);
    expect(r.status).toBe(429);
    expect(r.headers?.['Retry-After']).toBeDefined();
  });
  it('runs tools chosen by the model and returns engine-built cards', async () => {
    const { fn, calls } = mockOpenAI([
      { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_next_bus', arguments: '{"from":"JRHA"}' } }] } }] },
      { choices: [{ message: { content: 'Your next bus leaves JRHA at 8:15 AM on Bus 1.' } }] },
    ]);
    const r = await handleChat(ask('When is my next bus?'), base({ fetchImpl: fn }));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('ai');
    expect(r.body.reply).toBe('Your next bus leaves JRHA at 8:15 AM on Bus 1.');
    const cards = r.body.cards as { kind: string; items: { time: string }[] }[];
    expect(cards[0].items[0].time).toBe('8:15 AM');
    // the tool result was sent back to the model
    const second = calls[1].body.messages as { role: string; content: string }[];
    expect(second.find((m) => m.role === 'tool')?.content).toContain('8:15 AM');
    // key is not echoed anywhere in the response
    expect(JSON.stringify(r.body)).not.toContain('sk-test');
  });
  it('calls the configured provider with its key, model and settings', async () => {
    const { fn, calls } = mockOpenAI([{ choices: [{ message: { content: 'Hello.' } }] }]);
    await handleChat(ask('hi there'), base({ fetchImpl: fn, env: { GROQ_API_KEY: 'gsk-test' } }));
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0].auth).toBe('Bearer gsk-test');
    expect(calls[0].body).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low', temperature: 0.2, tool_choice: 'auto' });
  });
  it('keeps the request small: tools plus prompt under ~1,500 tokens', async () => {
    const { fn, calls } = mockOpenAI([{ choices: [{ message: { content: 'Hello.' } }] }]);
    await handleChat(ask('hi there'), base({ fetchImpl: fn }));
    const chars = JSON.stringify(calls[0].body.tools).length + JSON.stringify(calls[0].body.messages).length;
    expect(chars / 3.6).toBeLessThan(1500);
  });
  it('treats an upstream 429 as "busy" so the app answers on the device', async () => {
    const { fn } = mockOpenAI([new Response('{"error":"rate_limit_exceeded"}', { status: 429, headers: { 'retry-after': '17' } })]);
    const r = await handleChat(ask('next bus?'), base({ fetchImpl: fn }));
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: 'rate_limited', upstream: true, retryAfter: 17 });
    expect(r.headers?.['Retry-After']).toBe('17');
  });
  it('retries once when the model emits a malformed tool call', async () => {
    const failure = () => new Response('{"error":{"code":"tool_use_failed","message":"Failed to call a function"}}', { status: 400 });
    const okTool = { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_today_menu', arguments: '{}' } }] } }] };
    const { fn, calls } = mockOpenAI([failure(), okTool, { choices: [{ message: { content: 'Breakfast is being served now.' } }] }]);
    const r = await handleChat(ask('anything for me today'), base({ fetchImpl: fn }));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('ai');
    expect(calls).toHaveLength(3);
    // a second failure is not retried forever
    const twice = mockOpenAI([failure(), failure()]);
    expect((await handleChat(ask('anything for me today'), base({ fetchImpl: twice.fn }))).status).toBe(502);
  });
  it('discards a reply that states times without consulting the schedule', async () => {
    const { fn } = mockOpenAI([{ choices: [{ message: { content: 'The next bus is at 9:00 AM.' } }] }]);
    const r = await handleChat(ask('When is my next bus?'), base({ fetchImpl: fn }));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('offline');
    expect(r.body.guarded).toBe(true);
    expect(r.body.reply).toMatch(/8:15 AM/);
  });
  it('reports upstream failure so the client falls back', async () => {
    const { fn } = mockOpenAI([new Response('nope', { status: 500 })]);
    const r = await handleChat(ask('next bus'), base({ fetchImpl: fn }));
    expect(r.status).toBe(502);
  });
  it('survives malformed tool arguments', async () => {
    const { fn } = mockOpenAI([
      { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_today_menu', arguments: '{not json' } }] } }] },
      { choices: [{ message: { content: 'Breakfast is being served now.' } }] },
    ]);
    const r = await handleChat(ask("what's cooking"), base({ fetchImpl: fn }));
    expect(r.status).toBe(200);
    expect((r.body.cards as { kind: string }[])[0].kind).toBe('menu');
  });
  it('stops after four rounds', async () => {
    const loop = { choices: [{ message: { content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'search_bus_routes', arguments: '{}' } }] } }] };
    const { fn, calls } = mockOpenAI([loop, loop, loop, { choices: [{ message: { content: 'Here are the routes.' } }] }]);
    const r = await handleChat(ask('routes'), base({ fetchImpl: fn }));
    expect(calls).toHaveLength(4);
    expect(calls[3].body.tool_choice).toBe('none');
    expect(r.status).toBe(200);
  });
});
