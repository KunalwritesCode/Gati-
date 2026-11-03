// Vercel serverless function: POST /api/chat
// Needs an API key in the project's environment variables (see .env.example).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { aiEnvFrom, handleChat, readJsonBody } from '../server/chatCore';

type Req = IncomingMessage & { body?: unknown };

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'unsupported_media_type' });

  // Same-origin only when the browser tells us its origin.
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && host && !origin.endsWith(`//${host}`) && !allowed.includes(origin)) return send(res, 403, { error: 'forbidden_origin' });

  let body: unknown = req.body;
  try {
    if (body === undefined || typeof body === 'string') body = typeof body === 'string' ? JSON.parse(body) : await readJsonBody(req);
  } catch {
    return send(res, 400, { error: 'bad_request', message: 'Invalid JSON.' });
  }

  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = fwd || req.socket?.remoteAddress || 'unknown';
  const out = await handleChat(body, {
    ip,
    env: aiEnvFrom(process.env),
  });
  return send(res, out.status, out.body, out.headers);
}
