// Timezone-aware clock helpers. All schedule maths happens in Asia/Kolkata
// wall-clock terms; no schedule string is ever handed to Date.parse.

export const TZ = 'Asia/Kolkata';
export const MINUTE = 60_000;
export const DAY_MIN = 24 * 60;

export interface ZonedNow {
  /** epoch ms this snapshot was taken for */
  ms: number;
  dateKey: string; // YYYY-MM-DD in TZ
  year: number;
  month: number; // 1-12
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  /** minutes since local midnight (fractional seconds included) */
  minutes: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function zoned(ms: number, tz = TZ): ZonedNow {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const dateKey = makeDateKey(parts.year, parts.month, parts.day);
  return {
    ms,
    dateKey,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: weekdayOf(dateKey),
    hour,
    minute: parts.minute,
    second: parts.second,
    minutes: hour * 60 + parts.minute + parts.second / 60,
  };
}

export function makeDateKey(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return { y: +match[1], m: +match[2], d: +match[3] };
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDateKey(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return makeDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function weekdayOf(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Offset of tz from UTC (ms) at the given instant. */
export function tzOffsetMs(ms: number, tz = TZ): number {
  const z = zoned(ms, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of 00:00 local time on dateKey in tz. */
export function startOfDayMs(key: string, tz = TZ): number {
  const { y, m, d } = parseDateKey(key);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle zones whose offset differs across the guess (no-op for IST).
  let offset = tzOffsetMs(guess, tz);
  offset = tzOffsetMs(guess - offset, tz);
  return guess - offset;
}

/** "07:15" → 435; "25:30" → 1530. Throws on malformed input. */
export function hhmmToMinutes(t: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!match) throw new Error(`Invalid time: ${t}`);
  const h = +match[1];
  const m = +match[2];
  if (m > 59 || h > 47) throw new Error(`Invalid time: ${t}`);
  return h * 60 + m;
}

export function isHHMM(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    hhmmToMinutes(s);
    return true;
  } catch {
    return false;
  }
}

export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Monday of the week containing key (weeks run Monday → Sunday, as in the mess menu). */
export function mondayOf(key: string): string {
  const wd = weekdayOf(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
