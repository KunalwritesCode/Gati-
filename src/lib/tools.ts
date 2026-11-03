// Gati AI tool layer. The same definitions and executor run on the server
// (for OpenAI function calling) and in the browser (offline assistant), so
// every answer, AI or not, comes from the deterministic engine.

import type { Dataset, MealId } from './types';
import {
  type BusFilter,
  type Ctx,
  type Departure,
  boardingNote,
  currentServiceDate,
  departureDayLabel,
  departureStatus,
  directionLabel,
  getBusSchedule,
  getNextBus,
  isDeparted,
  matchRoute,
  resolveStop,
  resolveVehicle,
  searchBusRoutes,
} from './bus';
import { getDailyMenu, getMealStatus, getWeeklyMenu, highlights, mealIdFrom, rowText, searchMeals, stateOfMeal, type MealInfo } from './mess';
import { SERVICE_DAY_ROLLOVER_MIN } from './bus';
import { DAY_MIN, WEEKDAY_KEYS, WEEKDAY_NAMES, addDays, hhmmToMinutes, isDateKey, isHHMM, weekdayOf, zoned } from './time';
import { formatCountdown, formatDateLong, formatMinutes, relativeDayLabel } from './format';

export interface Prefs {
  stopId?: string | null;
  destinationId?: string | null;
}

export interface ToolCtx extends Ctx {
  prefs: Prefs;
}

// ---------------------------------------------------------------------------
// cards — structured results rendered by the UI (never produced by the LLM)

export interface DepItem {
  key: string;
  at: number;
  time: string;
  bus: string;
  seats: number;
  direction: string;
  note: string | null;
  starred: boolean;
  dayLabel: string | null;
  status: 'past' | 'now' | 'next' | 'upcoming';
}

export interface MenuCardMeal {
  id: MealId;
  name: string;
  time: string;
  state: 'upcoming' | 'serving' | 'completed';
  rows: { category: string; text: string; diets: string[]; highlight: boolean }[] | null;
}

export type Card =
  | { kind: 'departures'; title: string; subtitle: string | null; items: DepItem[]; empty: string | null; link: string }
  | { kind: 'menu'; title: string; subtitle: string | null; dateKey: string; meals: MenuCardMeal[]; empty: string | null; link: string }
  | { kind: 'routes'; title: string; items: { id: string; title: string; stops: string[]; buses: string[]; first: string; last: string; trips: number }[]; link: string }
  | { kind: 'meal-hits'; title: string; items: { day: string; meal: string; category: string; name: string; when: string | null }[]; empty: string | null; link: string };

export interface ToolResult {
  ok: boolean;
  /** compact facts for the language model */
  data: unknown;
  error?: string;
  card?: Card;
}

// ---------------------------------------------------------------------------
// OpenAI tool schemas

const stopNote = 'Stop as the student wrote it: JRHA (also called Jeet Royal, or just Jeet), U Corridor, Gate 1, Research Park Circle, AB1 Parking, Mess Parking, Rakshashakti Circle, Kudasan.';
const dayParam = { type: 'string', description: 'today, tomorrow, a weekday or YYYY-MM-DD. Default today.' };
const mealParam = { type: 'string', enum: ['breakfast', 'lunch', 'snacks', 'dinner'] };

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'search_bus_routes',
      description: 'List routes (stops in order, buses, first and last times). Optional query: a stop, bus or destination.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_next_bus',
      description: "Next scheduled departures from now. Without from, uses the student's preferred stop. after/before are 24h HH:MM limits; last or first returns the last or first bus of the day.",
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: stopNote },
          to: { type: 'string', description: 'Destination stop.' },
          after: { type: 'string', description: 'HH:MM' },
          before: { type: 'string', description: 'HH:MM' },
          day: dayParam,
          count: { type: 'integer', minimum: 1, maximum: 10 },
          last: { type: 'boolean' },
          first: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bus_schedule',
      description: 'Full timetable for one day, optionally for given stops or one bus.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: stopNote },
          to: { type: 'string' },
          bus: { type: 'string', description: 'Bus 1, Bus 2, Institute 56-seater or Institute 29-seater.' },
          day: dayParam,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_menu',
      description: "Today's mess menu, serving times, and what is serving now or next.",
      parameters: { type: 'object', properties: { meal: mealParam }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weekly_menu',
      description: 'Mess menu for another day (tomorrow, friday, a date) or the whole week when day is omitted.',
      parameters: { type: 'object', properties: { day: dayParam, meal: mealParam }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_meals',
      description: 'Which days and meals serve a dish or ingredient.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    },
  },
] as const;

