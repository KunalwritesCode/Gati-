// Deterministic bus scheduling. Pure functions over the dataset and a clock;
// no network, no AI. Used by the UI, the offline assistant and the AI tools.

import type { BusData, Dataset, Route, ServiceException, Stop, Trip, Vehicle } from './types';
import { MINUTE, addDays, hhmmToMinutes, startOfDayMs, weekdayOf, zoned } from './time';
import { formatMinutes } from './format';

/** A departure stays visible as "departing now" for this long after its scheduled time. */
export const DEPARTING_GRACE_MS = MINUTE;
/** Before this local time, "today's" bus service is still the previous calendar day's (buses run past midnight). */
export const SERVICE_DAY_ROLLOVER_MIN = 4 * 60;

export interface BusFilter {
  from?: string | null; // stop id
  to?: string | null; // stop id
  routeId?: string | null;
  vehicleId?: string | null;
}

export interface Departure {
  key: string;
  trip: Trip;
  route: Route;
  vehicle: Vehicle;
  serviceDate: string;
  /** epoch ms of the scheduled departure at the route's first stop */
  at: number;
  originMinutes: number;
  timeLabel: string;
  origin: Stop;
  final: Stop;
  board: Stop;
  boardIndex: number;
  /** true when the timetable publishes a time at the boarding stop (i.e. it is the route origin) */
  boardTimed: boolean;
  alight: Stop | null;
  alightIndex: number | null;
  /** where this bus is headed from the student's point of view */
  towards: Stop;
  isLoop: boolean;
  starred: boolean;
}

export interface Ctx {
  data: Dataset;
  now: number;
}

// ---------------------------------------------------------------------------
// lookups

export function stopById(bus: BusData, id: string): Stop {
  const s = bus.stops.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stop id ${id}`);
  return s;
}

/** "JRHA (Jeet Royal)" when a stop has a nickname, otherwise the plain name. */
export function stopLabel(s: Stop): string {
  return s.nickname ? `${s.name} (${s.nickname})` : s.name;
}

export function routeById(bus: BusData, id: string): Route | undefined {
  return bus.routes.find((r) => r.id === id);
}

export function vehicleById(bus: BusData, id: string): Vehicle {
  const v = bus.vehicles.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle ${id}`);
  return v;
}

/** Current bus service date: before 4 AM it is still "last night's" service. */
export function currentServiceDate(now: number): string {
  const z = zoned(now);
  return z.minutes < SERVICE_DAY_ROLLOVER_MIN ? addDays(z.dateKey, -1) : z.dateKey;
}

export function serviceException(data: Dataset, dateKey: string, area: 'bus' | 'mess'): ServiceException | undefined {
  return data.meta.serviceExceptions.find((e) => e.date === dateKey && (e.appliesTo === area || e.appliesTo === 'all'));
}

export function tripRunsOn(data: Dataset, trip: Trip, dateKey: string): boolean {
  const exc = serviceException(data, dateKey, 'bus');
  if (exc?.type === 'no_service') return false;
  const cal = data.bus.calendars.find((c) => c.id === trip.calendarId);
  if (!cal) return false;
  return cal.days.includes(weekdayOf(dateKey));
}

/**
 * Where a student boards and alights on a route. When the same stop appears
 * twice (the ★ loop passes Gate 1 and Research Park Circle in both
 * directions) the shortest ride wins.
 */
export function matchRoute(route: Route, from?: string | null, to?: string | null): { i: number; j: number | null } | null {
  const s = route.stops;
  const last = s.length - 1;
  if (from && to && from === to) return null;
  if (!from && !to) return { i: 0, j: null };
  if (from && !to) {
    const i = s.findIndex((x, k) => x === from && k < last);
    return i === -1 ? null : { i, j: null };
  }
  if (!from && to) {
    if (s[0] === to) return null; // e.g. the loop "to JRHA" — you'd already be there
    const j = s.findIndex((x, k) => x === to && k > 0);
    return j === -1 ? null : { i: 0, j };
  }
  let best: { i: number; j: number } | null = null;
  for (let i = 0; i < last; i++) {
    if (s[i] !== from) continue;
    for (let j = i + 1; j <= last; j++) {
      if (s[j] === to) {
        if (!best || j - i < best.j - best.i) best = { i, j };
        break;
      }
    }
  }
  return best;
}

function makeDeparture(data: Dataset, trip: Trip, route: Route, serviceDate: string, m: { i: number; j: number | null }): Departure {
  const bus = data.bus;
  const originMinutes = hhmmToMinutes(trip.departure);
  const origin = stopById(bus, route.stops[0]);
  const final = stopById(bus, route.stops[route.stops.length - 1]);
  const board = stopById(bus, route.stops[m.i]);
  const alight = m.j == null ? null : stopById(bus, route.stops[m.j]);
  return {
    key: `${trip.id}@${serviceDate}`,
    trip,
    route,
    vehicle: vehicleById(bus, trip.vehicleId),
    serviceDate,
    at: startOfDayMs(serviceDate) + originMinutes * MINUTE,
    originMinutes,
    timeLabel: formatMinutes(originMinutes),
    origin,
    final,
    board,
    boardIndex: m.i,
    boardTimed: m.i === 0,
    alight,
    alightIndex: m.j,
    towards: alight ?? final,
    isLoop: route.stops[0] === route.stops[route.stops.length - 1],
    starred: route.id === 'campus-loop',
  };
}

