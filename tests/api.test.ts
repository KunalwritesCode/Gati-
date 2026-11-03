import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import handler from '../api/chat';

let server: Server;
let url: string;

beforeAll(async () => {
  for (const k of ['AI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
});
afterAll(() => server.close());

const body = JSON.stringify({ messages: [{ role: 'user', content: 'next bus?' }] });

describe('Vercel function /api/chat', () => {
  it('rejects non-POST', async () => {
    const r = await fetch(url);
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST');
  });
  it('requires JSON', async () => {
    expect((await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
  });
  it('rejects other origins', async () => {
    const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
  });
  it('rejects malformed JSON', async () => {
    expect((await fetch(url, { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
  });
  it('reports AI unavailable without a key, never cached', async () => {
    const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toMatchObject({ error: 'ai_unavailable' });
  });
});
