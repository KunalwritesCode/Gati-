// Best-effort sliding-window rate limiter. In-memory, so on serverless it is
// per warm instance; swap for Upstash/Vercel KV if abuse becomes a problem.

export interface Limit {
  windowMs: number;
  max: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limits: Limit[]) {}

  /** Returns seconds to wait, or 0 when the request is allowed (and recorded). */
  check(key: string, now = Date.now()): number {
    const longest = Math.max(...this.limits.map((l) => l.windowMs));
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    for (const l of this.limits) {
      const inWindow = list.filter((t) => now - t < l.windowMs);
      if (inWindow.length >= l.max) {
        this.hits.set(key, list);
        return Math.max(1, Math.ceil((inWindow[0] + l.windowMs - now) / 1000));
      }
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.prune(now, longest);
    return 0;
  }

  private prune(now: number, longest: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < longest)) this.hits.delete(k);
  }
}
