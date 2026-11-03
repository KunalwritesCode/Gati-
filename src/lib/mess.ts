// Deterministic mess-menu logic: what is serving now, what is next, and the
// menu for any date the published menu covers. Never fills gaps.

import type { Dataset, MealId, MealSlot, MenuRow, MessData, WeekdayKey } from './types';
import { MINUTE, WEEKDAY_KEYS, addDays, compareDateKeys, hhmmToMinutes, mondayOf, startOfDayMs, weekdayOf, zoned } from './time';
import { formatHHMM } from './format';
import type { Ctx } from './bus';

export type MealState = 'upcoming' | 'serving' | 'completed';

export interface MealInfo {
  slot: MealSlot;
  dateKey: string;
  startMs: number;
  endMs: number;
  timeLabel: string; // "12:15 PM – 2:15 PM"
  rows: MenuRow[] | null; // null when the menu does not cover this date
}

export interface DailyMenu {
  dateKey: string;
  weekday: WeekdayKey;
  available: boolean;
  reason: string | null;
  meals: MealInfo[];
}

export function menuCovers(mess: MessData, dateKey: string): boolean {
  return compareDateKeys(dateKey, mess.validFrom) >= 0 && compareDateKeys(dateKey, mess.validTo) <= 0;
}

export function weekdayKeyOf(dateKey: string): WeekdayKey {
  return WEEKDAY_KEYS[weekdayOf(dateKey)] as WeekdayKey;
}

export function mealInfo(data: Dataset, slot: MealSlot, dateKey: string): MealInfo {
  const day0 = startOfDayMs(dateKey);
  const covered = menuCovers(data.mess, dateKey);
  const exc = data.meta.serviceExceptions.find((e) => e.date === dateKey && (e.appliesTo === 'mess' || e.appliesTo === 'all'));
  const rows = covered && !exc ? data.mess.days[weekdayKeyOf(dateKey)]?.[slot.id] ?? null : null;
  return {
    slot,
    dateKey,
    startMs: day0 + hhmmToMinutes(slot.start) * MINUTE,
    endMs: day0 + hhmmToMinutes(slot.end) * MINUTE,
    timeLabel: `${formatHHMM(slot.start)} – ${formatHHMM(slot.end)}`,
    rows,
  };
}

export function getDailyMenu(data: Dataset, dateKey: string): DailyMenu {
  const covered = menuCovers(data.mess, dateKey);
  const exc = data.meta.serviceExceptions.find((e) => e.date === dateKey && (e.appliesTo === 'mess' || e.appliesTo === 'all'));
  return {
    dateKey,
    weekday: weekdayKeyOf(dateKey),
    available: covered && !exc,
    reason: exc ? exc.note : covered ? null : `The published menu covers ${data.mess.validFrom} to ${data.mess.validTo} only.`,
    meals: data.mess.meals.map((s) => mealInfo(data, s, dateKey)),
  };
}

/** Monday → Sunday of the week containing dateKey. */
export function getWeeklyMenu(data: Dataset, dateKey: string): DailyMenu[] {
  const mon = mondayOf(dateKey);
  return Array.from({ length: 7 }, (_, i) => getDailyMenu(data, addDays(mon, i)));
}

export function getCurrentMeal(ctx: Ctx): MealInfo | null {
  const today = zoned(ctx.now).dateKey;
  for (const slot of ctx.data.mess.meals) {
    const m = mealInfo(ctx.data, slot, today);
    if (ctx.now >= m.startMs && ctx.now < m.endMs) return m;
  }
  return null;
}

/** The next meal that has not started yet (today or a later day). */
export function getNextMeal(ctx: Ctx): MealInfo | null {
  const today = zoned(ctx.now).dateKey;
  for (let k = 0; k <= 1; k++) {
    const day = addDays(today, k);
    for (const slot of ctx.data.mess.meals) {
      const m = mealInfo(ctx.data, slot, day);
      if (m.startMs > ctx.now) return m;
    }
  }
  return null;
}

export interface MealStatus {
  state: MealState;
  /** the meal the card is about: serving now, the next one today, or (completed) the last one today */
  meal: MealInfo;
  /** completed → tomorrow's first meal; serving → the meal after this one */
  next: MealInfo | null;
}

export function getMealStatus(ctx: Ctx): MealStatus {
  const current = getCurrentMeal(ctx);
  const next = getNextMeal(ctx);
  if (current) return { state: 'serving', meal: current, next };
  const today = zoned(ctx.now).dateKey;
  if (next && next.dateKey === today) return { state: 'upcoming', meal: next, next: null };
  const slots = ctx.data.mess.meals;
  return { state: 'completed', meal: mealInfo(ctx.data, slots[slots.length - 1], today), next };
}

export function stateOfMeal(m: MealInfo, now: number): MealState {
  if (now < m.startMs) return 'upcoming';
  if (now < m.endMs) return 'serving';
  return 'completed';
}

export function rowText(row: MenuRow): string {
  return row.options.map((o) => o.name).join(' or ');
}

export function highlights(rows: MenuRow[] | null): MenuRow[] {
  return rows ? rows.filter((r) => r.highlight) : [];
}

export function mealIdFrom(text: string | null | undefined): MealId | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/break|nash|नाश्ता|subah ka/.test(t)) return 'breakfast';
  if (/lunch|dopahar|दोपहर/.test(t)) return 'lunch';
  if (/snack|nasta shaam|शाम/.test(t)) return 'snacks';
  if (/dinner|raat|रात/.test(t)) return 'dinner';
  return null;
}

// ---------------------------------------------------------------------------
// dish search

export interface MealHit {
  weekday: WeekdayKey;
  mealId: MealId;
  mealName: string;
  category: string;
  name: string;
  /** next date (≥ from) within the menu's validity when this dish is on */
  nextDate: string | null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
}

export function searchMeals(data: Dataset, query: string, fromDateKey: string): MealHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const tokens = q.split(' ').filter((t) => t.length >= 2);
  const hits: MealHit[] = [];
  for (const [wd, meals] of Object.entries(data.mess.days) as [WeekdayKey, Partial<Record<MealId, MenuRow[]>>][]) {
    for (const slot of data.mess.meals) {
      for (const row of meals[slot.id] ?? []) {
        for (const opt of row.options) {
          const hay = norm(opt.name);
          if (tokens.every((t) => hay.includes(t)) || hay.includes(q)) {
            hits.push({ weekday: wd, mealId: slot.id, mealName: slot.name, category: row.category, name: opt.name, nextDate: nextDateFor(data.mess, wd, fromDateKey) });
          }
        }
      }
    }
  }
  hits.sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999') || a.mealId.localeCompare(b.mealId));
  return hits;
}

function nextDateFor(mess: MessData, wd: WeekdayKey, from: string): string | null {
  const target = WEEKDAY_KEYS.indexOf(wd);
  for (let k = 0; k < 7; k++) {
    const d = addDays(from, k);
    if (weekdayOf(d) === target) return menuCovers(mess, d) ? d : null;
  }
  return null;
}