/** All departures of one service day matching the filter, in time order. */
export function departuresForServiceDate(data: Dataset, serviceDate: string, f: BusFilter = {}): Departure[] {
  const out: Departure[] = [];
  for (const trip of data.bus.trips) {
    if (f.routeId && trip.routeId !== f.routeId) continue;
    if (f.vehicleId && trip.vehicleId !== f.vehicleId) continue;
    if (!tripRunsOn(data, trip, serviceDate)) continue;
    const route = routeById(data.bus, trip.routeId);
    if (!route) continue;
    const m = matchRoute(route, f.from, f.to);
    if (!m) continue;
    out.push(makeDeparture(data, trip, route, serviceDate, m));
  }
  out.sort((a, b) => a.at - b.at || a.vehicle.id.localeCompare(b.vehicle.id));
  return out;
}

export function isDeparted(d: Departure, now: number): boolean {
  return d.at + DEPARTING_GRACE_MS <= now;
}

export function isDepartingNow(d: Departure, now: number): boolean {
  return d.at <= now && now < d.at + DEPARTING_GRACE_MS;
}

/**
 * Upcoming departures from now (or from `fromMs`), across service days.
 * Looks back one day (after-midnight trips) and ahead `horizonDays`.
 */
export function getUpcomingBuses(ctx: Ctx, f: BusFilter = {}, opts: { limit?: number; horizonDays?: number; fromMs?: number } = {}): Departure[] {
  const limit = opts.limit ?? 10;
  const horizon = opts.horizonDays ?? 7;
  const t0 = opts.fromMs ?? ctx.now;
  const today = zoned(t0).dateKey;
  const out: Departure[] = [];
  for (let k = -1; k <= horizon && out.length < limit; k++) {
    const day = addDays(today, k);
    for (const d of departuresForServiceDate(ctx.data, day, f)) {
      if (d.at + DEPARTING_GRACE_MS > t0) out.push(d);
    }
  }
  out.sort((a, b) => a.at - b.at || a.vehicle.id.localeCompare(b.vehicle.id));
  return out.slice(0, limit);
}

export interface NextBusResult {
  next: Departure | null;
  following: Departure[];
  /** true when no further departures remain in the current service day */
  doneForToday: boolean;
  /** the last departure of the current service day (may already be past) */
  lastToday: Departure | null;
  serviceDate: string;
}

export function getNextBus(ctx: Ctx, f: BusFilter = {}, followingCount = 2): NextBusResult {
  const upcoming = getUpcomingBuses(ctx, f, { limit: followingCount + 1 });
  const serviceDate = currentServiceDate(ctx.now);
  const today = departuresForServiceDate(ctx.data, serviceDate, f);
  const lastToday = today.length ? today[today.length - 1] : null;
  const next = upcoming[0] ?? null;
  return {
    next,
    following: upcoming.slice(1),
    doneForToday: !today.some((d) => !isDeparted(d, ctx.now)),
    lastToday,
    serviceDate,
  };
}

export type DepartureStatus = 'past' | 'now' | 'next' | 'upcoming';

export interface ScheduleResult {
  serviceDate: string;
  runs: boolean;
  reason: string | null;
  departures: Departure[];
  nextKey: string | null;
}

/** Full timetable for a service day, with the next departure identified. */
export function getBusSchedule(ctx: Ctx, serviceDate: string, f: BusFilter = {}): ScheduleResult {
  const exc = serviceException(ctx.data, serviceDate, 'bus');
  const deps = departuresForServiceDate(ctx.data, serviceDate, f);
  const next = deps.find((d) => !isDeparted(d, ctx.now)) ?? null;
  return {
    serviceDate,
    runs: deps.length > 0,
    reason: exc?.type === 'no_service' ? exc.note : deps.length === 0 ? 'No scheduled departures match.' : null,
    departures: deps,
    nextKey: next?.key ?? null,
  };
}

export function departureStatus(d: Departure, now: number, nextKey: string | null): DepartureStatus {
  if (isDepartingNow(d, now)) return 'now';
  if (isDeparted(d, now)) return 'past';
  if (d.key === nextKey) return 'next';
  return 'upcoming';
}

export function vehicleLabel(d: Departure): string {
  return d.vehicle.name;
}

/** Human description of where the student boards, honest about untimed stops. */
export function boardingNote(d: Departure): string | null {
  if (d.boardTimed) return null;
  const before = d.route.stops.slice(1, d.boardIndex);
  if (before.length <= 1) return `Leaves ${d.origin.name} at ${d.timeLabel}, passes ${d.board.name} shortly after`;
  return `Leaves ${d.origin.name} at ${d.timeLabel}, reaches ${d.board.name} after ${before.length} other stops`;
}