export type ToolName = (typeof toolDefinitions)[number]['function']['name'];
export const TOOL_NAMES = toolDefinitions.map((t) => t.function.name) as ToolName[];

// ---------------------------------------------------------------------------
// argument helpers

class ToolError extends Error {}

function str(args: Record<string, unknown>, k: string, max = 80): string | undefined {
  const v = args[k];
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw new ToolError(`${k} must be a string`);
  return v.trim().slice(0, max);
}

function stopArg(ctx: ToolCtx, args: Record<string, unknown>, k: 'from' | 'to'): string | undefined {
  const v = str(args, k);
  if (!v) return undefined;
  const s = resolveStop(ctx.data.bus, v);
  if (!s) throw new ToolError(`Unknown stop "${v}". Known stops: ${ctx.data.bus.stops.map((x) => x.name).join(', ')}.`);
  return s.id;
}

function timeArg(args: Record<string, unknown>, k: string): number | undefined {
  const v = str(args, k, 5);
  if (!v) return undefined;
  if (!isHHMM(v) || hhmmToMinutes(v) >= DAY_MIN) throw new ToolError(`${k} must be HH:MM (24-hour)`);
  const m = hhmmToMinutes(v);
  // Buses run past midnight: 1 AM belongs to the end of the service day.
  return m < SERVICE_DAY_ROLLOVER_MIN ? m + DAY_MIN : m;
}

/** Resolve "today" / "tomorrow" / weekday / YYYY-MM-DD to a date key. */
export function resolveDay(_ctx: Ctx, v: string | undefined, base: string): string {
  if (!v || /^(today|aaj|आज)$/i.test(v)) return base;
  const t = v.toLowerCase();
  if (/^(tomorrow|kal|कल)$/.test(t)) return addDays(base, 1);
  if (isDateKey(v)) return v;
  const wd = WEEKDAY_KEYS.findIndex((w) => w === t || (t.length >= 3 && w.slice(0, 3) === t.slice(0, 3)));
  if (wd !== -1) {
    for (let k = 0; k < 7; k++) {
      const d = addDays(base, k);
      if (weekdayOf(d) === wd) return d;
    }
  }
  throw new ToolError(`day must be today, tomorrow, a weekday or YYYY-MM-DD (got "${v}")`);
}

function depItem(d: Departure, now: number, nextKey: string | null, _todayKey: string): DepItem {
  return {
    key: d.key,
    at: d.at,
    time: d.timeLabel,
    bus: d.vehicle.name,
    seats: d.trip.seats,
    direction: directionLabel(d),
    note: boardingNote(d),
    starred: d.starred,
    dayLabel: departureDayLabel(d, now, relativeDayLabel),
    status: departureStatus(d, now, nextKey),
  };
}

function depFacts(d: Departure, now: number) {
  return {
    scheduled_departure: d.timeLabel,
    date: zoned(d.at).dateKey,
    bus: d.vehicle.name,
    seats: d.trip.seats,
    from_stop: d.board.name,
    to: d.towards.name,
    route: d.route.shortName,
    departs_from_origin: d.origin.name,
    time_published_at_your_stop: d.boardTimed,
    note: boardingNote(d),
    minutes_from_now: Math.max(0, Math.round((d.at - now) / 60000)),
    status: isDeparted(d, now) ? 'departed' : 'upcoming',
  };
}

function filterLabel(ctx: ToolCtx, f: BusFilter): string {
  const n = (id?: string | null) => (id ? ctx.data.bus.stops.find((s) => s.id === id)?.name : null);
  const a = n(f.from);
  const b = n(f.to);
  if (a && b) return `${a} → ${b}`;
  if (a) return `From ${a}`;
  if (b) return `To ${b}`;
  return 'All stops';
}

function menuMeal(m: MealInfo, now: number): MenuCardMeal {
  return {
    id: m.slot.id,
    name: m.slot.name,
    time: m.timeLabel,
    state: stateOfMeal(m, now),
    rows: m.rows ? m.rows.map((r) => ({ category: r.category, text: rowText(r), diets: [...new Set(r.options.map((o) => o.diet))], highlight: r.highlight })) : null,
  };
}

function menuFacts(m: MealInfo, now: number, full: boolean) {
  return {
    meal: m.slot.name,
    date: m.dateKey,
    serving_time: m.timeLabel,
    state: stateOfMeal(m, now),
    items: m.rows ? (full ? m.rows : highlights(m.rows)).map((r) => `${r.category}: ${rowText(r)}`) : null,
    menu_available: !!m.rows,
  };
}

