import { DAY_MIN, MINUTE, WEEKDAY_NAMES, parseDateKey, weekdayOf, addDays } from './time';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** 435 → "7:15 AM"; 1470 → "12:30 AM" */
export function formatMinutes(min: number): string {
  const m = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export function formatHHMM(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return formatMinutes(h * 60 + m);
}

/** Splits "7:15 AM" into ["7:15", "AM"] for typographic treatment. */
export function splitTime(label: string): [string, string] {
  const i = label.lastIndexOf(' ');
  return [label.slice(0, i), label.slice(i + 1)];
}

/** Countdown text for a future instant. */
export function formatCountdown(ms: number): string {
  if (ms < MINUTE) return ms <= 0 ? 'now' : 'under a minute';
  const totalMin = Math.floor(ms / MINUTE);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} day${d > 1 ? 's' : ''}`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Precise countdown "12:04" (mm:ss) when under an hour; otherwise null. */
export function formatClockCountdown(ms: number): string | null {
  if (ms < 0 || ms >= 60 * MINUTE) return null;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDateLong(key: string): string {
  const { m, d } = parseDateKey(key);
  return `${WEEKDAY_NAMES[weekdayOf(key)]}, ${d} ${MONTHS[m - 1]}`;
}

export function formatDateShort(key: string): string {
  const { m, d } = parseDateKey(key);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function relativeDayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, 1)) return 'Tomorrow';
  if (key === addDays(todayKey, -1)) return 'Yesterday';
  return WEEKDAY_NAMES[weekdayOf(key)];
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello, night owl';
}

/** Absolute timestamp for "last checked" style labels, in IST. */
export function formatStamp(ms: number, todayKey: string, zonedFn: (ms: number) => { dateKey: string; minutes: number }): string {
  const z = zonedFn(ms);
  const time = formatMinutes(Math.floor(z.minutes));
  if (z.dateKey === todayKey) return `today, ${time}`;
  if (z.dateKey === addDays(todayKey, -1)) return `yesterday, ${time}`;
  return `${formatDateShort(z.dateKey)}, ${time}`;
}
