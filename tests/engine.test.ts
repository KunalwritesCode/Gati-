import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/data/bundled';
import type { Dataset } from '../src/lib/types';
import {
  boardingNote,
  departureDayLabel,
  currentServiceDate,
  departureStatus,
  departuresForServiceDate,
  destinationsFrom,
  getBusSchedule,
  getNextBus,
  getUpcomingBuses,
  matchRoute,
  resolveStop,
  resolveVehicle,
  searchBusRoutes,
} from '../src/lib/bus';
import { getCurrentMeal, getDailyMenu, getMealStatus, getNextMeal, getWeeklyMenu, rowText, searchMeals } from '../src/lib/mess';
import { addDays, hhmmToMinutes, mondayOf, startOfDayMs, zoned } from '../src/lib/time';
import { formatCountdown, formatMinutes, relativeDayLabel } from '../src/lib/format';
import { compareVersions, validateDataset } from '../src/lib/validate';

const data = bundledDataset;
/** epoch ms for a wall-clock time in IST */
const ist = (date: string, hhmm: string) => startOfDayMs(date) + hhmmToMinutes(hhmm) * 60_000;
const ctx = (date: string, hhmm: string, d: Dataset = data) => ({ data: d, now: ist(date, hhmm) });
const TUE = '2026-11-03';
const WED = '2026-11-04';