// ---------------------------------------------------------------------------
// executors

type Exec = (ctx: ToolCtx, args: Record<string, unknown>) => ToolResult;

const execs: Record<ToolName, Exec> = {
  search_bus_routes(ctx, args) {
    const q = str(args, 'query') ?? '';
    const routes = searchBusRoutes(ctx.data.bus, q);
    return {
      ok: true,
      data: {
        routes: routes.map((r) => ({ route: r.route.shortName, stops_in_order: r.stops.map((s) => s.name), buses: r.vehicles.map((v) => v.name), first_departure: r.first, last_departure: r.last, departures_per_day: r.tripCount, note: r.route.note })),
        times_published_only_at: ctx.data.bus.stops.filter((s) => s.timed).map((s) => s.name),
      },
      card: {
        kind: 'routes',
        title: q ? `Routes matching “${q}”` : 'All bus routes',
        items: routes.map((r) => ({ id: r.route.id, title: `${r.route.name} · ${r.route.shortName}`, stops: r.stops.map((s) => s.name), buses: r.vehicles.map((v) => v.name), first: r.first, last: r.last, trips: r.tripCount })),
        link: '#/bus',
      },
    };
  },

  get_next_bus(ctx, args) {
    const explicitFrom = stopArg(ctx, args, 'from');
    const explicitTo = stopArg(ctx, args, 'to');
    const pref = ctx.prefs.stopId ?? undefined;
    let from = explicitFrom;
    let to = explicitTo;
    if (!from && pref) {
      // Use the preferred stop unless it makes the ride impossible (e.g. "to JRHA" while preferring JRHA).
      if (!to || (pref !== to && ctx.data.bus.routes.some((r) => matchRoute(r, pref, to)))) from = pref;
    }
    if (!explicitFrom && !explicitTo && from === pref) to = ctx.prefs.destinationId ?? undefined;
    const after = timeArg(args, 'after');
    const before = timeArg(args, 'before');
    const countRaw = Number(args.count ?? 3);
    const count = Number.isFinite(countRaw) ? Math.min(10, Math.max(1, Math.round(countRaw))) : 3;
    const f: BusFilter = { from, to };
    const todayKey = zoned(ctx.now).dateKey;
    const serviceToday = currentServiceDate(ctx.now);
    const dayArg = str(args, 'day');
    const day = resolveDay(ctx, dayArg, serviceToday);
    const usedPref = !explicitFrom && !!from && from === pref;

    let list: Departure[];
    let mode = 'next';
    const sched = getBusSchedule(ctx, day, f);
    const all = sched.departures;
    if (args.last === true || args.first === true) {
      mode = args.last ? 'last' : 'first';
      const pick = args.last ? all[all.length - 1] : all[0];
      list = pick ? [pick] : [];
    } else if (after != null || before != null || (dayArg && day !== serviceToday)) {
      mode = 'window';
      const lo = after ?? 0;
      const hi = before ?? Infinity;
      // after-midnight trips (24:xx) count as late evening for "after 7 PM"
      list = all.filter((d) => d.originMinutes >= lo && d.originMinutes <= hi && (day !== serviceToday || !isDeparted(d, ctx.now))).slice(0, count);
    } else {
      const r = getNextBus(ctx, f, count - 1);
      list = r.next ? [r.next, ...r.following] : [];
    }

    const nextKey = list.find((d) => !isDeparted(d, ctx.now))?.key ?? null;
    const label = filterLabel(ctx, f);
    const windowLabel = after != null && before != null ? `${formatMinutes(after)}–${formatMinutes(before)}` : after != null ? `after ${formatMinutes(after)}` : before != null ? `before ${formatMinutes(before)}` : null;
    const dayLabel = relativeDayLabel(day, todayKey);
    const title = mode === 'last' ? `Last bus · ${label}` : mode === 'first' ? `First bus · ${label}` : mode === 'window' ? `${label}${windowLabel ? ` · ${windowLabel}` : ''}` : `Next buses · ${label}`;
    const empty = list.length ? null : sched.reason && !sched.runs && all.length === 0 && sched.reason !== 'No scheduled departures match.' ? sched.reason : `No scheduled departures ${windowLabel ?? ''} ${mode === 'next' ? '' : dayLabel.toLowerCase()} for ${label}.`.replace(/\s+/g, ' ');

    return {
      ok: true,
      data: {
        query: { from: from ?? null, to: to ?? null, day, after: after != null ? formatMinutes(after) : null, before: before != null ? formatMinutes(before) : null, mode, used_preferred_stop: usedPref },
        departures: list.map((d) => depFacts(d, ctx.now)),
        last_departure_today: mode === 'next' ? (all.length ? all[all.length - 1].timeLabel : null) : undefined,
        result: list.length ? 'found' : 'none',
        reminder: 'Scheduled times only — no live tracking. Times are published at the route origin.',
      },
      card: {
        kind: 'departures',
        title,
        subtitle: [dayLabel === 'Today' ? null : dayLabel, usedPref ? 'Your preferred stop' : null].filter(Boolean).join(' · ') || null,
        items: list.map((d) => depItem(d, ctx.now, nextKey, todayKey)),
        empty,
        link: `#/bus?from=${from ?? ''}&to=${to ?? ''}`,
      },
    };
  },

  get_bus_schedule(ctx, args) {
    const from = stopArg(ctx, args, 'from');
    const to = stopArg(ctx, args, 'to');
    const busText = str(args, 'bus');
    const vehicle = busText ? resolveVehicle(ctx.data.bus, busText) : null;
    if (busText && !vehicle) throw new ToolError(`Unknown bus "${busText}". Buses: ${ctx.data.bus.vehicles.map((v) => v.name).join(', ')}.`);
    const todayKey = zoned(ctx.now).dateKey;
    const day = resolveDay(ctx, str(args, 'day'), currentServiceDate(ctx.now));
    const f: BusFilter = { from, to, vehicleId: vehicle?.id };
    const s = getBusSchedule(ctx, day, f);
    const label = [vehicle?.name, filterLabel(ctx, f)].filter(Boolean).join(' · ');
    return {
      ok: true,
      data: {
        day,
        filter: label,
        runs: s.runs,
        reason: s.reason,
        total_departures: s.departures.length,
        first_departure: s.departures[0]?.timeLabel ?? null,
        last_departure: s.departures[s.departures.length - 1]?.timeLabel ?? null,
        // The app shows the complete list in a card; the model only needs a sample.
        departures: s.departures.filter((d) => !isDeparted(d, ctx.now)).slice(0, 12).map((d) => ({ time: d.timeLabel, bus: d.vehicle.name, route: d.route.shortName })),
        note: 'departures lists only the next 12 that have not left yet.',
        calendar_note: ctx.data.bus.calendars[0]?.note,
      },
      card: {
        kind: 'departures',
        title: `Schedule · ${label}`,
        subtitle: formatDateLong(day),
        items: s.departures.map((d) => depItem(d, ctx.now, s.nextKey, todayKey)),
        empty: s.departures.length ? null : s.reason,
        link: `#/bus?from=${from ?? ''}&to=${to ?? ''}`,
      },
    };
  },

  get_today_menu(ctx, args) {
    const meal = mealIdFrom(str(args, 'meal'));
    const today = zoned(ctx.now).dateKey;
    const menu = getDailyMenu(ctx.data, today);
    const status = getMealStatus(ctx);
    const meals = meal ? menu.meals.filter((m) => m.slot.id === meal) : menu.meals;
    return {
      ok: true,
      data: {
        date: today,
        menu_available: menu.available,
        reason: menu.reason,
        status: { state: status.state, meal: status.meal.slot.name, next: status.next ? `${status.next.slot.name} (${relativeDayLabel(status.next.dateKey, today)}) at ${status.next.timeLabel}` : null },
        meals: meals.map((m) => menuFacts(m, ctx.now, !!meal)),
        note: 'Dishes written "A or B" mean either one is served.',
      },
      card: {
        kind: 'menu',
        title: meal ? `${meals[0].slot.name} today` : "Today's menu",
        subtitle: formatDateLong(today),
        dateKey: today,
        meals: meals.map((m) => menuMeal(m, ctx.now)),
        empty: menu.available ? null : menu.reason,
        link: '#/mess',
      },
    };
  },

  get_weekly_menu(ctx, args) {
    const meal = mealIdFrom(str(args, 'meal'));
    const today = zoned(ctx.now).dateKey;
    const dayArg = str(args, 'day');
    if (dayArg) {
      const day = resolveDay(ctx, dayArg, today);
      const menu = getDailyMenu(ctx.data, day);
      const meals = meal ? menu.meals.filter((m) => m.slot.id === meal) : menu.meals;
      const rel = relativeDayLabel(day, today);
      return {
        ok: true,
        data: { date: day, day_label: rel, menu_available: menu.available, reason: menu.reason, meals: meals.map((m) => menuFacts(m, ctx.now, !!meal)) },
        card: {
          kind: 'menu',
          title: `${meal ? meals[0].slot.name : 'Menu'} · ${rel}`,
          subtitle: formatDateLong(day),
          dateKey: day,
          meals: meals.map((m) => menuMeal(m, ctx.now)),
          empty: menu.available ? null : menu.reason,
          link: `#/mess?date=${day}`,
        },
      };
    }
    const week = getWeeklyMenu(ctx.data, today);
    return {
      ok: true,
      data: {
        week: week.map((d) => ({
          date: d.dateKey,
          day: WEEKDAY_NAMES[WEEKDAY_KEYS.indexOf(d.weekday)],
          available: d.available,
          meals: (meal ? d.meals.filter((m) => m.slot.id === meal) : d.meals).map((m) => ({ meal: m.slot.name, items: m.rows ? highlights(m.rows).map(rowText) : null })),
        })),
      },
      card: {
        kind: 'menu',
        title: 'This week',
        subtitle: meal ? `${meal[0].toUpperCase()}${meal.slice(1)} · open Mess for every day` : 'Open Mess to browse every day',
        dateKey: today,
        meals: getDailyMenu(ctx.data, today).meals.filter((m) => !meal || m.slot.id === meal).map((m) => menuMeal(m, ctx.now)),
        empty: null,
        link: '#/mess',
      },
    };
  },

  search_meals(ctx, args) {
    const q = str(args, 'query', 60);
    if (!q) throw new ToolError('query is required');
    const today = zoned(ctx.now).dateKey;
    const hits = searchMeals(ctx.data, q, today);
    return {
      ok: true,
      data: { query: q, matches: hits.map((h) => ({ dish: h.name, weekday: h.weekday, meal: h.mealName, next_date: h.nextDate })), result: hits.length ? 'found' : 'none' },
      card: {
        kind: 'meal-hits',
        title: `“${q}” on the menu`,
        items: hits.slice(0, 12).map((h) => ({
          day: WEEKDAY_NAMES[WEEKDAY_KEYS.indexOf(h.weekday)],
          meal: h.mealName,
          category: h.category,
          name: h.name,
          when: h.nextDate ? relativeDayLabel(h.nextDate, today) : null,
        })),
        empty: hits.length ? null : `“${q}” isn't on this month's menu.`,
        link: '#/mess',
      },
    };
  },
};

