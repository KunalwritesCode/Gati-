// Runtime validation for datasets fetched over the network. Anything that
// fails here is rejected and the app keeps using the data it already has.

import { hhmmToMinutes, isDateKey, isHHMM } from './time';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const MEAL_IDS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function validateDataset(d: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  if (!isObj(d)) return { ok: false, errors: ['dataset is not an object'] };
  const { bus, mess, meta } = d as Record<string, unknown>;

  // ---- bus
  if (!isObj(bus)) err('bus missing');
  else {
    if (bus.schemaVersion !== 1) err('bus.schemaVersion must be 1');
    const stops = Array.isArray(bus.stops) ? bus.stops : (err('bus.stops missing'), []);
    const stopIds = new Set<string>();
    for (const s of stops) {
      if (!isObj(s) || typeof s.id !== 'string' || typeof s.name !== 'string' || !Array.isArray(s.aliases)) err(`bad stop ${JSON.stringify(s)}`);
      else if (stopIds.has(s.id)) err(`duplicate stop ${s.id}`);
      else stopIds.add(s.id);
    }
    const routeIds = new Set<string>();
    for (const r of Array.isArray(bus.routes) ? bus.routes : (err('bus.routes missing'), [])) {
      if (!isObj(r) || typeof r.id !== 'string' || !Array.isArray(r.stops) || r.stops.length < 2) {
        err(`bad route ${JSON.stringify(r)}`);
        continue;
      }
      routeIds.add(r.id);
      for (const s of r.stops) if (!stopIds.has(s as string)) err(`route ${r.id} has unknown stop ${s}`);
    }
    const vehicleIds = new Set<string>();
    for (const v of Array.isArray(bus.vehicles) ? bus.vehicles : (err('bus.vehicles missing'), [])) {
      if (isObj(v) && typeof v.id === 'string' && typeof v.name === 'string') vehicleIds.add(v.id);
      else err('bad vehicle');
    }
    const calIds = new Set<string>();
    for (const c of Array.isArray(bus.calendars) ? bus.calendars : (err('bus.calendars missing'), [])) {
      if (isObj(c) && typeof c.id === 'string' && Array.isArray(c.days) && c.days.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6)) calIds.add(c.id);
      else err('bad calendar');
    }
    const tripIds = new Set<string>();
    const trips = Array.isArray(bus.trips) ? bus.trips : (err('bus.trips missing'), []);
    if (trips.length === 0) err('no trips');
    for (const t of trips) {
      if (!isObj(t)) {
        err('bad trip');
        continue;
      }
      if (typeof t.id !== 'string' || tripIds.has(t.id)) err(`bad or duplicate trip id ${t.id}`);
      else tripIds.add(t.id);
      if (!routeIds.has(t.routeId as string)) err(`trip ${t.id} unknown route`);
      if (!vehicleIds.has(t.vehicleId as string)) err(`trip ${t.id} unknown vehicle`);
      if (!calIds.has(t.calendarId as string)) err(`trip ${t.id} unknown calendar`);
      if (!isHHMM(t.departure)) err(`trip ${t.id} bad departure ${t.departure}`);
      else if (hhmmToMinutes(t.departure as string) >= 30 * 60) err(`trip ${t.id} departure past 30:00`);
    }
  }

  // ---- mess
  if (!isObj(mess)) err('mess missing');
  else {
    if (mess.schemaVersion !== 1) err('mess.schemaVersion must be 1');
    if (!isDateKey(mess.validFrom) || !isDateKey(mess.validTo)) err('mess validity dates invalid');
    else if ((mess.validFrom as string) > (mess.validTo as string)) err('mess validFrom after validTo');
    const meals = Array.isArray(mess.meals) ? mess.meals : (err('mess.meals missing'), []);
    let prevEnd = -1;
    for (const m of meals) {
      if (!isObj(m) || !MEAL_IDS.includes(m.id as string) || !isHHMM(m.start) || !isHHMM(m.end)) {
        err(`bad meal ${JSON.stringify(m)}`);
        continue;
      }
      const s = hhmmToMinutes(m.start as string);
      const e = hhmmToMinutes(m.end as string);
      if (s >= e) err(`meal ${m.id} starts after it ends`);
      if (s < prevEnd) err(`meal ${m.id} overlaps previous`);
      prevEnd = e;
    }
    if (!isObj(mess.days)) err('mess.days missing');
    else
      for (const wd of WEEKDAYS) {
        const day = (mess.days as Record<string, unknown>)[wd];
        if (!isObj(day)) {
          err(`mess.days.${wd} missing`);
          continue;
        }
        for (const [mealId, rows] of Object.entries(day)) {
          if (!MEAL_IDS.includes(mealId) || !Array.isArray(rows)) err(`mess.days.${wd}.${mealId} invalid`);
          else
            for (const r of rows)
              if (!isObj(r) || typeof r.category !== 'string' || !Array.isArray(r.options) || r.options.length === 0 || !r.options.every((o) => isObj(o) && typeof o.name === 'string' && o.name.length > 0 && o.name.length < 200))
                err(`mess.days.${wd}.${mealId} has a bad row`);
        }
      }
  }

  // ---- meta
  if (!isObj(meta)) err('meta missing');
  else {
    if (typeof meta.dataVersion !== 'string') err('meta.dataVersion missing');
    if (!Array.isArray(meta.serviceExceptions)) err('meta.serviceExceptions missing');
    else for (const e of meta.serviceExceptions) if (!isObj(e) || !isDateKey(e.date)) err('bad service exception');
    if (isObj(meta.validation) && meta.validation.status !== 'passed') err('dataset did not pass build validation');
  }

  if (isObj(bus) && isObj(mess) && isObj(meta)) {
    if (bus.dataVersion !== meta.dataVersion || mess.dataVersion !== meta.dataVersion) err('dataVersion mismatch between files');
  }
  return { ok: errors.length === 0, errors };
}

/** "2026.11.1" > "2026.10.3"; returns positive when a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