/** Plain explanation for untimed boarding stops, used on the home card. */
export function boardingExplainer(d: Departure, names: (id: string) => string): string | null {
  if (d.boardTimed) return null;
  const before = d.route.stops.slice(1, d.boardIndex).map(names);
  const path = before.length <= 1 ? `It passes ${d.board.name} shortly after` : `It reaches ${d.board.name} after ${before.slice(0, -1).join(', ')} and ${before[before.length - 1]}`;
  return `Scheduled to leave ${d.origin.name} at ${d.timeLabel}. ${path}; no time is published for this stop.`;
}

/** Day label for a departure, relative to the service day the student is in. */
export function departureDayLabel(d: Departure, now: number, relative: (key: string, today: string) => string): string | null {
  if (d.serviceDate === currentServiceDate(now)) return null;
  return relative(zoned(d.at).dateKey, zoned(now).dateKey);
}

/** "JRHA → U Corridor", "Loop via AB1 Parking & Mess Parking" */
export function directionLabel(d: Departure): string {
  if (d.alight) return `${d.board.name} → ${d.alight.name}`;
  if (d.isLoop && d.boardIndex === 0) return `${d.origin.name} loop via AB1 & Mess Parking`;
  return `${d.board.name} → ${d.final.name}`;
}

// ---------------------------------------------------------------------------
// route search

export interface RouteSummary {
  route: Route;
  stops: Stop[];
  vehicles: Vehicle[];
  tripCount: number;
  first: string;
  last: string;
}

export function summarizeRoute(bus: BusData, route: Route): RouteSummary {
  const trips = bus.trips.filter((t) => t.routeId === route.id);
  const mins = trips.map((t) => hhmmToMinutes(t.departure)).sort((a, b) => a - b);
  const vehicleIds = [...new Set(trips.map((t) => t.vehicleId))];
  return {
    route,
    stops: route.stops.map((id) => stopById(bus, id)),
    vehicles: vehicleIds.map((id) => vehicleById(bus, id)),
    tripCount: trips.length,
    first: mins.length ? formatMinutes(mins[0]) : '—',
    last: mins.length ? formatMinutes(mins[mins.length - 1]) : '—',
  };
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
}

/** Resolve free text ("research park", "JHRA", "gate-1") to a stop. */
export function resolveStop(bus: BusData, text: string | null | undefined): Stop | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;
  for (const s of bus.stops) if (s.id === q || norm(s.name) === q) return s;
  for (const s of bus.stops) if (s.aliases.some((a) => norm(a) === q)) return s;
  const compact = q.replace(/\s/g, '');
  for (const s of bus.stops) {
    const names = [s.name, ...s.aliases].map((n) => norm(n).replace(/\s/g, ''));
    if (names.some((n) => n.length >= 3 && (n.includes(compact) || (compact.length >= 4 && compact.includes(n))))) return s;
  }
  return null;
}

export function resolveVehicle(bus: BusData, text: string | null | undefined): Vehicle | null {
  if (!text) return null;
  const q = norm(text).replace(/\s/g, '');
  const m = /^(?:bus|b)?([12])$/.exec(q);
  if (m) return bus.vehicles.find((v) => v.id === `B${m[1]}`) ?? null;
  if (/56/.test(q)) return bus.vehicles.find((v) => v.id === 'INST56') ?? null;
  if (/29/.test(q) && /inst|kudasan/.test(q)) return bus.vehicles.find((v) => v.id === 'INST29') ?? null;
  return bus.vehicles.find((v) => norm(v.name).replace(/\s/g, '') === q || v.id.toLowerCase() === q) ?? null;
}

export function searchBusRoutes(bus: BusData, query: string): RouteSummary[] {
  const q = norm(query);
  const all = bus.routes.map((r) => summarizeRoute(bus, r));
  if (!q) return all;
  const stop = resolveStop(bus, query);
  const vehicle = resolveVehicle(bus, query);
  return all.filter((s) => {
    if (stop || vehicle) {
      return (!!stop && s.route.stops.includes(stop.id)) || (!!vehicle && s.vehicles.some((v) => v.id === vehicle.id));
    }
    const hay = norm([s.route.name, s.route.shortName, ...s.stops.map((x) => x.name), ...s.vehicles.map((v) => v.name)].join(' '));
    return q.split(' ').every((tok) => hay.includes(tok));
  });
}

/** Stops a student can board at (every stop except pure terminals of one-way routes still qualifies via some route). */
export function boardableStops(bus: BusData): Stop[] {
  const ids = new Set<string>();
  for (const r of bus.routes) r.stops.slice(0, -1).forEach((s) => ids.add(s));
  return bus.stops.filter((s) => ids.has(s.id));
}

/** Destinations reachable from a stop. */
export function destinationsFrom(bus: BusData, from: string): Stop[] {
  const ids = new Set<string>();
  for (const r of bus.routes) {
    const m = matchRoute(r, from, null);
    if (!m) continue;
    r.stops.slice(m.i + 1).forEach((s) => s !== from && ids.add(s));
  }
  return bus.stops.filter((s) => ids.has(s.id));
}