describe('time helpers', () => {
  it('converts to Asia/Kolkata wall clock regardless of host timezone', () => {
    const z = zoned(Date.UTC(2026, 10, 3, 18, 45)); // 18:45 UTC = 00:15 IST next day
    expect(z.dateKey).toBe(WED);
    expect(z.hour).toBe(0);
    expect(z.minute).toBe(15);
    expect(z.weekday).toBe(3);
  });
  it('computes IST midnight', () => {
    expect(startOfDayMs(TUE)).toBe(Date.UTC(2026, 10, 2, 18, 30));
  });
  it('parses after-midnight service times', () => {
    expect(hhmmToMinutes('25:45')).toBe(1545);
    expect(formatMinutes(1545)).toBe('1:45 AM');
    expect(formatMinutes(720)).toBe('12:00 PM');
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(() => hhmmToMinutes('7.15')).toThrow();
  });
  it('finds the Monday of a week and rolls months', () => {
    expect(mondayOf(TUE)).toBe('2026-11-02');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('formats countdowns', () => {
    expect(formatCountdown(12 * 60_000 + 5000)).toBe('12 min');
    expect(formatCountdown(65 * 60_000)).toBe('1 h 5 min');
    expect(formatCountdown(30_000)).toBe('under a minute');
  });
});

describe('route matching', () => {
  const loop = data.bus.routes.find((r) => r.id === 'campus-loop')!;
  it('picks the shortest ride when a stop repeats on the loop', () => {
    expect(matchRoute(loop, 'gate1', 'jrha')).toEqual({ i: 7, j: 8 });
    expect(matchRoute(loop, 'gate1', 'ucorridor')).toEqual({ i: 1, j: 5 });
  });
  it('rejects same-stop and impossible rides', () => {
    expect(matchRoute(loop, 'jrha', 'jrha')).toBeNull();
    expect(matchRoute(loop, 'ucorridor', 'ab1')).toBeNull();
    expect(matchRoute(loop, null, 'jrha')).toBeNull();
  });
  it('resolves stop names and aliases', () => {
    expect(resolveStop(data.bus, 'JHRA')?.id).toBe('jrha');
    expect(resolveStop(data.bus, 'research park')?.id).toBe('rpc');
    expect(resolveStop(data.bus, 'gate-1')?.id).toBe('gate1');
    expect(resolveStop(data.bus, 'academic block')?.id).toBe('ab1');
    expect(resolveStop(data.bus, 'Jeet Royal')?.id).toBe('jrha');
    expect(resolveStop(data.bus, 'jeet')?.id).toBe('jrha');
    expect(resolveStop(data.bus, 'JEET ROYAL')?.id).toBe('jrha');
    expect(resolveStop(data.bus, 'hostel gate')).toBeNull();
    expect(resolveVehicle(data.bus, 'bus 2')?.id).toBe('B2');
    expect(resolveVehicle(data.bus, 'B1')?.id).toBe('B1');
  });
  it('lists destinations reachable from a stop', () => {
    expect(destinationsFrom(data.bus, 'ucorridor').map((s) => s.id).sort()).toEqual(['gate1', 'jrha', 'rpc']);
  });
});

describe('next bus', () => {
  it('morning: first departure from JRHA is the 7:15 ★ loop on the 56-seater', () => {
    const r = getNextBus(ctx(TUE, '07:00'), { from: 'jrha' });
    expect(r.next?.timeLabel).toBe('7:15 AM');
    expect(r.next?.starred).toBe(true);
    expect(r.next?.trip.seats).toBe(56);
    expect(r.following.map((d) => d.timeLabel)).toEqual(['7:45 AM', '8:15 AM']);
  });
  it('mid-morning: interleaves Bus 1 and Bus 2', () => {
    const r = getNextBus(ctx(TUE, '10:20'), { from: 'jrha' });
    expect([r.next, ...r.following].map((d) => `${d!.timeLabel} ${d!.vehicle.id}`)).toEqual(['10:30 AM B2', '10:45 AM B1', '11:00 AM B2']);
  });
  it('keeps a bus as departing-now for one minute, then moves on', () => {
    const at = getNextBus(ctx(TUE, '10:30'), { from: 'jrha' });
    expect(at.next?.timeLabel).toBe('10:30 AM');
    expect(departureStatus(at.next!, ist(TUE, '10:30'), at.next!.key)).toBe('now');
    const after = getNextBus(ctx(TUE, '10:31'), { from: 'jrha' });
    expect(after.next?.timeLabel).toBe('10:45 AM');
  });
  it('U Corridor in the morning boards the ★ loop (untimed at that stop)', () => {
    const r = getNextBus(ctx(TUE, '08:00'), { from: 'ucorridor' });
    expect(r.next?.timeLabel).toBe('8:15 AM');
    expect(r.next?.boardTimed).toBe(false);
    expect(r.next?.origin.id).toBe('jrha');
  });
  it('U Corridor timed departures start at 10:30', () => {
    const r = getNextBus(ctx(TUE, '10:05'), { from: 'ucorridor' });
    expect(r.next?.timeLabel).toBe('10:30 AM');
    expect(r.next?.boardTimed).toBe(true);
  });
  it('late night: crosses midnight on the same service day', () => {
    const r = getNextBus(ctx(TUE, '23:50'), { from: 'jrha' });
    expect(r.next?.timeLabel).toBe('12:00 AM');
    expect(r.next?.serviceDate).toBe(TUE);
    expect(r.next?.at).toBe(ist(WED, '00:00'));
  });
  it('after midnight: still finds last night’s 1:45 AM from U Corridor', () => {
    const c = ctx(WED, '01:40');
    expect(currentServiceDate(c.now)).toBe(TUE);
    const r = getNextBus(c, { from: 'ucorridor' });
    expect(r.next?.timeLabel).toBe('1:45 AM');
    expect(r.next?.serviceDate).toBe(TUE);
    expect(r.lastToday?.timeLabel).toBe('1:45 AM');
  });
  it('after the last bus: reports done for today and gives tomorrow’s first', () => {
    const r = getNextBus(ctx(WED, '02:00'), { from: 'ucorridor' });
    expect(r.doneForToday).toBe(true);
    expect(r.next?.serviceDate).toBe(WED);
    expect(r.next?.timeLabel).toBe('7:15 AM'); // ★ loop passes U Corridor
    expect(r.next?.boardTimed).toBe(false);
  });
  it('mid stop with destination: Gate 1 → U Corridor', () => {
    const r = getNextBus(ctx(TUE, '12:50'), { from: 'gate1', to: 'ucorridor' });
    expect(r.next?.timeLabel).toBe('1:00 PM');
    expect(r.next?.route.id).toBe('campus-jrha-uc');
    expect(r.next?.boardTimed).toBe(false);
  });
  it('destination only: last bus to JRHA excludes the loop', () => {
    const r = getNextBus(ctx(TUE, '18:00'), { to: 'jrha' });
    expect(r.lastToday?.timeLabel).toBe('1:45 AM');
    expect(r.next?.route.id).toBe('campus-uc-jrha');
  });
  it('Kudasan bus from campus', () => {
    const r = getNextBus(ctx(TUE, '12:00'), { from: 'mess', to: 'kudasan' });
    expect(r.next?.timeLabel).toBe('4:30 PM');
    expect(r.next?.vehicle.id).toBe('INST56');
    expect(r.following.map((d) => d.timeLabel)).toEqual(['5:45 PM', '6:30 PM']);
  });
  it('returns nothing for an impossible ride', () => {
    const r = getNextBus(ctx(TUE, '07:00'), { from: 'ucorridor', to: 'ab1' });
    expect(r.next).toBeNull();
    expect(r.lastToday).toBeNull();
  });
  it('seat counts follow the 56-seater window', () => {
    const deps = departuresForServiceDate(data, TUE, { vehicleId: 'B1' });
    expect(deps.filter((d) => d.trip.seats === 56).map((d) => d.timeLabel)).toEqual([
      '7:15 AM', '7:45 AM', '8:15 AM', '8:45 AM', '9:15 AM', '9:45 AM', '10:15 AM', '10:30 AM', '10:45 AM',
    ]);
  });
});

describe('labels', () => {
  it('describes untimed stops without inventing times', () => {
    const loop = getNextBus(ctx(TUE, '08:00'), { from: 'ucorridor' }).next!;
    expect(boardingNote(loop)).toBe('Leaves JRHA at 8:15 AM, reaches U Corridor after 4 other stops');
    const near = getNextBus(ctx(TUE, '12:50'), { from: 'gate1', to: 'ucorridor' }).next!;
    expect(boardingNote(near)).toBe('Leaves JRHA at 1:00 PM, passes Gate 1 shortly after');
  });
  it('labels days by service day, not calendar day', () => {
    const lateNight = getUpcomingBuses(ctx(TUE, '23:50'), { from: 'jrha' }, { limit: 1 })[0];
    expect(departureDayLabel(lateNight, ist(TUE, '23:50'), relativeDayLabel)).toBeNull();
    const morning = getUpcomingBuses(ctx(WED, '02:00'), { from: 'jrha' }, { limit: 1 })[0];
    expect(departureDayLabel(morning, ist(WED, '02:00'), relativeDayLabel)).toBe('Today');
    const tmr = getUpcomingBuses(ctx(TUE, '23:50'), { from: 'jrha' }, { limit: 10 }).find((d) => d.serviceDate === WED)!;
    expect(departureDayLabel(tmr, ist(TUE, '23:50'), relativeDayLabel)).toBe('Tomorrow');
  });
});

describe('schedules and service exceptions', () => {
  it('has every combined-sheet JRHA departure', () => {
    const s = getBusSchedule(ctx(TUE, '12:00'), TUE, { from: 'jrha', to: 'ucorridor' });
    expect(s.departures).toHaveLength(44);
    expect(s.departures.find((d) => d.key === s.nextKey)?.timeLabel).toBe('12:00 PM');
  });
  it('runs every day (assumed) including weekends', () => {
    for (let k = 0; k < 7; k++) expect(departuresForServiceDate(data, addDays(TUE, k)).length).toBe(102);
  });
  it('honours a no-service exception and skips to the next running day', () => {
    const d: Dataset = { ...data, meta: { ...data.meta, serviceExceptions: [{ date: WED, appliesTo: 'bus', type: 'no_service', note: 'Holiday' }] } };
    const s = getBusSchedule(ctx(WED, '08:00', d), WED);
    expect(s.runs).toBe(false);
    expect(s.reason).toBe('Holiday');
    const r = getNextBus(ctx(WED, '08:00', d), { from: 'jrha' });
    expect(r.next?.serviceDate).toBe('2026-11-05');
    expect(r.next?.timeLabel).toBe('7:15 AM');
    // last night's after-midnight trips still run
    expect(getNextBus(ctx(WED, '00:10', d), { from: 'jrha' }).next?.timeLabel).toBe('12:30 AM');
  });
  it('searches routes by stop, bus and text', () => {
    expect(searchBusRoutes(data.bus, 'AB1').map((r) => r.route.id)).toEqual(['campus-loop']);
    expect(searchBusRoutes(data.bus, 'Jeet Royal').map((r) => r.route.id).sort()).toEqual(['campus-jrha-uc', 'campus-loop', 'campus-uc-jrha']);
    expect(searchBusRoutes(data.bus, 'Kudasan').map((r) => r.route.id)).toEqual(['kudasan-out', 'kudasan-in']);
    expect(searchBusRoutes(data.bus, 'bus 2').length).toBe(3);
  });
  it('upcoming list respects the limit and spans days', () => {
    const list = getUpcomingBuses(ctx(WED, '01:50'), { from: 'jrha' }, { limit: 3 });
    expect(list.map((d) => `${d.serviceDate} ${d.timeLabel}`)).toEqual([`${WED} 7:15 AM`, `${WED} 7:45 AM`, `${WED} 8:15 AM`]);
  });
});

describe('mess', () => {
  it('serving breakfast at 8 AM on Tuesday', () => {
    const s = getMealStatus(ctx(TUE, '08:00'));
    expect(s.state).toBe('serving');
    expect(s.meal.slot.id).toBe('breakfast');
    expect(s.meal.rows?.find((r) => r.categoryId === 'main')?.options[0].name).toBe('Upma');
    expect(s.next?.slot.id).toBe('lunch');
  });
  it('upcoming lunch between meals', () => {
    const s = getMealStatus(ctx(TUE, '11:00'));
    expect(s.state).toBe('upcoming');
    expect(s.meal.slot.id).toBe('lunch');
  });
  it('serving window end is exclusive', () => {
    expect(getCurrentMeal(ctx(TUE, '14:14'))?.slot.id).toBe('lunch');
    expect(getCurrentMeal(ctx(TUE, '14:15'))).toBeNull();
    expect(getNextMeal(ctx(TUE, '14:15'))?.slot.id).toBe('snacks');
  });
  it('after dinner: completed, previews tomorrow’s breakfast', () => {
    expect(getMealStatus(ctx(TUE, '21:29')).state).toBe('serving');
    const s = getMealStatus(ctx(TUE, '21:30'));
    expect(s.state).toBe('completed');
    expect(s.next?.dateKey).toBe(WED);
    expect(s.next?.slot.id).toBe('breakfast');
    expect(rowText(s.next!.rows!.find((r) => r.categoryId === 'main')!)).toBe('Aloo Pyaz Paratha or Mix-Veg Paratha');
  });
  it('after midnight: breakfast today is upcoming', () => {
    const s = getMealStatus(ctx(WED, '01:00'));
    expect(s.state).toBe('upcoming');
    expect(s.meal.dateKey).toBe(WED);
  });
  it('does not invent a menu outside November 2026', () => {
    const s = getMealStatus(ctx('2026-11-30', '22:00'));
    expect(s.next?.dateKey).toBe('2026-12-01');
    expect(s.next?.rows).toBeNull();
    expect(getDailyMenu(data, '2026-12-01').available).toBe(false);
  });
  it('weekly menu runs Monday to Sunday', () => {
    const w = getWeeklyMenu(data, TUE);
    expect(w.map((d) => d.weekday)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    expect(w.every((d) => d.available)).toBe(true);
    const edge = getWeeklyMenu(data, '2026-10-29');
    expect(edge.filter((d) => d.available).map((d) => d.dateKey)).toEqual(['2026-11-01']);
  });
  it('finds dishes and the next day they are served', () => {
    const hits = searchMeals(data, 'paneer', TUE);
    expect(hits[0]).toMatchObject({ name: 'Dhaabe wala Paneer', weekday: 'tuesday', nextDate: TUE, mealId: 'dinner' });
    expect(hits.map((h) => h.weekday).sort()).toEqual(['saturday', 'thursday', 'tuesday']);
    expect(searchMeals(data, 'pizza', TUE)).toEqual([]);
  });
  it('Saturday has no separate non-veg row', () => {
    expect(getDailyMenu(data, '2026-11-07').meals[3].rows?.some((r) => r.categoryId === 'nonveg')).toBe(false);
  });
});

describe('dataset validation', () => {
  it('accepts the bundled dataset', () => {
    const r = validateDataset(data);
    expect(r.errors).toEqual([]);
  });
  it('rejects malformed times, unknown stops and version drift', () => {
    const bad = JSON.parse(JSON.stringify(data));
    bad.bus.trips[0].departure = '7.15';
    bad.bus.routes[0].stops.push('nowhere');
    bad.mess.dataVersion = '0.0.1';
    const r = validateDataset(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/bad departure/);
    expect(r.errors.join('\n')).toMatch(/unknown stop nowhere/);
    expect(r.errors.join('\n')).toMatch(/dataVersion mismatch/);
  });
  it('compares versions numerically', () => {
    expect(compareVersions('2026.11.10', '2026.11.9')).toBeGreaterThan(0);
    expect(compareVersions('2026.11.1', '2026.11.1')).toBe(0);
  });
});