export function runTool(name: string, rawArgs: unknown, ctx: ToolCtx): ToolResult {
  if (!(TOOL_NAMES as string[]).includes(name)) return { ok: false, data: null, error: `Unknown tool ${name}` };
  const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  try {
    return execs[name as ToolName](ctx, args);
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, data: null, error: e.message };
    return { ok: false, data: null, error: 'This information could not be verified right now.' };
  }
}

/** Follow-up suggestions chosen from the tools that ran (never from the model). */
export function followUps(tools: string[], lang: 'en' | 'hi' | 'hinglish' = 'en'): string[] {
  const S = {
    en: { last: 'When is the last bus tonight?', after7: 'Any bus after 7 PM?', lunch: "What's for lunch today?", dinnerTmr: "What's tomorrow's dinner?", week: "Show this week's menu", next: 'When is my next bus?', kud: 'Next bus to Kudasan?', paneer: 'When is paneer served?' },
    hinglish: { last: 'Aaj last bus kab hai?', after7: '7 baje ke baad koi bus hai?', lunch: 'Aaj lunch mein kya hai?', dinnerTmr: 'Kal dinner mein kya hai?', week: 'Is hafte ka menu dikhao', next: 'Meri agli bus kab hai?', kud: 'Kudasan ki agli bus kab hai?', paneer: 'Paneer kab milega?' },
    hi: { last: 'आज आखिरी बस कब है?', after7: 'शाम 7 बजे के बाद कोई बस है?', lunch: 'आज दोपहर के खाने में क्या है?', dinnerTmr: 'कल रात के खाने में क्या है?', week: 'इस हफ्ते का मेनू दिखाओ', next: 'मेरी अगली बस कब है?', kud: 'कुडासन की अगली बस कब है?', paneer: 'पनीर कब मिलेगा?' },
  }[lang];
  const busy = tools.some((t) => t.includes('bus'));
  const food = tools.some((t) => t.includes('menu') || t.includes('meal'));
  if (busy && !food) return [S.last, S.after7, S.lunch];
  if (food && !busy) return [S.dinnerTmr, S.week, S.next];
  return [S.next, S.lunch, S.kud];
}

export function describeCountdown(at: number, now: number): string {
  return at <= now ? 'now' : `in ${formatCountdown(at - now)}`;
}

export type { Dataset };
